import type { Request, Response } from "express";
import mongoose from "mongoose";
import { validationResult } from "express-validator";
import {
  ALLOWED_STATUS_TRANSITIONS,
  DeliveryMethod,
  Order,
  OrderStatus,
  type IOrder,
  type IOrderItem,
  type IShippingAddress,
} from "../models/order.model.js";
import { Cart } from "../models/cart.model.js";
import { Address } from "../models/address.model.js";
import { Product, productBoutique } from "../models/product.model.js";
import { Shop } from "../models/boutique.model.js";
import { Famille } from "../models/famille.model.js";
import { Categorie } from "../models/categorie.model.js";
import { SousCategorie } from "../models/sousCategorie.model.js";
import { User } from "../models/user.model.js";
import { Promotion, PromotionScope } from "../models/promotion.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js";
import { toOrderResponseDto, type OrderResponseDto } from "../shared/interfaces/Order.interfaces.js";
import { computePromotionDiscount, isPromotionActive } from "../shared/interfaces/Promotion.interfaces.js";
import {
  quoteDelivery,
  selectionFromBody,
  summaryMethod,
  toOrderDeliveries,
} from "../shared/helpers/delivery.helper.js";
import {
  sendOrderConfirmationMail,
  sendOrderStatusMail,
} from "../shared/helpers/mail.helper.js";

// Génère une référence de commande lisible et raisonnablement unique.
const generateReference = (): string => {
  const suffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  return `CMD-${suffix}`;
};

// Résout les documents (product_boutique, boutique, produit + taxonomie) référencés par
// une liste de commandes, puis construit les DTOs enrichis. Lecture hors transaction.
const enrichOrders = async (orders: IOrder[]): Promise<OrderResponseDto[]> => {
  const pbIds = new Set<string>();
  const shopIds = new Set<string>();
  const productIds = new Set<string>();

  for (const order of orders) {
    for (const item of order.items) {
      pbIds.add(item.productBoutiqueId.toString());
      if (item.boutiqueId) shopIds.add(item.boutiqueId.toString());
      if (item.productId) productIds.add(item.productId.toString());
    }
  }

  const [productBoutiques, shops, products] = await Promise.all([
    productBoutique.find({ _id: { $in: [...pbIds] } }),
    Shop.find({ _id: { $in: [...shopIds] } }),
    Product.find({ _id: { $in: [...productIds] } }),
  ]);

  const familleIds = [...new Set(products.map(p => p.familleId?.toString()).filter(Boolean))];
  const categoryIds = [...new Set(products.map(p => p.categoryId?.toString()).filter(Boolean))];
  const sousCategoryIds = [...new Set(products.map(p => p.sousCategoryId?.toString()).filter(Boolean))];

  const [familles, categories, sousCategories] = await Promise.all([
    Famille.find({ _id: { $in: familleIds } }),
    Categorie.find({ _id: { $in: categoryIds } }),
    SousCategorie.find({ _id: { $in: sousCategoryIds } }),
  ]);

  return orders.map(order =>
    toOrderResponseDto(order, productBoutiques, shops, products, familles, categories, sousCategories)
  );
};

// Enrichit une seule commande.
const buildOrderDto = async (order: IOrder): Promise<OrderResponseDto> =>
  (await enrichOrders([order]))[0]!;

// ─────────────────────────────────────────────
//  POST /orders/:userId   (checkout depuis le panier)
//  { addressId?, deliveries?, deliveryMethod?, telephone?, adresse?, code? }
//  Une livraison par boutique : le client choisit son mode parmi ceux que
//  tous les articles de la boutique acceptent. Les frais sont calculés ici,
//  jamais lus dans la requête.
// ─────────────────────────────────────────────
export const createOrder = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const userId = String(req.params.userId);
    const { telephone, adresse, code, addressId } = req.body;

    logger.info(`Création commande (checkout) pour utilisateur : ${userId}`);

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      logger.warn(`Utilisateur introuvable : ${userId}`);
      const response = BaseResponse.NotFound("Utilisateur introuvable");
      return res.status(response.statusCode).json(response);
    }

    const cart = await Cart.findOne({ userId }).session(session);
    if (!cart || cart.items.length === 0) {
      await session.abortTransaction();
      logger.warn(`Panier vide pour utilisateur : ${userId}`);
      const response = BaseResponse.BadRequest("Le panier est vide.");
      return res.status(response.statusCode).json(response);
    }

    // Requêtes séquentielles au sein de la transaction (jamais de Promise.all sur une même session).
    const pbIds = cart.items.map(i => i.productBoutiqueId);
    const productBoutiques = await productBoutique.find({ _id: { $in: pbIds } }).session(session);
    const products = await Product.find({
      _id: { $in: productBoutiques.map(pb => pb.productId) },
    }).session(session);

    const missing = cart.items.find(
      item => !productBoutiques.some(p => p._id.toString() === item.productBoutiqueId.toString())
    );
    if (missing) {
      await session.abortTransaction();
      logger.warn(`Produit en boutique indisponible : ${missing.productBoutiqueId}`);
      const response = BaseResponse.BadRequest(
        `Un produit du panier n'est plus disponible (${missing.productBoutiqueId}).`
      );
      return res.status(response.statusCode).json(response);
    }

    // ── Livraisons : une par boutique ───────────────────────
    // Les réglages sont lus dans la transaction : la commande fige ceux en
    // vigueur à cet instant.
    const shops = await Shop.find({
      _id: { $in: [...new Set(productBoutiques.map(pb => pb.boutiqueId.toString()))] },
    }).session(session);

    const quote = quoteDelivery(
      cart.items.map(item => {
        const offer = productBoutiques.find(p => p._id.toString() === item.productBoutiqueId.toString())!;
        const product = products.find(pr => pr._id.toString() === offer.productId.toString());
        return { offer, quantity: item.quantity, productName: product?.name };
      }),
      shops,
      selectionFromBody(req.body)
    );

    if (!quote.ready) {
      await session.abortTransaction();
      const reason = quote.groups.find(g => g.error)?.error ?? "Aucune livraison possible pour ce panier.";
      logger.warn(`Checkout refusé pour ${userId} : ${reason}`);
      const response = BaseResponse.BadRequest(reason);
      return res.status(response.statusCode).json(response);
    }

    const deliveries = toOrderDeliveries(quote);
    const deliveryMethod = summaryMethod(deliveries.map(d => d.method));

    // ── Adresse de livraison ────────────────────────────────
    // Une adresse enregistrée est copiée dans la commande (snapshot) : si le
    // client la modifie ou la supprime ensuite, la commande reste intacte.
    let shippingAddress: IShippingAddress | undefined;
    let resolvedAddressId: mongoose.Types.ObjectId | null = null;

    // Une seule livraison à domicile suffit à exiger une adresse.
    const requiresAddress = deliveries.some(d => d.method !== DeliveryMethod.PICKUP);

    if (addressId) {
      const address = await Address.findById(addressId).session(session);
      if (!address) {
        await session.abortTransaction();
        logger.warn(`Adresse de livraison introuvable : ${addressId}`);
        const response = BaseResponse.NotFound("Adresse de livraison introuvable");
        return res.status(response.statusCode).json(response);
      }

      if (address.userId.toString() !== String(userId)) {
        await session.abortTransaction();
        logger.warn(`Adresse ${addressId} n'appartient pas à l'utilisateur ${userId}`);
        const response = BaseResponse.Forbidden("Cette adresse ne vous appartient pas.");
        return res.status(response.statusCode).json(response);
      }

      resolvedAddressId = address._id;
      shippingAddress = {
        destinataire: address.destinataire,
        telephone: address.telephone,
        adresse: address.adresse,
        ville: address.ville,
        commune: address.commune,
        pays: address.pays,
      };
    } else if (requiresAddress && !adresse) {
      // Ni adresse enregistrée, ni adresse libre : la livraison est impossible.
      await session.abortTransaction();
      const response = BaseResponse.BadRequest(
        "Une adresse de livraison est requise (addressId ou adresse)."
      );
      return res.status(response.statusCode).json(response);
    }

    const orderItems: IOrderItem[] = [];

    // Vérification de stock + décrémentation (séquentielle car même session de transaction).
    for (const item of cart.items) {
      // Présence vérifiée plus haut.
      const pb = productBoutiques.find(
        p => p._id.toString() === item.productBoutiqueId.toString()
      )!;

      if (pb.stock < item.quantity) {
        await session.abortTransaction();
        logger.warn(`Stock insuffisant pour ${pb._id} : demandé ${item.quantity}, dispo ${pb.stock}`);
        const response = BaseResponse.BadRequest(
          `Stock insuffisant pour un produit (disponible : ${pb.stock}).`
        );
        return res.status(response.statusCode).json(response);
      }

      pb.stock -= item.quantity;
      await pb.save({ session });

      const product = products.find(pr => pr._id.toString() === pb.productId.toString());

      orderItems.push({
        productBoutiqueId: pb._id,
        boutiqueId: pb.boutiqueId,
        productId: pb.productId,
        productName: product?.name,
        urlImages: pb.urlImages,
        price: item.price,
        quantity: item.quantity,
      });
    }

    const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    // Application éventuelle d'un coupon.
    let discountAmount = 0;
    let promotionCode: string | null = null;

    if (code) {
      const normalizedCode = String(code).toUpperCase().trim();
      const promo = await Promotion.findOne({ code: normalizedCode }).session(session);

      if (!promo) {
        await session.abortTransaction();
        logger.warn(`Coupon introuvable au checkout : ${normalizedCode}`);
        const response = BaseResponse.NotFound("Coupon introuvable");
        return res.status(response.statusCode).json(response);
      }

      if (!isPromotionActive(promo)) {
        await session.abortTransaction();
        logger.warn(`Coupon inactif/expiré au checkout : ${normalizedCode}`);
        const response = BaseResponse.BadRequest("Ce coupon n'est pas valide (inactif, expiré ou épuisé).");
        return res.status(response.statusCode).json(response);
      }

      if (promo.scope === PromotionScope.CART && promo.minAmount && subtotal < promo.minAmount) {
        await session.abortTransaction();
        const response = BaseResponse.BadRequest(
          `Montant minimum non atteint pour ce coupon (requis : ${promo.minAmount}).`
        );
        return res.status(response.statusCode).json(response);
      }

      discountAmount = computePromotionDiscount(promo, orderItems);
      if (discountAmount <= 0) {
        await session.abortTransaction();
        const response = BaseResponse.BadRequest("Aucun article de la commande n'est éligible à ce coupon.");
        return res.status(response.statusCode).json(response);
      }

      // Décompte de l'utilisation du coupon.
      promo.usedCount += 1;
      await promo.save({ session });
      promotionCode = normalizedCode;

      logger.info(`Coupon ${normalizedCode} appliqué au checkout : -${discountAmount}`);
    }

    // La réduction ne s'applique qu'aux articles ; les frais de port s'ajoutent ensuite.
    const shippingFee = quote.shippingFee;
    const amount = Math.max(0, subtotal - discountAmount) + shippingFee;

    const [order] = await Order.create(
      [{
        userId,
        reference: generateReference(),
        items: orderItems,
        subtotal,
        discountAmount,
        promotionCode,
        shippingFee,
        amount,
        status: OrderStatus.PENDING,
        // Première entrée de l'historique : la création de la commande.
        statusHistory: [
          {
            status: OrderStatus.PENDING,
            changedAt: new Date(),
            changedBy: userId,
            note: "Commande créée",
          },
        ],
        deliveryMethod,
        deliveries,
        addressId: resolvedAddressId,
        // La clé n'est ajoutée que si une adresse a été résolue (retrait en boutique : aucune).
        ...(shippingAddress ? { shippingAddress } : {}),
        telephone: telephone ?? shippingAddress?.telephone,
        adresse: adresse ?? (shippingAddress ? `${shippingAddress.adresse}, ${shippingAddress.ville}` : undefined),
      }],
      { session }
    );

    // create() renvoie un tableau : après un succès, le document est bien présent.
    if (!order) throw new Error("La création de la commande a échoué.");

    // Vidage du panier après passage de commande.
    cart.items.splice(0, cart.items.length);
    cart.amount = 0;
    await cart.save({ session });

    await session.commitTransaction();

    logger.info(`Commande créée : ${order.reference} (${order._id})`);

    // Email de confirmation (hors transaction : un échec d'envoi ne doit pas
    // annuler une commande déjà validée — la file gère ses propres relances).
    try {
      sendOrderConfirmationMail(user, {
        reference: order.reference,
        items: orderItems.map(i => ({
          productName: i.productName ?? "Article",
          quantity: i.quantity,
          price: i.price,
        })),
        subtotal,
        discountAmount,
        shippingFee,
        amount,
        ...(order.adresse ? { adresse: order.adresse } : {}),
      });
    } catch (mailError) {
      logger.error(`Email de confirmation non envoyé : ${(mailError as Error).message}`);
    }

    const dto = await buildOrderDto(order);
    const response = BaseResponse.Created(dto, "Commande créée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur création commande : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  GET /orders?userId=&status=&page=&limit=
// ─────────────────────────────────────────────
export const getOrders = async (req: Request, res: Response) => {
  try {
    const { userId, status, page = "1", limit = "10" } = req.query;

    const filter: Record<string, unknown> = {};
    if (userId) filter.userId = userId;
    if (status) filter.status = status;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      Order.find(filter).skip(skip).limit(limitNum).sort({ createdAt: -1 }),
      Order.countDocuments(filter),
    ]);

    logger.info(`Liste commandes — total : ${total}`);

    const ordersDto = await enrichOrders(orders);

    const response = BaseResponse.WithSuccess(
      {
        orders: ordersDto,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
      "Commandes récupérées avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur liste commandes : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  GET /orders/:id
// ─────────────────────────────────────────────
export const getOrderById = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const id = String(req.params.id);

    const order = await Order.findById(id);
    if (!order) {
      logger.warn(`Commande introuvable : ${id}`);
      const response = BaseResponse.NotFound("Commande non trouvée");
      return res.status(response.statusCode).json(response);
    }

    // Un client ne consulte que ses propres commandes ; l'admin voit tout.
    if (req.user && req.user.entityType !== "admin" && order.userId.toString() !== req.user.id) {
      logger.warn(`Accès refusé à la commande ${id} pour ${req.user.id}`);
      const response = BaseResponse.Forbidden("Vous ne pouvez consulter que vos propres commandes.");
      return res.status(response.statusCode).json(response);
    }

    const dto = await buildOrderDto(order);
    const response = BaseResponse.WithSuccess(dto, "Commande récupérée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur récupération commande : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  }
};

// ─────────────────────────────────────────────
//  PATCH /orders/:id/status   { status, note? }
//  Passer une commande à "cancelled" restitue le stock des produits.
// ─────────────────────────────────────────────
export const updateOrderStatus = async (req: Request, res: Response) => {
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
    const { status, note } = req.body as { status: OrderStatus; note?: string };

    logger.info(`Mise à jour statut commande ${id} → ${status}`);

    const order = await Order.findById(id).session(session);
    if (!order) {
      await session.abortTransaction();
      logger.warn(`Commande introuvable pour mise à jour : ${id}`);
      const response = BaseResponse.NotFound("Commande non trouvée");
      return res.status(response.statusCode).json(response);
    }

    if (order.status === status) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest(`La commande est déjà au statut "${status}".`);
      return res.status(response.statusCode).json(response);
    }

    // Le cycle de vie d'une commande est un graphe orienté : on refuse
    // les sauts incohérents (livrée → en attente, annulée → expédiée…).
    const allowed = ALLOWED_STATUS_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(status)) {
      await session.abortTransaction();
      logger.warn(`Transition refusée : ${order.status} → ${status} (commande ${id})`);
      const message = allowed.length
        ? `Transition invalide : "${order.status}" → "${status}". Transitions possibles : ${allowed.join(", ")}.`
        : `La commande est au statut terminal "${order.status}" et ne peut plus changer.`;
      const response = BaseResponse.BadRequest(message);
      return res.status(response.statusCode).json(response);
    }

    // Annulation : on restitue le stock (une seule fois, si la commande ne l'était pas déjà).
    if (status === OrderStatus.CANCELLED && order.status !== OrderStatus.CANCELLED) {
      for (const item of order.items) {
        const pb = await productBoutique.findById(item.productBoutiqueId).session(session);
        if (pb) {
          pb.stock += item.quantity;
          await pb.save({ session });
        }
      }
      logger.info(`Stock restitué pour la commande annulée : ${order.reference}`);

      // Restitution de l'utilisation du coupon éventuel.
      if (order.promotionCode) {
        const promo = await Promotion.findOne({ code: order.promotionCode }).session(session);
        if (promo && promo.usedCount > 0) {
          promo.usedCount -= 1;
          await promo.save({ session });
          logger.info(`Utilisation du coupon ${order.promotionCode} restituée`);
        }
      }
    }

    order.status = status;

    // Trace horodatée de la transition, avec son auteur quand il est connu.
    order.statusHistory.push({
      status,
      changedAt: new Date(),
      ...(req.user?.id ? { changedBy: new mongoose.Types.ObjectId(req.user.id) } : {}),
      ...(note ? { note } : {}),
    });

    await order.save({ session });
    await session.commitTransaction();

    logger.info(`Statut commande mis à jour : ${id} → ${status}`);

    // Notification du client (hors transaction).
    try {
      const client = await User.findById(order.userId);
      if (client) sendOrderStatusMail(client, order.reference, status);
    } catch (mailError) {
      logger.error(`Email de suivi non envoyé : ${(mailError as Error).message}`);
    }

    const dto = await buildOrderDto(order);
    const response = BaseResponse.WithSuccess(dto, "Statut de la commande mis à jour avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur mise à jour statut commande : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  DELETE /orders/:id   (soft delete)
// ─────────────────────────────────────────────
export const deleteOrder = async (req: Request, res: Response) => {
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

    logger.info(`Suppression commande : ${id}`);

    const order = await Order.findById(id).session(session);
    if (!order) {
      await session.abortTransaction();
      logger.warn(`Commande introuvable pour suppression : ${id}`);
      const response = BaseResponse.NotFound("Commande non trouvée");
      return res.status(response.statusCode).json(response);
    }

    order.deletedAt = new Date();
    await order.save({ session });
    await session.commitTransaction();

    logger.info(`Commande supprimée (soft) : ${id}`);

    const response = BaseResponse.WithSuccess(null, "Commande supprimée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Erreur suppression commande : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};
