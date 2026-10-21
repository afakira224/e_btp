import type { Request, Response } from "express";
import { validationResult } from "express-validator";
import { Shop, type IShop } from "../models/boutique.model.js";
import { Product, productBoutique } from "../models/product.model.js";
import { Cart } from "../models/cart.model.js";
import { CURRENCY } from "../models/delivery.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js";
import {
  normalizeSettings,
  quoteDelivery,
  selectionFromBody,
  validateDeliverySettings,
  type DeliveryQuoteLine,
} from "../shared/helpers/delivery.helper.js";
import { canManageShop, SHOP_FORBIDDEN_MESSAGE } from "../shared/helpers/shopAccess.js";
import { toShopDeliveryResponseDto } from "../shared/interfaces/Delivery.interfaces.js";

// Portée des réglages d'une boutique : combien de produits les suivent.
// Une offre antérieure à cette option n'a pas de champ delivery : elle hérite.
const countProducts = async (shop: IShop) => {
  const [total, customProducts] = await Promise.all([
    productBoutique.countDocuments({ boutiqueId: shop._id }),
    productBoutique.countDocuments({ boutiqueId: shop._id, "delivery.useShopSettings": false }),
  ]);
  return { inheritingProducts: total - customProducts, customProducts };
};

// ─────────────────────────────────────────────
//  GET /shops/:id/delivery
//  Lecture publique : ce sont les conditions affichées aux clients.
// ─────────────────────────────────────────────
export const getShopDelivery = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const id = String(req.params.id);

    const shop = await Shop.findById(id);
    if (!shop) {
      logger.warn(`Boutique introuvable : ${id}`);
      const response = BaseResponse.NotFound("Boutique introuvable.");
      return res.status(response.statusCode).json(response);
    }

    const dto = toShopDeliveryResponseDto(shop, await countProducts(shop));
    const response = BaseResponse.WithSuccess(dto, "Livraison de la boutique récupérée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur récupération livraison boutique : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  PUT /shops/:id/delivery   { modes, flatRateFee? }
//  Les produits qui héritent suivent immédiatement : ils lisent les réglages
//  de la boutique à chaque calcul, rien n'est recopié chez eux. Les produits
//  personnalisés ne sont pas touchés.
// ─────────────────────────────────────────────
export const updateShopDelivery = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const id = String(req.params.id);
    const { modes, flatRateFee } = req.body as { modes: string[]; flatRateFee?: number | null };

    const shop = await Shop.findById(id);
    if (!shop) {
      logger.warn(`Boutique introuvable pour la livraison : ${id}`);
      const response = BaseResponse.NotFound("Boutique introuvable.");
      return res.status(response.statusCode).json(response);
    }

    if (!canManageShop(req.user, shop)) {
      logger.warn(`Livraison de la boutique ${id} : accès refusé à ${req.user?.id}`);
      const response = BaseResponse.Forbidden(SHOP_FORBIDDEN_MESSAGE);
      return res.status(response.statusCode).json(response);
    }

    const invalid = validateDeliverySettings({ modes, flatRateFee }, shop);
    if (invalid) {
      const response = BaseResponse.BadRequest(invalid);
      return res.status(response.statusCode).json(response);
    }

    shop.delivery = normalizeSettings(modes, flatRateFee);
    await shop.save();

    logger.info(`Livraison de la boutique ${id} : ${shop.delivery.modes.join(", ")}`);

    const dto = toShopDeliveryResponseDto(shop, await countProducts(shop));
    const response = BaseResponse.WithSuccess(dto, "Livraison de la boutique mise à jour.");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur mise à jour livraison boutique : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  POST /cart/:userId/delivery-quote   { deliveries?, deliveryMethod? }
//  Modes et frais réellement applicables au panier, une livraison par
//  boutique. Même calcul que le checkout : le montant affiché est celui qui
//  sera facturé. Aucune écriture.
// ─────────────────────────────────────────────
export const getDeliveryQuote = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const userId = String(req.params.userId);

    const cart = await Cart.findOne({ userId });
    if (!cart || cart.items.length === 0) {
      const response = BaseResponse.WithSuccess(
        { groups: [], shippingFee: 0, ready: false, currency: CURRENCY, subtotal: 0, total: 0 },
        "Panier vide : aucune livraison à calculer"
      );
      return res.status(response.statusCode).json(response);
    }

    const offers = await productBoutique.find({ _id: { $in: cart.items.map(i => i.productBoutiqueId) } });
    const [products, shops] = await Promise.all([
      Product.find({ _id: { $in: offers.map(o => o.productId) } }),
      Shop.find({ _id: { $in: [...new Set(offers.map(o => o.boutiqueId.toString()))] } }),
    ]);

    // Une offre retirée de la vente n'a plus de livraison : le panier la
    // signale déjà, et le checkout la refuse.
    const lines: DeliveryQuoteLine[] = cart.items.flatMap((item) => {
      const offer = offers.find(o => o._id.toString() === item.productBoutiqueId.toString());
      if (!offer) return [];
      const product = products.find(p => p._id.toString() === offer.productId.toString());
      return [{ offer, quantity: item.quantity, productName: product?.name }];
    });

    const quote = quoteDelivery(lines, shops, selectionFromBody(req.body));

    logger.info(`Devis de livraison pour ${userId} : ${quote.groups.length} livraison(s), ${quote.shippingFee} ${CURRENCY}`);

    const response = BaseResponse.WithSuccess(
      // Coupon exclu : il ne s'applique qu'au checkout, sur les articles.
      { ...quote, subtotal: cart.amount, total: cart.amount + quote.shippingFee },
      "Devis de livraison calculé"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur devis de livraison : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};
