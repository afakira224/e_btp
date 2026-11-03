import type { Request, Response } from "express";
import mongoose from "mongoose";
import { validationResult } from "express-validator";
import {
  Promotion,
  PromotionScope,
  PromotionStatus,
  PromotionType,
  DiscountType,
  type IPromotion,
} from "../models/promotion.model.js";
import { Cart, type ICart } from "../models/cart.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js";
import { isPromotionActive, toPromotionResponseDto } from "../shared/interfaces/Promotion.interfaces.js";
import { productBoutique } from "../models/product.model.js";
import { Shop } from "../models/boutique.model.js";
import { unitPriceFor } from "../shared/helpers/promotion.rules.js";
import { customerUsedCode, evaluateCoupon } from "../shared/services/pricing.service.js";

const SHOP_PROMOTION_ELSEWHERE = "Une promotion de boutique se gère depuis l'espace de sa boutique.";

// Calcule la réduction applicable à un panier pour une promotion donnée.
// base = total (scope panier) ou somme des lignes éligibles (scope product_boutique).
const computeCartDiscount = (promo: IPromotion, cart: ICart): { base: number; discount: number } => {
  let base = 0;
  if (promo.scope === PromotionScope.CART) {
    base = cart.amount;
  } else {
    const ids = new Set(promo.productBoutiqueIds.map((id) => id.toString()));
    base = cart.items
      .filter((i) => ids.has(i.productBoutiqueId.toString()))
      .reduce((sum, i) => sum + i.price * i.quantity, 0);
  }

  let discount =
    promo.discountType === DiscountType.PERCENTAGE
      ? (base * promo.discountValue) / 100
      : promo.discountValue;

  if (promo.maxDiscount != null) discount = Math.min(discount, promo.maxDiscount);
  discount = Math.min(discount, base);
  discount = Math.max(0, Math.round(discount));

  return { base, discount };
};

// ─────────────────────────────────────────────
//  POST /promotions
// ─────────────────────────────────────────────
export const createPromotion = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const {
      nom, description, type, scope,
      discountType = DiscountType.PERCENTAGE,
      discountValue, code, startDate, endDate,
      productBoutiqueIds = [], minAmount, maxDiscount, usageLimit, actif,
    } = req.body;

    // Contrôles inter-champs
    if (new Date(endDate) <= new Date(startDate)) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest("La date de fin doit être postérieure à la date de début.");
      return res.status(response.statusCode).json(response);
    }
    if (discountType === DiscountType.PERCENTAGE && discountValue > 100) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest("Un pourcentage de réduction ne peut pas dépasser 100.");
      return res.status(response.statusCode).json(response);
    }
    if (type === PromotionType.COUPON && !code) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest("Un code est requis pour une promotion de type coupon.");
      return res.status(response.statusCode).json(response);
    }
    if (scope === PromotionScope.PRODUCT_BOUTIQUE && (!Array.isArray(productBoutiqueIds) || productBoutiqueIds.length === 0)) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest("Au moins un produit en boutique doit être ciblé.");
      return res.status(response.statusCode).json(response);
    }

    const normalizedCode = code ? String(code).toUpperCase().trim() : null;

    if (normalizedCode) {
      const existing = await Promotion.findOne({ code: normalizedCode }).session(session);
      if (existing) {
        await session.abortTransaction();
        logger.warn(`Code promo déjà utilisé : ${normalizedCode}`);
        const response = BaseResponse.Conflict("Ce code promotionnel existe déjà.");
        return res.status(response.statusCode).json(response);
      }
    }

    logger.info(`Création promotion : ${nom} (${type} / ${scope})`);

    const [promo] = await Promotion.create(
      [{
        nom, description, type, scope, discountType, discountValue,
        code: normalizedCode,
        startDate, endDate,
        productBoutiqueIds: scope === PromotionScope.PRODUCT_BOUTIQUE ? productBoutiqueIds : [],
        minAmount, maxDiscount, usageLimit,
        actif: actif ?? true,
      }],
      { session }
    );

    // create() renvoie un tableau : après un succès, le document est bien présent.
    if (!promo) throw new Error("La création de la promotion a échoué.");

    await session.commitTransaction();

    logger.info(`Promotion créée : ${promo._id}`);

    const response = BaseResponse.Created(toPromotionResponseDto(promo), "Promotion créée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur création promotion : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  GET /promotions?type=&scope=&actif=&activeNow=&page=&limit=
// ─────────────────────────────────────────────
export const getPromotions = async (req: Request, res: Response) => {
  try {
    const { type, scope, actif, activeNow, page = "1", limit = "10" } = req.query;

    // Les promotions de boutique se lisent depuis leur boutique (/shops/:id/promotions).
    const filter: Record<string, unknown> = { boutiqueId: null };
    if (type) filter.type = type;
    if (scope) filter.scope = scope;
    if (actif !== undefined) filter.actif = actif === "true";

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const [promotions, total] = await Promise.all([
      Promotion.find(filter).skip(skip).limit(limitNum).sort({ createdAt: -1 }),
      Promotion.countDocuments(filter),
    ]);

    const now = new Date();
    let promotionsDto = promotions.map((p) => toPromotionResponseDto(p, now));

    // Filtre optionnel : uniquement les promotions actuellement actives.
    if (activeNow === "true") {
      promotionsDto = promotionsDto.filter((p) => p.isActive);
    }

    logger.info(`Liste promotions — total : ${total}`);

    const response = BaseResponse.WithSuccess(
      {
        promotions: promotionsDto,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
      "Promotions récupérées avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur liste promotions : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  GET /promotions/:id
// ─────────────────────────────────────────────
export const getPromotionById = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const id = String(req.params.id);

    const promo = await Promotion.findById(id);
    if (!promo || promo.boutiqueId) {
      logger.warn(`Promotion introuvable : ${id}`);
      const response = BaseResponse.NotFound("Promotion non trouvée");
      return res.status(response.statusCode).json(response);
    }

    const response = BaseResponse.WithSuccess(toPromotionResponseDto(promo), "Promotion récupérée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur récupération promotion : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  PUT /promotions/:id
// ─────────────────────────────────────────────
export const updatePromotion = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const id = String(req.params.id);
    const {
      nom, description, type, scope, discountType, discountValue,
      code, startDate, endDate, productBoutiqueIds, minAmount, maxDiscount, usageLimit, actif,
    } = req.body;

    const promo = await Promotion.findById(id).session(session);
    if (!promo) {
      await session.abortTransaction();
      logger.warn(`Promotion introuvable pour mise à jour : ${id}`);
      const response = BaseResponse.NotFound("Promotion non trouvée");
      return res.status(response.statusCode).json(response);
    }
    // L'administration ne touche pas aux promotions d'une boutique.
    if (promo.boutiqueId) {
      await session.abortTransaction();
      const response = BaseResponse.Forbidden(SHOP_PROMOTION_ELSEWHERE);
      return res.status(response.statusCode).json(response);
    }

    if (nom !== undefined) promo.nom = nom;
    if (description !== undefined) promo.description = description;
    if (type !== undefined) promo.type = type;
    if (scope !== undefined) promo.scope = scope;
    if (discountType !== undefined) promo.discountType = discountType;
    if (discountValue !== undefined) promo.discountValue = discountValue;
    if (startDate !== undefined) promo.startDate = startDate;
    if (endDate !== undefined) promo.endDate = endDate;
    if (productBoutiqueIds !== undefined) promo.productBoutiqueIds = productBoutiqueIds;
    if (minAmount !== undefined) promo.minAmount = minAmount;
    if (maxDiscount !== undefined) promo.maxDiscount = maxDiscount;
    if (usageLimit !== undefined) promo.usageLimit = usageLimit;
    if (actif !== undefined) promo.actif = actif;

    // Changement de code : normalisation + contrôle d'unicité.
    if (code !== undefined) {
      const normalizedCode = code ? String(code).toUpperCase().trim() : null;
      if (normalizedCode && normalizedCode !== promo.code) {
        const existing = await Promotion.findOne({ code: normalizedCode, _id: { $ne: id } }).session(session);
        if (existing) {
          await session.abortTransaction();
          logger.warn(`Code promo déjà utilisé : ${normalizedCode}`);
          const response = BaseResponse.Conflict("Ce code promotionnel existe déjà.");
          return res.status(response.statusCode).json(response);
        }
      }
      promo.code = normalizedCode;
    }

    // Contrôles inter-champs sur l'état final.
    if (promo.endDate <= promo.startDate) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest("La date de fin doit être postérieure à la date de début.");
      return res.status(response.statusCode).json(response);
    }
    if (promo.discountType === DiscountType.PERCENTAGE && promo.discountValue > 100) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest("Un pourcentage de réduction ne peut pas dépasser 100.");
      return res.status(response.statusCode).json(response);
    }
    if (promo.type === PromotionType.COUPON && !promo.code) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest("Un code est requis pour une promotion de type coupon.");
      return res.status(response.statusCode).json(response);
    }
    if (promo.scope === PromotionScope.PRODUCT_BOUTIQUE && promo.productBoutiqueIds.length === 0) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest("Au moins un produit en boutique doit être ciblé.");
      return res.status(response.statusCode).json(response);
    }

    logger.info(`Mise à jour promotion : ${id}`);

    await promo.save({ session });
    await session.commitTransaction();

    const response = BaseResponse.WithSuccess(toPromotionResponseDto(promo), "Promotion mise à jour avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur mise à jour promotion : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  DELETE /promotions/:id (soft delete)
// ─────────────────────────────────────────────
export const deletePromotion = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const id = String(req.params.id);

    logger.info(`Suppression promotion : ${id}`);

    const promo = await Promotion.findById(id).session(session);
    if (!promo) {
      await session.abortTransaction();
      logger.warn(`Promotion introuvable pour suppression : ${id}`);
      const response = BaseResponse.NotFound("Promotion non trouvée");
      return res.status(response.statusCode).json(response);
    }
    if (promo.boutiqueId) {
      await session.abortTransaction();
      const response = BaseResponse.Forbidden(SHOP_PROMOTION_ELSEWHERE);
      return res.status(response.statusCode).json(response);
    }

    promo.deletedAt = new Date();
    await promo.save({ session });
    await session.commitTransaction();

    logger.info(`Promotion supprimée (soft) : ${id}`);

    const response = BaseResponse.WithSuccess(null, "Promotion supprimée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur suppression promotion : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  POST /promotions/apply   { userId, code }
//  Valide un coupon et calcule la réduction sur le panier de l'utilisateur (sans le modifier).
// ─────────────────────────────────────────────
export const applyCoupon = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const { userId, code } = req.body;
    const normalizedCode = String(code).toUpperCase().trim();

    logger.info(`Application coupon ${normalizedCode} pour utilisateur ${userId}`);

    const promo = await Promotion.findOne({ code: normalizedCode });
    if (!promo) {
      logger.warn(`Coupon introuvable : ${normalizedCode}`);
      const response = BaseResponse.NotFound("Coupon introuvable");
      return res.status(response.statusCode).json(response);
    }

    const cart = await Cart.findOne({ userId });
    if (!cart || cart.items.length === 0) {
      const response = BaseResponse.BadRequest("Le panier est vide.");
      return res.status(response.statusCode).json(response);
    }

    // Mêmes règles qu'au checkout : prix du moment, part de la boutique pour
    // un code de boutique, articles déjà en promotion exclus s'il n'est pas cumulable.
    const now = new Date();
    const offers = await productBoutique.find({ _id: { $in: cart.items.map((item) => item.productBoutiqueId) } });
    const lines = cart.items.flatMap((item) => {
      const offer = offers.find((candidate) => String(candidate._id) === String(item.productBoutiqueId));
      if (!offer) return [];
      const price = unitPriceFor(offer, item.quantity);
      return [{ productBoutiqueId: offer._id, boutiqueId: offer.boutiqueId, price, quantity: item.quantity, promoted: price < offer.price }];
    });
    const result = evaluateCoupon(promo, lines, now);
    if (result.error) {
      logger.warn(`Coupon refusé : ${normalizedCode} (${result.error})`);
      const response = BaseResponse.BadRequest(result.error);
      return res.status(response.statusCode).json(response);
    }
    if (promo.perCustomerLimit != null && (await customerUsedCode(userId, normalizedCode)) >= promo.perCustomerLimit) {
      const response = BaseResponse.BadRequest(promo.perCustomerLimit === 1 ? "Vous avez déjà utilisé ce code." : `Ce code s'utilise ${promo.perCustomerLimit} fois par client.`);
      return res.status(response.statusCode).json(response);
    }
    const discount = result.discount;
    const shop = result.boutiqueId ? await Shop.findById(result.boutiqueId).select("nom") : null;

    const totalBefore = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const totalAfter = Math.max(0, totalBefore - discount);

    logger.info(`Coupon ${normalizedCode} appliqué : -${discount} (${totalBefore} → ${totalAfter})`);

    const response = BaseResponse.WithSuccess(
      {
        promotion: toPromotionResponseDto(promo),
        totalBefore,
        discountAmount: discount,
        totalAfter,
        // Code de boutique : il ne porte que sur ses articles.
        ...(shop ? { boutique: { id: String(shop._id), nom: shop.nom } } : {}),
      },
      "Coupon appliqué avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur application coupon : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  GET /promotions/flash/active
//  Ventes flash actuellement actives (pour afficher les prix promo côté front).
// ─────────────────────────────────────────────
export const getActiveFlashSales = async (_req: Request, res: Response) => {
  try {
    const now = new Date();

    const promotions = await Promotion.find({
      type: PromotionType.FLASH_SALE,
      actif: true,
      status: { $nin: [PromotionStatus.DRAFT, PromotionStatus.PAUSED, PromotionStatus.STOPPED] },
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).sort({ endDate: 1 });

    // Les plus proches de leur fin d'abord ; une vente flash de boutique porte son nom.
    const live = promotions.filter((p) => isPromotionActive(p, now) && (p.flashQuantity == null || p.flashSold < p.flashQuantity));
    const shops = await Shop.find({ _id: { $in: live.flatMap((p) => (p.boutiqueId ? [p.boutiqueId] : [])) } }).select("nom");
    const active = live.map((p) => {
      const shop = shops.find((candidate) => String(candidate._id) === String(p.boutiqueId));
      return {
        ...toPromotionResponseDto(p, now),
        // Un code de boutique ne s'affiche jamais ici ; une vente flash n'en a pas.
        code: null,
        ...(shop ? { boutique: { id: String(shop._id), nom: shop.nom } } : {}),
        ...(p.flashQuantity != null ? { flashLeft: Math.max(0, p.flashQuantity - p.flashSold) } : {}),
      };
    });

    logger.info(`Ventes flash actives : ${active.length}`);

    const response = BaseResponse.WithSuccess(active, "Ventes flash actives récupérées avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur récupération ventes flash : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};
