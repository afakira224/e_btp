import { DeliveryMode } from "../../../entities/delivery";
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  ShopOrderActor,
  ShopOrderPaymentStatus,
  ShopOrderStatus,
  type Order,
  type ShippingAddress,
} from "../../../entities/order";
import { EntityType } from "../../../entities/user";
import { ApiError } from "../ApiError";
import type { ApiResponse } from "../httpClient";
import type { MockOrder, MockShopOrder } from "./accountSeed";
import { quoteDelivery, readSelection, summaryMethod, toOrderDeliveries } from "./deliveryRules";
import { findLiveOffer } from "./liveCatalog";
import { objectId, writeDb, type MockDb } from "./mockDb";
import { confirmPayment, failPayment, freshDb, sessionUser, toShopOrder, type Viewer } from "./shopOrders";
import { allocateDiscount, DEADLINES, generatePickupCode, scheduleFor } from "./shopOrderRules";

// ─────────────────────────────────────────────
//  Commandes et paiement — routes simulées.
//
//   GET    /orders?userId=&status=&page=&limit=
//   GET    /orders/:id
//   POST   /orders/:userId          { addressId?, deliveries?, telephone?, paymentMethod? }
//   POST   /payments/:orderId       relance le paiement d'une commande en attente
//   POST   /payments/sandbox/:orderId   { outcome: paid | failed }
//
//  Mêmes codes et mêmes messages que Back/src/controllers/{order,payment}
//  .controller.ts. Le paiement en ligne passe par le prestataire simulé du
//  back (« sandbox ») : la page /paiement/:orderId joue son rôle.
// ─────────────────────────────────────────────

const ok = <T>(data: T, message: string, statusCode = 200): ApiResponse<T> => ({
  success: true,
  message,
  statusCode,
  data,
});

/** Enrichissement façon `buildOrderDto` : offre, boutique et produit imbriqués, sous-commandes jointes. */
const toOrder = (db: MockDb, order: MockOrder, viewer: Viewer): Order => {
  const actors = viewer === "admin" ? [ShopOrderActor.ADMIN] : [ShopOrderActor.CLIENT];
  const now = new Date();
  return {
    ...order,
    items: order.items.map((item) => {
      const offer = findLiveOffer(item.productBoutiqueId);
      return {
        productBoutique: offer,
        boutique: offer?.boutique,
        product: offer?.product,
        price: item.price,
        quantity: item.quantity,
        lineTotal: item.price * item.quantity,
      };
    }),
    totalItems: order.items.reduce((sum, item) => sum + item.quantity, 0),
    parts: db.shopOrders
      .filter((part) => part.orderId === order.id)
      .sort((a, b) => a.reference.localeCompare(b.reference, "fr", { numeric: true }))
      .map((part) => toShopOrder(part, viewer, actors, now)),
  };
};

/** Un client ne lit que ses commandes, quel que soit le `userId` demandé ; l'admin lit tout. */
export const listOrders = (params: URLSearchParams) => {
  const user = sessionUser();
  const admin = user.role === EntityType.ADMIN;
  const userId = admin ? params.get("userId") : user._id;
  const status = params.get("status") as OrderStatus | null;
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? 10)));

  const db = freshDb();
  const all = db.orders
    .filter((order) => (!userId || order.userId === userId) && (!status || order.status === status))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return ok(
    {
      orders: all.slice((page - 1) * limit, page * limit).map((order) => toOrder(db, order, admin ? "admin" : "client")),
      total: all.length,
      page,
      totalPages: Math.ceil(all.length / limit),
    },
    "Commandes récupérées avec succès"
  );
};

export const getOrder = (id: string) => {
  const user = sessionUser();
  const db = freshDb();
  const order = db.orders.find((candidate) => candidate.id === id);
  if (!order) throw new ApiError("Commande non trouvée", 404);
  const admin = user.role === EntityType.ADMIN;
  if (order.userId !== user._id && !admin) {
    throw new ApiError("Vous ne pouvez consulter que vos propres commandes.", 403);
  }
  return ok(toOrder(db, order, admin ? "admin" : "client"), "Commande récupérée avec succès");
};

// ─────────────────────────────────────────────
//  POST /orders/:userId — checkout depuis le panier.
//  Même enchaînement que createOrder (Back/src/controllers/order.controller.ts) :
//  panier, offres, livraisons, adresse, stock, instantané, puis une
//  sous-commande par boutique. Les frais viennent du devis, jamais du corps.
// ─────────────────────────────────────────────
interface CheckoutBody {
  addressId?: unknown;
  deliveries?: unknown;
  deliveryMethod?: unknown;
  telephone?: unknown;
  adresse?: unknown;
  code?: unknown;
  paymentMethod?: unknown;
}

const PAYMENT_METHODS: readonly string[] = Object.values(PaymentMethod);

/** URL de la page de paiement du prestataire simulé : celle du front, comme APP_URL côté back. */
const paymentUrl = (orderId: string) => `${window.location.origin}/paiement/${orderId}`;

export const createOrder = (userId: string, body: CheckoutBody = {}) => {
  const user = sessionUser();
  if (user._id !== userId) throw new ApiError("Vous ne pouvez accéder qu'à vos propres données.", 403);

  const { selection, errors } = readSelection(body);
  const telephone = typeof body.telephone === "string" ? body.telephone.trim() : undefined;
  if (telephone !== undefined && (telephone.length < 9 || telephone.length > 12)) {
    errors.push("Entre 9 et 12 caractères.");
  }
  if (body.paymentMethod !== undefined && !PAYMENT_METHODS.includes(String(body.paymentMethod))) {
    errors.push(`Mode de paiement invalide. Valeurs acceptées : ${PAYMENT_METHODS.join(", ")}.`);
  }
  if (errors.length > 0) throw new ApiError(errors.join(" | "), 422);
  // Les coupons vivent dans les promotions du back, que le mode simulé ne porte pas.
  if (body.code !== undefined) throw new ApiError("Coupon introuvable", 404);
  const online = body.paymentMethod === PaymentMethod.ONLINE;

  const db = freshDb();
  const cart = db.carts.find((entry) => entry.userId === userId);
  if (!cart || cart.items.length === 0) throw new ApiError("Le panier est vide.", 400);

  const lines = cart.items.map((item) => ({ item, offer: findLiveOffer(item.productBoutiqueId) }));
  const missing = lines.find((line) => !line.offer);
  if (missing) {
    throw new ApiError(
      `Un produit du panier n'est plus disponible (${missing.item.productBoutiqueId}).`,
      400
    );
  }

  // ── Livraisons : une par boutique ─────────
  const quote = quoteDelivery(
    lines.map(({ item, offer }) => ({ offer: offer!, quantity: item.quantity })),
    selection
  );
  if (!quote.ready) {
    throw new ApiError(
      quote.groups.find((group) => group.error)?.error ?? "Aucune livraison possible pour ce panier.",
      400
    );
  }
  const deliveries = toOrderDeliveries(quote);
  const requiresAddress = deliveries.some((delivery) => delivery.method !== DeliveryMode.PICKUP);

  // ── Adresse : copiée dans la commande ─────
  let shippingAddress: ShippingAddress | undefined;
  let addressId: string | null = null;
  if (typeof body.addressId === "string" && body.addressId) {
    const address = db.addresses.find(
      (candidate) => candidate.id === body.addressId && candidate.deletedAt === null
    );
    if (!address) throw new ApiError("Adresse de livraison introuvable", 404);
    if (address.userId !== userId) throw new ApiError("Cette adresse ne vous appartient pas.", 403);
    addressId = address.id;
    shippingAddress = {
      destinataire: address.destinataire,
      telephone: address.telephone,
      adresse: address.adresse,
      ville: address.ville,
      commune: address.commune,
      pays: address.pays,
    };
  } else if (requiresAddress && !body.adresse) {
    throw new ApiError("Une adresse de livraison est requise (addressId ou adresse).", 400);
  }

  // ── Stock : vérifié puis réservé ──────────
  const now = new Date();
  const stamp = now.toISOString();
  for (const { item, offer } of lines) {
    if (offer!.stock < item.quantity) {
      throw new ApiError(`Stock insuffisant pour un produit (disponible : ${offer!.stock}).`, 400);
    }
  }
  for (const { item, offer } of lines) {
    const stock = offer!.stock - item.quantity;
    const created = db.offers.find((candidate) => candidate.id === offer!.id);
    if (created) Object.assign(created, { stock, updatedAt: stamp });
    else db.offerPatches[offer!.id] = { ...db.offerPatches[offer!.id], stock, updatedAt: stamp };
  }

  const items = cart.items.map((item) => ({
    productBoutiqueId: item.productBoutiqueId,
    price: item.price,
    quantity: item.quantity,
  }));
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const status = online ? OrderStatus.AWAITING_PAYMENT : OrderStatus.IN_PROGRESS;
  const order: MockOrder = {
    id: objectId(),
    userId,
    reference: `CMD-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    items,
    subtotal,
    discountAmount: 0,
    promotionCode: null,
    shippingFee: quote.shippingFee,
    amount: subtotal + quote.shippingFee,
    status,
    statusHistory: [{ status, changedAt: stamp, note: "Commande créée" }],
    paymentMethod: online ? PaymentMethod.ONLINE : PaymentMethod.ON_DELIVERY,
    paymentStatus: online ? OrderPaymentStatus.PENDING : OrderPaymentStatus.ON_DELIVERY,
    paidAt: null,
    paymentExpiresAt: online ? new Date(now.getTime() + DEADLINES.payment).toISOString() : null,
    deliveryMethod: summaryMethod(deliveries.map((delivery) => delivery.method)),
    deliveries,
    addressId,
    ...(shippingAddress ? { shippingAddress } : {}),
    createdAt: stamp,
    updatedAt: stamp,
  };

  // ── Sous-commandes : une par boutique ─────
  const groups = deliveries.map((delivery) => ({
    delivery,
    items: lines
      .filter(({ offer }) => offer!.boutique?.id === delivery.boutiqueId)
      .map(({ item }) => ({ productBoutiqueId: item.productBoutiqueId, price: item.price, quantity: item.quantity })),
  }));
  const subtotals = groups.map((group) => group.items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  const shares = allocateDiscount(subtotals, order.discountAmount);
  const partStatus = online ? ShopOrderStatus.AWAITING_PAYMENT : ShopOrderStatus.PENDING;
  const schedule = scheduleFor(partStatus, now);

  const parts = groups.map((group, index): MockShopOrder => {
    const partSubtotal = subtotals[index] ?? 0;
    const partDiscount = shares[index] ?? 0;
    return {
      id: objectId(),
      orderId: order.id,
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
      ...(shippingAddress && group.delivery.method !== DeliveryMode.PICKUP ? { shippingAddress } : {}),
      customer: { nom: user.nom, prenom: user.prenom, telephone: telephone ?? shippingAddress?.telephone ?? user.telephone },
      payment: {
        method: order.paymentMethod,
        status: ShopOrderPaymentStatus.UNPAID,
        paidAt: null,
        refundedAmount: 0,
        refundedAt: null,
      },
      status: partStatus,
      statusHistory: [
        { status: partStatus, changedAt: stamp, actor: ShopOrderActor.CLIENT, changedBy: userId, note: "Commande passée" },
      ],
      pickupCode: generatePickupCode(),
      deliveryAttempts: 0,
      return: null,
      deadlineAt: schedule.deadlineAt,
      reminderAt: schedule.reminderAt,
      createdAt: stamp,
      updatedAt: stamp,
    };
  });

  db.orders.push(order);
  db.shopOrders.push(...parts);
  // Le panier est vidé une fois la commande enregistrée.
  cart.items = [];
  cart.amount = 0;
  cart.updatedAt = stamp;
  writeDb(db);

  if (online) {
    return ok(
      { ...toOrder(db, order, "client"), payment: { redirectUrl: paymentUrl(order.id) } },
      "Commande créée : il reste à la payer.",
      201
    );
  }
  return ok(toOrder(db, order, "client"), "Commande créée avec succès", 201);
};

// ── Paiement en ligne ───────────────────────
const loadOwnOnlineOrder = (db: MockDb, orderId: string): MockOrder => {
  const user = sessionUser();
  const order = db.orders.find((candidate) => candidate.id === orderId);
  if (!order) throw new ApiError("Commande introuvable.", 404);
  if (user.role !== EntityType.ADMIN && order.userId !== user._id) {
    throw new ApiError("Vous ne pouvez payer que vos propres commandes.", 403);
  }
  if (order.paymentMethod !== PaymentMethod.ONLINE) {
    throw new ApiError("Cette commande se paie à la livraison ou au retrait.", 400);
  }
  return order;
};

const paymentSummary = (order: MockOrder) => ({
  orderId: order.id,
  status: order.status,
  paymentStatus: order.paymentStatus,
  paymentExpiresAt: order.paymentExpiresAt,
});

export const restartPayment = (orderId: string) => {
  const db = freshDb();
  const order = loadOwnOnlineOrder(db, orderId);
  if (order.status !== OrderStatus.AWAITING_PAYMENT || order.paymentStatus !== OrderPaymentStatus.PENDING) {
    throw new ApiError("Cette commande n'attend plus de paiement.", 409);
  }
  return ok({ ...paymentSummary(order), redirectUrl: paymentUrl(order.id) }, "Paiement relancé.");
};

export const settleSandboxPayment = (orderId: string, body: { outcome?: unknown } = {}) => {
  if (body.outcome !== "paid" && body.outcome !== "failed") {
    throw new ApiError("Issue invalide. Valeurs acceptées : paid, failed.", 422);
  }
  const db = freshDb();
  const order = loadOwnOnlineOrder(db, orderId);
  const now = new Date();

  if (body.outcome === "paid") {
    // Payée après l'échec de la commande (délai dépassé) : le prestataire
    // simulé rend aussitôt l'argent.
    if (order.paymentStatus === OrderPaymentStatus.FAILED) {
      throw new ApiError("Le délai de paiement était dépassé : la commande est annulée et votre paiement remboursé.", 409);
    }
    confirmPayment(db, order, now);
    writeDb(db);
    return ok(paymentSummary(order), "Paiement confirmé.");
  }
  failPayment(db, order, "refused", now);
  writeDb(db);
  return ok(paymentSummary(order), "Paiement refusé : votre panier a été restauré.");
};
