import type { Request, Response } from "express";
import mongoose from "mongoose";
import { validationResult } from "express-validator";
import {
  DeliveryMethod,
  Order,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  type IOrder,
  type IOrderItem,
  type IShippingAddress,
} from "../models/order.model.js";
import {
  ShopOrder,
  ShopOrderActor,
  ShopOrderPaymentStatus,
  ShopOrderStatus,
  type IShopOrder,
} from "../models/shopOrder.model.js";
import { EntityType } from "../models/user.model.js";
import { Cart } from "../models/cart.model.js";
import { Address } from "../models/address.model.js";
import { Product, productBoutique } from "../models/product.model.js";
import { Shop } from "../models/boutique.model.js";
import { Famille } from "../models/famille.model.js";
import { Categorie } from "../models/categorie.model.js";
import { SousCategorie } from "../models/sousCategorie.model.js";
import { User } from "../models/user.model.js";
import { getPaymentProvider } from "../shared/payment/payment.provider.js";
import {
  allocateDiscount,
  DEADLINES,
  generatePickupCode,
  scheduleFor,
} from "../shared/helpers/shopOrder.workflow.js";
import { failOrderPayment, restoreCartAfterFailedPayment } from "../shared/services/orderPayment.service.js";
import { deliverNotices, newPartNotices } from "../shared/services/shopOrder.notifications.js";
import type { ShopOrderViewer } from "../shared/interfaces/ShopOrder.interfaces.js";
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
import { sendOrderConfirmationMail } from "../shared/helpers/mail.helper.js";

// Génère une référence de commande lisible et raisonnablement unique.
const generateReference = (): string => {
  const suffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  return `CMD-${suffix}`;
};

// Résout les documents (product_boutique, boutique, produit + taxonomie) référencés par
// une liste de commandes, ainsi que leurs sous-commandes, puis construit les DTOs
// enrichis. Lecture hors transaction. `parts` évite de relire des sous-commandes
// déjà en mémoire (checkout).
const enrichOrders = async (
  orders: IOrder[],
  viewer: ShopOrderViewer = "client",
  knownParts?: IShopOrder[]
): Promise<OrderResponseDto[]> => {
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

  const [familles, categories, sousCategories, parts] = await Promise.all([
    Famille.find({ _id: { $in: familleIds } }),
    Categorie.find({ _id: { $in: categoryIds } }),
    SousCategorie.find({ _id: { $in: sousCategoryIds } }),
    knownParts ?? ShopOrder.find({ orderId: { $in: orders.map(order => order._id) } }),
  ]);

  return orders.map(order =>
    toOrderResponseDto(order, productBoutiques, shops, products, familles, categories, sousCategories, parts, viewer)
  );
};

// Enrichit une seule commande.
const buildOrderDto = async (
  order: IOrder,
  viewer: ShopOrderViewer = "client",
  knownParts?: IShopOrder[]
): Promise<OrderResponseDto> => (await enrichOrders([order], viewer, knownParts))[0]!;

// ─────────────────────────────────────────────
//  POST /orders/:userId   (checkout depuis le panier)
//  { addressId?, deliveries?, deliveryMethod?, telephone?, adresse?, code?, paymentMethod? }
//  Une livraison par boutique : le client choisit son mode parmi ceux que
//  tous les articles de la boutique acceptent. Les frais sont calculés ici,
//  jamais lus dans la requête.
//
//  La commande est découpée en une sous-commande par boutique, dans la même
//  transaction. Paiement à la livraison : elles partent aussitôt chez les
//  boutiques. Paiement en ligne : elles attendent la confirmation du
//  prestataire, 30 minutes au plus, et la réponse porte l'adresse de paiement.
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
    const online = req.body.paymentMethod === PaymentMethod.ONLINE;
    const provider = online ? getPaymentProvider() : null;

    logger.info(`Création commande (checkout) pour utilisateur : ${userId}`);

    if (online && !provider) {
      await session.abortTransaction();
      const response = BaseResponse.BadRequest(
        "Le paiement en ligne n'est pas encore disponible : choisissez le paiement à la livraison ou au retrait."
      );
      return res.status(response.statusCode).json(response);
    }

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
    const now = new Date();
    const orderStatus = online ? OrderStatus.AWAITING_PAYMENT : OrderStatus.IN_PROGRESS;

    const [order] = await Order.create(
      [{
        userId,
        reference: generateReference(),
        paymentMethod: online ? PaymentMethod.ONLINE : PaymentMethod.ON_DELIVERY,
        paymentStatus: online ? OrderPaymentStatus.PENDING : OrderPaymentStatus.ON_DELIVERY,
        paymentExpiresAt: online ? new Date(now.getTime() + DEADLINES.payment) : null,
        items: orderItems,
        subtotal,
        discountAmount,
        promotionCode,
        shippingFee,
        amount,
        status: orderStatus,
        // Première entrée de l'historique : la création de la commande.
        statusHistory: [
          {
            status: orderStatus,
            changedAt: now,
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

    // ── Sous-commandes : une par boutique ─────────────────
    // Le coupon est réparti au prorata des sous-totaux : chaque boutique
    // rembourse, le cas échéant, exactement sa part.
    const groups = deliveries.map(delivery => ({
      delivery,
      items: orderItems.filter(item => item.boutiqueId?.toString() === delivery.boutiqueId.toString()),
    }));
    const subtotals = groups.map(group => group.items.reduce((sum, item) => sum + item.price * item.quantity, 0));
    const shares = allocateDiscount(subtotals, discountAmount);
    const partStatus = online ? ShopOrderStatus.AWAITING_PAYMENT : ShopOrderStatus.PENDING;
    const schedule = scheduleFor(partStatus, now);

    const parts = await ShopOrder.create(
      groups.map((group, index) => {
        const partSubtotal = subtotals[index] ?? 0;
        const partDiscount = shares[index] ?? 0;
        return {
          orderId: order._id,
          userId,
          boutiqueId: group.delivery.boutiqueId,
          boutiqueNom: group.delivery.boutiqueNom,
          reference: `${order.reference}-${index + 1}`,
          items: group.items,
          subtotal: partSubtotal,
          discountAmount: partDiscount,
          deliveryFee: group.delivery.fee,
          amount: Math.max(0, partSubtotal - partDiscount) + group.delivery.fee,
          delivery: group.delivery,
          // L'adresse ne sert qu'à une livraison ; un retrait se fait en boutique.
          ...(shippingAddress && group.delivery.method !== DeliveryMethod.PICKUP ? { shippingAddress } : {}),
          customer: {
            nom: user.nom,
            prenom: user.prenom,
            telephone: telephone ?? shippingAddress?.telephone ?? user.telephone,
          },
          payment: {
            method: online ? PaymentMethod.ONLINE : PaymentMethod.ON_DELIVERY,
            status: ShopOrderPaymentStatus.UNPAID,
            refundedAmount: 0,
          },
          status: partStatus,
          statusHistory: [
            { status: partStatus, changedAt: now, actor: ShopOrderActor.CLIENT, changedBy: userId, note: "Commande passée" },
          ],
          pickupCode: generatePickupCode(),
          deliveryAttempts: 0,
          deadlineAt: schedule.deadlineAt,
          reminderAt: schedule.reminderAt,
        };
      }),
      { session, ordered: true }
    );

    // Vidage du panier après passage de commande.
    cart.items.splice(0, cart.items.length);
    cart.amount = 0;
    await cart.save({ session });

    await session.commitTransaction();

    logger.info(`Commande créée : ${order.reference} (${order._id}), ${parts.length} sous-commande(s)`);

    // ── Paiement en ligne : lancement chez le prestataire ──
    // Hors transaction : la commande existe, le stock est réservé. Si le
    // prestataire ne répond pas, la commande échoue tout de suite et le
    // panier revient au client.
    if (online && provider) {
      try {
        const initiation = await provider.initiate({
          orderId: String(order._id),
          reference: order.reference,
          amount,
        });
        order.paymentRef = initiation.providerRef;
        await order.save();
        const dto = await buildOrderDto(order, "client", parts);
        const response = BaseResponse.Created(
          { ...dto, payment: { redirectUrl: initiation.redirectUrl } },
          "Commande créée : il reste à la payer."
        );
        return res.status(response.statusCode).json(response);
      } catch (paymentError) {
        logger.error(`Paiement de ${order.reference} non lancé : ${(paymentError as Error).message}`);
        await failOrderPayment(order._id, "refused");
        await restoreCartAfterFailedPayment(order);
        const response = new BaseResponse(
          false,
          "Le paiement en ligne n'a pas pu être lancé. Votre panier est restauré : réessayez ou payez à la livraison.",
          502,
          null
        );
        return res.status(response.statusCode).json(response);
      }
    }

    // Paiement à la remise : la commande part tout de suite chez les boutiques.
    // Emails hors transaction : un échec d'envoi ne doit pas annuler une
    // commande déjà validée — la file gère ses propres relances.
    for (const part of parts) {
      await deliverNotices(newPartNotices(part), part);
    }

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

    const dto = await buildOrderDto(order, "client", parts);
    const response = BaseResponse.Created(dto, "Commande créée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    // L'erreur a pu survenir après la validation (lecture du DTO) : il n'y a
    // alors plus rien à annuler.
    await session.abortTransaction().catch(() => undefined);
    logger.error(`Erreur création commande : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
  } finally {
    session.endSession();
  }
};

// ─────────────────────────────────────────────
//  GET /orders?userId=&status=&page=&limit=
//  Un client ne lit que ses commandes, même sans userId dans la requête ;
//  l'administration lit celles de tous, ou d'un client.
// ─────────────────────────────────────────────
export const getOrders = async (req: Request, res: Response) => {
  try {
    const { userId, status, page = "1", limit = "10" } = req.query;
    const admin = req.user?.entityType === EntityType.ADMIN;

    const filter: Record<string, unknown> = {};
    if (!admin) filter.userId = req.user?.id;
    else if (userId) filter.userId = userId;
    if (status) filter.status = status;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      Order.find(filter).skip(skip).limit(limitNum).sort({ createdAt: -1 }),
      Order.countDocuments(filter),
    ]);

    logger.info(`Liste commandes — total : ${total}`);

    const ordersDto = await enrichOrders(orders, admin ? "admin" : "client");

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
    if (req.user && req.user.entityType !== EntityType.ADMIN && order.userId.toString() !== req.user.id) {
      logger.warn(`Accès refusé à la commande ${id} pour ${req.user.id}`);
      const response = BaseResponse.Forbidden("Vous ne pouvez consulter que vos propres commandes.");
      return res.status(response.statusCode).json(response);
    }

    const dto = await buildOrderDto(order, req.user?.entityType === EntityType.ADMIN ? "admin" : "client");
    const response = BaseResponse.WithSuccess(dto, "Commande récupérée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    logger.error(`Erreur récupération commande : ${(error as Error).message}`);
    const response = BaseResponse.ServerError((error as Error).message);
    return res.status(response.statusCode).json(response);
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
