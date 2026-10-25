import { EntityType, type User } from "../../../entities/user";
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  SHOP_ORDER_GROUP_KEYS,
  SHOP_ORDER_GROUPS,
  SHOP_ORDER_NEGATIVE_END,
  ShopOrderActor,
  ShopOrderPaymentStatus,
  ShopOrderStatus,
  groupOf,
  type ShopOrder,
  type ShopOrderCounts,
  type ShopOrderGroup,
} from "../../../entities/order";
import { ApiError } from "../ApiError";
import type { ApiResponse } from "../httpClient";
import type { MockOrder, MockShopOrder } from "./accountSeed";
import { findLiveOffer, findShop } from "./liveCatalog";
import { readDb, writeDb, type MockDb } from "./mockDb";
import {
  ACTION_RULES,
  AUTO_ACTIONS,
  availableActions,
  checkAction,
  isManualAction,
  orderStatusFrom,
  reasonLabel,
  refundAmountFor,
  scheduleFor,
  targetStatus,
  type AnyAction,
  type RuleInput,
} from "./shopOrderRules";

// ─────────────────────────────────────────────
//  Sous-commandes — routes simulées.
//
//   GET   /shop-orders?boutiqueId=&group=&status=&search=&page=&limit=   boutique, admin
//   GET   /shop-orders/:id                                               client, boutique, admin
//   PATCH /shop-orders/:id/:action    JSON, ou multipart (photos) pour un retour
//
//  Mêmes contrôles, mêmes effets (stock, remboursement, statut de la
//  commande) et mêmes messages que Back/src/controllers/shopOrder.controller.ts
//  et Back/src/shared/services/shopOrder.service.ts. Les délais automatiques
//  (expiration, clôture, litige) que le serveur applique toutes les 15 minutes
//  s'appliquent ici à chaque lecture : `runDeadlines`.
// ─────────────────────────────────────────────

const ok = <T>(data: T, message: string, statusCode = 200): ApiResponse<T> => ({
  success: true,
  message,
  statusCode,
  data,
});

const SHOP_FORBIDDEN_MESSAGE = "Vous ne pouvez gérer que vos propres boutiques.";

export type Viewer = "client" | "shop" | "admin";

export const sessionUser = (): User => {
  const db = readDb();
  const user = db.users.find((candidate) => candidate._id === db.sessionUserId);
  if (!db.sessionUserId || !user) {
    throw new ApiError("Session absente ou expirée, veuillez vous connecter.", 401);
  }
  return user;
};

const canManageShop = (user: User, boutiqueId: string): boolean => {
  if (user.role === EntityType.ADMIN) return true;
  if (user.role !== EntityType.SHOP) return false;
  return findShop(boutiqueId)?.ownerId === user._id;
};

/** Rôles de la personne sur cette sous-commande, comme resolveActors côté back. */
export const resolveActors = (
  user: User,
  part: Pick<MockShopOrder, "userId" | "boutiqueId">
): { actors: ShopOrderActor[]; viewer: Viewer | null } => {
  const actors: ShopOrderActor[] = [];
  if (user.role === EntityType.ADMIN) actors.push(ShopOrderActor.ADMIN);
  if (part.userId === user._id) actors.push(ShopOrderActor.CLIENT);
  if (user.role === EntityType.SHOP && canManageShop(user, part.boutiqueId)) actors.push(ShopOrderActor.SHOP);

  const viewer: Viewer | null = actors.includes(ShopOrderActor.SHOP)
    ? "shop"
    : actors.includes(ShopOrderActor.CLIENT)
      ? "client"
      : actors.includes(ShopOrderActor.ADMIN)
        ? "admin"
        : null;
  return { actors, viewer };
};

// ── Stock ───────────────────────────────────
const setStock = (db: MockDb, offerId: string, next: (current: number) => number, now: string) => {
  const created = db.offers.find((candidate) => candidate.id === offerId);
  if (created) {
    created.stock = next(created.stock);
    created.updatedAt = now;
    return;
  }
  const live = findLiveOffer(offerId);
  if (!live) return;
  db.offerPatches[offerId] = { ...db.offerPatches[offerId], stock: next(live.stock), updatedAt: now };
};

const restoreStock = (db: MockDb, items: MockShopOrder["items"], now: string) => {
  for (const item of items) setStock(db, item.productBoutiqueId, (stock) => stock + item.quantity, now);
};

// ── Statut de la commande ───────────────────
const syncOrderStatus = (db: MockDb, orderId: string, now: string): MockOrder | null => {
  const order = db.orders.find((candidate) => candidate.id === orderId);
  if (!order) return null;
  if (order.status === OrderStatus.PAYMENT_FAILED) return order;

  const next = orderStatusFrom(db.shopOrders.filter((part) => part.orderId === orderId).map((part) => part.status));
  if (order.status !== next) {
    order.status = next;
    order.statusHistory.push({ status: next, changedAt: now });
    order.updatedAt = now;
  }
  return order;
};

const DEFAULT_NOTES: Partial<Record<AnyAction, string>> = {
  escalate: "La boutique n'a pas répondu au retour sous 48 heures.",
  "confirm-refund": "Remboursement effectué.",
};

/** Applique une action et ses effets ; lève une ApiError si elle est interdite. */
export const applyAction = (
  db: MockDb,
  part: MockShopOrder,
  action: AnyAction,
  actors: readonly ShopOrderActor[],
  input: RuleInput,
  now: Date,
  userId?: string
): { from: ShopOrderStatus; refund: number } => {
  const rule = ACTION_RULES[action];
  const actor = rule.actors.find((candidate) => actors.includes(candidate));
  if (!actor) throw new ApiError("Vous ne pouvez pas effectuer cette action sur cette commande.", 403);

  const refusal = checkAction(action, actors, part, input, now);
  if (refusal) throw new ApiError(refusal, 400);

  const stamp = now.toISOString();
  const from = part.status;
  const to = targetStatus(action, input, part);
  const note = input.note?.trim() || DEFAULT_NOTES[action];
  // Un motif ne compte que pour une action qui en prend.
  const reason = rule.reasons ? input.reason : undefined;

  switch (action) {
    case "ship":
    case "retry":
      part.deliveryAttempts += 1;
      break;
    case "deliver":
      if (part.payment.method === PaymentMethod.ON_DELIVERY) {
        part.payment.status = ShopOrderPaymentStatus.PAID;
        part.payment.paidAt = stamp;
      }
      break;
    case "return":
      part.return = {
        reason: input.reason ?? "",
        details: input.note?.trim() || undefined,
        photos: input.photos ?? [],
        requestedAt: stamp,
        respondedAt: null,
        resolvedAt: null,
      };
      break;
    case "reject-return":
    case "accept-return":
    case "escalate":
      if (part.return) {
        part.return.respondedAt = stamp;
        if (action === "reject-return") part.return.shopResponse = input.note?.trim();
      }
      break;
    case "resolve-dispute":
      if (part.return) {
        part.return.resolution = input.resolution;
        part.return.resolutionNote = input.note?.trim();
        part.return.resolvedAt = stamp;
      }
      break;
    case "confirm-refund":
      part.payment.status =
        part.payment.refundedAmount >= part.amount
          ? ShopOrderPaymentStatus.REFUNDED
          : ShopOrderPaymentStatus.PARTIALLY_REFUNDED;
      part.payment.refundedAt = stamp;
      break;
    default:
      break;
  }

  // ── Fin négative : le stock et l'argent ───
  let refund = 0;
  if (SHOP_ORDER_NEGATIVE_END.includes(to) && !SHOP_ORDER_NEGATIVE_END.includes(from)) {
    if (to === ShopOrderStatus.REFUSED && input.reason === "out_of_stock") {
      for (const item of part.items) setStock(db, item.productBoutiqueId, () => 0, stamp);
    } else if (to !== ShopOrderStatus.RETURNED) {
      restoreStock(db, part.items, stamp);
    }

    if (part.payment.status === ShopOrderPaymentStatus.PAID) {
      // Livraison abandonnée : la cause est celle constatée à l'échec.
      const failure = [...part.statusHistory].reverse().find((entry) => entry.status === ShopOrderStatus.DELIVERY_FAILED);
      refund = refundAmountFor(part, to, { ...input, reason: to === ShopOrderStatus.FAILED ? failure?.reason : reason });
      if (refund > 0) {
        part.payment.status = ShopOrderPaymentStatus.REFUND_PENDING;
        part.payment.refundedAmount = refund;
        // Prestataire simulé : le remboursement en ligne aboutit aussitôt.
        if (part.payment.method === PaymentMethod.ONLINE) {
          part.payment.status =
            refund >= part.amount ? ShopOrderPaymentStatus.REFUNDED : ShopOrderPaymentStatus.PARTIALLY_REFUNDED;
          part.payment.refundedAt = stamp;
        }
      }
    } else if (part.payment.status === ShopOrderPaymentStatus.UNPAID) {
      part.payment.status = ShopOrderPaymentStatus.VOID;
    }
  }

  if (to !== from) {
    part.status = to;
    const schedule = scheduleFor(to, now);
    part.deadlineAt = schedule.deadlineAt;
    part.reminderAt = schedule.reminderAt;
  }

  part.statusHistory.push({
    status: part.status,
    changedAt: stamp,
    actor,
    ...(userId ? { changedBy: userId } : {}),
    ...(reason ? { reason } : {}),
    ...(note ? { note } : {}),
  });
  part.updatedAt = stamp;
  syncOrderStatus(db, part.orderId, stamp);

  return { from, refund };
};

// ── Paiement en ligne ───────────────────────
export const confirmPayment = (db: MockDb, order: MockOrder, now: Date): boolean => {
  if (order.paymentStatus === OrderPaymentStatus.PAID) return false;
  if (order.paymentStatus !== OrderPaymentStatus.PENDING) {
    throw new ApiError("Ce paiement ne peut plus être confirmé : la commande a expiré.", 409);
  }
  const stamp = now.toISOString();
  for (const part of db.shopOrders) {
    if (part.orderId !== order.id || part.status !== ShopOrderStatus.AWAITING_PAYMENT) continue;
    const schedule = scheduleFor(ShopOrderStatus.PENDING, now);
    part.status = ShopOrderStatus.PENDING;
    part.deadlineAt = schedule.deadlineAt;
    part.reminderAt = schedule.reminderAt;
    part.payment.status = ShopOrderPaymentStatus.PAID;
    part.payment.paidAt = stamp;
    part.statusHistory.push({
      status: ShopOrderStatus.PENDING,
      changedAt: stamp,
      actor: ShopOrderActor.SYSTEM,
      note: "Paiement confirmé",
    });
    part.updatedAt = stamp;
  }
  order.paymentStatus = OrderPaymentStatus.PAID;
  order.paidAt = stamp;
  order.paymentExpiresAt = null;
  order.status = OrderStatus.IN_PROGRESS;
  order.statusHistory.push({ status: OrderStatus.IN_PROGRESS, changedAt: stamp, note: "Paiement confirmé" });
  order.updatedAt = stamp;
  return true;
};

/** Paiement refusé ou expiré : stock rendu, articles remis dans le panier. */
export const failPayment = (db: MockDb, order: MockOrder, cause: "refused" | "expired", now: Date): boolean => {
  if (order.paymentStatus === OrderPaymentStatus.FAILED) return false;
  if (order.paymentStatus !== OrderPaymentStatus.PENDING) throw new ApiError("Ce paiement est déjà confirmé.", 409);

  const stamp = now.toISOString();
  const note = cause === "expired" ? "Paiement non confirmé sous 30 minutes" : "Paiement refusé";
  for (const part of db.shopOrders) {
    if (part.orderId !== order.id || part.status !== ShopOrderStatus.AWAITING_PAYMENT) continue;
    restoreStock(db, part.items, stamp);
    part.status = ShopOrderStatus.CANCELLED;
    part.payment.status = ShopOrderPaymentStatus.VOID;
    part.deadlineAt = null;
    part.reminderAt = null;
    part.statusHistory.push({ status: ShopOrderStatus.CANCELLED, changedAt: stamp, actor: ShopOrderActor.SYSTEM, note });
    part.updatedAt = stamp;
  }
  order.paymentStatus = OrderPaymentStatus.FAILED;
  order.paymentExpiresAt = null;
  order.status = OrderStatus.PAYMENT_FAILED;
  order.statusHistory.push({ status: OrderStatus.PAYMENT_FAILED, changedAt: stamp, note });
  order.updatedAt = stamp;

  // Les articles retournent dans le panier : le client réessaie sans tout rechercher.
  let cart = db.carts.find((entry) => entry.userId === order.userId);
  if (!cart) {
    cart = { id: `cart-${order.userId}`, userId: order.userId, items: [], amount: 0, createdAt: stamp, updatedAt: stamp };
    db.carts.push(cart);
  }
  for (const item of order.items) {
    if (cart.items.some((line) => line.productBoutiqueId === item.productBoutiqueId)) continue;
    cart.items.push({ productBoutiqueId: item.productBoutiqueId, quantity: item.quantity, price: item.price });
  }
  cart.amount = cart.items.reduce((sum, line) => sum + line.price * line.quantity, 0);
  cart.updatedAt = stamp;
  return true;
};

// ── Délais ──────────────────────────────────
/**
 * Ce que le planificateur du back fait toutes les 15 minutes. Chaque échéance
 * s'applique à sa date, pas à celle de la lecture : l'historique reste juste
 * même si personne n'a ouvert l'application entre-temps.
 */
export const runDeadlines = (db: MockDb, now = new Date()): boolean => {
  let changed = false;

  for (const order of db.orders) {
    if (order.status !== OrderStatus.AWAITING_PAYMENT || !order.paymentExpiresAt) continue;
    const due = new Date(order.paymentExpiresAt);
    if (due.getTime() > now.getTime()) continue;
    changed = failPayment(db, order, "expired", due) || changed;
  }

  for (const part of db.shopOrders) {
    if (part.reminderAt && new Date(part.reminderAt).getTime() <= now.getTime()) {
      part.reminderAt = null;
      changed = true;
    }
    if (!part.deadlineAt) continue;
    const due = new Date(part.deadlineAt);
    if (due.getTime() > now.getTime()) continue;

    const action = AUTO_ACTIONS[part.status];
    if (action) {
      try {
        applyAction(db, part, action, [ShopOrderActor.SYSTEM], {}, due);
      } catch {
        part.deadlineAt = null;
      }
    } else {
      // En livraison depuis trop longtemps : une alerte, pas de décision.
      part.deadlineAt = null;
    }
    changed = true;
  }
  return changed;
};

/** Base à jour de ses échéances : à appeler avant toute lecture de commande. */
export const freshDb = (): MockDb => {
  const db = readDb();
  if (runDeadlines(db)) writeDb(db);
  return db;
};

// ── DTO ─────────────────────────────────────
export const toShopOrder = (
  part: MockShopOrder,
  viewer: Viewer,
  actors: readonly ShopOrderActor[],
  now = new Date()
): ShopOrder => {
  const items = part.items.map((item) => {
    const offer = findLiveOffer(item.productBoutiqueId);
    return {
      productBoutiqueId: item.productBoutiqueId,
      productId: offer?.product?.id,
      productName: offer?.product?.name,
      urlImages: offer?.urlImages.length ? offer.urlImages : (offer?.product?.urlImages ?? []),
      price: item.price,
      quantity: item.quantity,
      lineTotal: item.price * item.quantity,
    };
  });

  return {
    id: part.id,
    orderId: part.orderId,
    reference: part.reference,
    boutique: { id: part.boutiqueId, nom: part.boutiqueNom },
    items,
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: part.subtotal,
    discountAmount: part.discountAmount,
    deliveryFee: part.deliveryFee,
    amount: part.amount,
    delivery: part.delivery,
    shippingAddress: part.shippingAddress,
    customer: viewer === "client" ? undefined : part.customer,
    payment: { ...part.payment },
    status: part.status,
    statusHistory: part.statusHistory.map((entry) => ({
      status: entry.status,
      changedAt: entry.changedAt,
      actor: entry.actor,
      reason: entry.reason,
      reasonLabel: reasonLabel(entry.reason),
      note: entry.note,
    })),
    pickupCode: viewer === "client" ? part.pickupCode : undefined,
    deliveryAttempts: part.deliveryAttempts,
    return: part.return
      ? { ...part.return, reasonLabel: reasonLabel(part.return.reason) ?? part.return.reason }
      : null,
    deadlineAt: part.deadlineAt,
    availableActions: availableActions(actors, part, now),
    createdAt: part.createdAt,
    updatedAt: part.updatedAt,
  };
};

// ── Routes ──────────────────────────────────
// Une sous-commande pas encore payée n'existe pas pour la boutique : ce
// statut ne se filtre pas.
const SHOP_ORDER_STATUSES = Object.values(ShopOrderStatus).filter(
  (status) => status !== ShopOrderStatus.AWAITING_PAYMENT
);

export const listShopOrders = (params: URLSearchParams) => {
  const user = sessionUser();
  if (user.role !== EntityType.ADMIN && user.role !== EntityType.SHOP) {
    throw new ApiError("Accès refusé, vous n'avez pas les permissions nécessaires", 403);
  }
  const admin = user.role === EntityType.ADMIN;
  const boutiqueId = params.get("boutiqueId");
  const group = params.get("group");
  const status = params.get("status");
  const search = params.get("search")?.trim() ?? "";

  if (group && !(SHOP_ORDER_GROUP_KEYS as string[]).includes(group)) {
    throw new ApiError(`Groupe invalide. Valeurs acceptées : ${SHOP_ORDER_GROUP_KEYS.join(", ")}.`, 422);
  }
  if (status && !(SHOP_ORDER_STATUSES as string[]).includes(status)) {
    throw new ApiError(`Statut invalide. Valeurs acceptées : ${SHOP_ORDER_STATUSES.join(", ")}.`, 422);
  }
  if (!admin) {
    if (!boutiqueId) throw new ApiError("Précisez la boutique dont vous lisez les commandes.", 400);
    if (!findShop(boutiqueId)) throw new ApiError("Boutique introuvable.", 404);
    if (!canManageShop(user, boutiqueId)) throw new ApiError(SHOP_FORBIDDEN_MESSAGE, 403);
  }

  const db = freshDb();
  // Une commande pas encore payée n'existe pas pour la boutique.
  const scope = db.shopOrders.filter(
    (part) => part.status !== ShopOrderStatus.AWAITING_PAYMENT && (!boutiqueId || part.boutiqueId === boutiqueId)
  );
  const inGroup = group ? (SHOP_ORDER_GROUPS[group as ShopOrderGroup] as readonly ShopOrderStatus[]) : null;
  const filtered = scope
    .filter((part) => (inGroup ? inGroup.includes(part.status) : !status || part.status === status))
    .filter((part) => !search || part.reference.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      group === "todo"
        ? a.createdAt.localeCompare(b.createdAt)
        : b.updatedAt.localeCompare(a.updatedAt)
    );

  const counts = Object.fromEntries(SHOP_ORDER_GROUP_KEYS.map((key) => [key, 0])) as ShopOrderCounts;
  for (const part of scope) {
    const key = groupOf(part.status);
    if (key) counts[key] += 1;
  }

  const page = Math.max(1, Number(params.get("page") ?? 1));
  const limit = Math.max(1, Math.min(100, Number(params.get("limit") ?? 20)));
  const viewer: Viewer = admin ? "admin" : "shop";
  const actors = admin ? [ShopOrderActor.ADMIN] : [ShopOrderActor.SHOP];

  return ok(
    {
      shopOrders: filtered.slice((page - 1) * limit, page * limit).map((part) => toShopOrder(part, viewer, actors)),
      total: filtered.length,
      page,
      totalPages: Math.ceil(filtered.length / limit),
      counts,
    },
    "Commandes récupérées avec succès"
  );
};

export const getShopOrder = (id: string) => {
  const user = sessionUser();
  const part = freshDb().shopOrders.find((candidate) => candidate.id === id);
  if (!part) throw new ApiError("Commande introuvable.", 404);

  const { actors, viewer } = resolveActors(user, part);
  if (!viewer) throw new ApiError("Vous ne pouvez consulter que vos propres commandes.", 403);
  if (part.status === ShopOrderStatus.AWAITING_PAYMENT && viewer === "shop") {
    throw new ApiError("Commande introuvable.", 404);
  }
  return ok(toShopOrder(part, viewer, actors), "Commande récupérée avec succès");
};

/** Corps JSON ou FormData (photos d'un retour), lu comme le ferait multer. */
const readActionBody = (body: unknown): { fields: Record<string, unknown>; photos: File[] } => {
  if (body instanceof FormData) {
    const fields: Record<string, unknown> = {};
    const photos: File[] = [];
    body.forEach((value, key) => {
      if (typeof value !== "string") {
        if (key === "photos") photos.push(value);
        return;
      }
      fields[key] = value;
    });
    return { fields, photos };
  }
  return { fields: (body ?? {}) as Record<string, unknown>, photos: [] };
};

export const performAction = (id: string, actionName: string, body: unknown) => {
  const user = sessionUser();
  const { fields, photos } = readActionBody(body);

  // ── Forme, comme shopOrderActionForm ──────
  const errors: string[] = [];
  if (!isManualAction(actionName)) {
    errors.push("Action inconnue.");
  }
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : undefined);
  const reason = text(fields.reason);
  const note = text(fields.note);
  const code = text(fields.code);
  const resolution = text(fields.resolution);
  const rawAmount = fields.refundAmount;
  const refundAmount =
    rawAmount === undefined || rawAmount === "" ? undefined : Number.parseInt(String(rawAmount), 10);

  if (reason !== undefined && reason.length > 50) errors.push("Motif invalide.");
  if (note !== undefined && note.length > 500) errors.push("Maximum 500 caractères.");
  if (code !== undefined && code !== "" && !/^\d{6}$/.test(code)) errors.push("Le code de remise compte 6 chiffres.");
  if (resolution !== undefined && !["refund_full", "refund_partial", "rejected"].includes(resolution)) {
    errors.push("Décision invalide. Valeurs acceptées : refund_full, refund_partial, rejected.");
  }
  if (refundAmount !== undefined && (!Number.isInteger(refundAmount) || refundAmount < 1)) {
    errors.push("Le montant remboursé doit être un entier positif de GNF.");
  }
  if (photos.length > 3) errors.push("3 photos au plus.");
  if (errors.length > 0) throw new ApiError(errors.join(" | "), 422);
  if (photos.length > 0 && actionName !== "return") {
    throw new ApiError("Seule une demande de retour accepte des photos.", 400);
  }

  const db = freshDb();
  const part = db.shopOrders.find((candidate) => candidate.id === id);
  if (!part || part.status === ShopOrderStatus.AWAITING_PAYMENT) throw new ApiError("Commande introuvable.", 404);

  const { actors, viewer } = resolveActors(user, part);
  if (!viewer) throw new ApiError("Vous ne pouvez agir que sur vos propres commandes.", 403);

  const now = new Date();
  applyAction(
    db,
    part,
    actionName as AnyAction,
    actors,
    {
      reason: reason || undefined,
      note,
      code,
      resolution: resolution as RuleInput["resolution"],
      refundAmount,
      // URL d'objet : les photos ne survivent pas à un rechargement en mode simulé.
      photos: photos.map((photo) => URL.createObjectURL(photo)),
    },
    now,
    user._id
  );
  writeDb(db);
  return ok(toShopOrder(part, viewer, actors, now), "Commande mise à jour.");
};
