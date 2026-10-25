import mongoose, { type ClientSession, type Types } from "mongoose";
import { Order, OrderStatus, PaymentMethod, type IOrder, type IOrderItem } from "../../models/order.model.js";
import {
  SHOP_ORDER_NEGATIVE_END,
  ShopOrder,
  ShopOrderActor,
  ShopOrderPaymentStatus,
  ShopOrderStatus,
  type IShopOrder,
} from "../../models/shopOrder.model.js";
import { productBoutique } from "../../models/product.model.js";
import { Promotion } from "../../models/promotion.model.js";
import logger from "../logger/logger.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { getPaymentProvider } from "../payment/payment.provider.js";
import {
  ACTION_RULES,
  checkAction,
  refundAmountFor,
  scheduleFor,
  orderStatusFrom,
  ShopOrderAction,
  targetStatus,
  type ActionInput,
} from "../helpers/shopOrder.workflow.js";

// ─────────────────────────────────────────────
//  Écritures sur les sous-commandes.
//
//  Toute action — d'une personne ou de la plateforme à l'échéance d'un délai —
//  passe par applyShopOrderAction : mêmes contrôles, mêmes effets, même
//  historique. L'appelant ouvre la transaction ; les effets externes
//  (remboursement chez le prestataire, emails) se font après sa validation.
// ─────────────────────────────────────────────

export interface ActionResult {
  part: IShopOrder;
  order: IOrder | null;
  /** Statut avant l'action. */
  from: ShopOrderStatus;
  /** Montant à rendre au client ; 0 si rien n'avait été encaissé. */
  refund: number;
  /** Le remboursement passe par le prestataire de paiement, après la transaction. */
  refundViaProvider: boolean;
}

/** Rend au stock les articles d'une sous-commande. */
export const restoreStock = async (items: readonly IOrderItem[], session: ClientSession): Promise<void> => {
  for (const item of items) {
    const offer = await productBoutique.findById(item.productBoutiqueId).session(session);
    if (offer) {
      offer.stock += item.quantity;
      await offer.save({ session });
    }
  }
};

/**
 * Refus pour rupture : le stock réservé n'est pas rendu, l'offre passe à 0.
 * Sinon d'autres clients commanderaient un produit que la boutique n'a plus.
 */
const markOutOfStock = async (items: readonly IOrderItem[], session: ClientSession): Promise<void> => {
  for (const item of items) {
    const offer = await productBoutique.findById(item.productBoutiqueId).session(session);
    if (offer && offer.stock !== 0) {
      offer.stock = 0;
      await offer.save({ session });
    }
  }
};

/** Rend une utilisation du coupon, quand toute la commande a échoué. */
export const releaseCoupon = async (code: string, session: ClientSession): Promise<void> => {
  const promo = await Promotion.findOne({ code }).session(session);
  if (promo && promo.usedCount > 0) {
    promo.usedCount -= 1;
    await promo.save({ session });
  }
};

/**
 * Recalcule le statut de la commande d'après ses sous-commandes. `changed`
 * porte les sous-commandes modifiées dans cette transaction, dont la version
 * en mémoire fait foi. Une commande dont le paiement a échoué ne bouge plus.
 */
export const syncOrderStatus = async (
  orderId: Types.ObjectId,
  changed: readonly IShopOrder[],
  session: ClientSession,
  now: Date,
  userId?: string
): Promise<IOrder | null> => {
  const order = await Order.findById(orderId).session(session);
  if (!order) return null;
  if (order.status === OrderStatus.PAYMENT_FAILED) return order;

  const parts = await ShopOrder.find({ orderId }).session(session);
  const statuses = parts.map((part) => (changed.find((c) => c._id.equals(part._id)) ?? part).status);
  const next = orderStatusFrom(statuses);

  if (order.status !== next) {
    order.status = next;
    order.statusHistory.push({
      status: next,
      changedAt: now,
      ...(userId ? { changedBy: new mongoose.Types.ObjectId(userId) } : {}),
    });
    // Tout a échoué : l'utilisation du coupon est rendue au client.
    if (next === OrderStatus.CANCELLED && order.promotionCode) {
      await releaseCoupon(order.promotionCode, session);
    }
    await order.save({ session });
  }
  return order;
};

const DEFAULT_NOTES: Partial<Record<ShopOrderAction, string>> = {
  [ShopOrderAction.ESCALATE]: "La boutique n'a pas répondu au retour sous 48 heures.",
  [ShopOrderAction.CONFIRM_REFUND]: "Remboursement effectué.",
};

export interface ApplyActionParams {
  part: IShopOrder;
  action: ShopOrderAction;
  /** Rôles de la personne sur CETTE sous-commande. */
  actors: readonly ShopOrderActor[];
  userId?: string | undefined;
  input: ActionInput;
  now: Date;
  session: ClientSession;
}

/** Applique une action et ses effets. Lève une HttpError si elle est interdite. */
export const applyShopOrderAction = async ({
  part,
  action,
  actors,
  userId,
  input,
  now,
  session,
}: ApplyActionParams): Promise<ActionResult> => {
  const rule = ACTION_RULES[action];
  const actor = rule.actors.find((candidate) => actors.includes(candidate));
  if (!actor) throw new HttpError("Vous ne pouvez pas effectuer cette action sur cette commande.", 403);

  const refusal = checkAction(action, actors, part, input, now);
  if (refusal) throw new HttpError(refusal, 400);

  const from = part.status;
  const to = targetStatus(action, input, part);
  const note = input.note?.trim() || DEFAULT_NOTES[action];

  // ── Effets propres à l'action ─────────────
  switch (action) {
    case ShopOrderAction.SHIP:
    case ShopOrderAction.RETRY_DELIVERY:
      part.deliveryAttempts += 1;
      break;
    case ShopOrderAction.DELIVER:
      // Paiement à la remise : la boutique encaisse en remettant le colis.
      if (part.payment.method === PaymentMethod.ON_DELIVERY) {
        part.payment.status = ShopOrderPaymentStatus.PAID;
        part.payment.paidAt = now;
      }
      break;
    case ShopOrderAction.REQUEST_RETURN:
      part.return = {
        reason: input.reason ?? "",
        details: input.note?.trim() || undefined,
        photos: input.photos ?? [],
        requestedAt: now,
      };
      break;
    case ShopOrderAction.REJECT_RETURN:
    case ShopOrderAction.ACCEPT_RETURN:
    case ShopOrderAction.ESCALATE:
      if (part.return) {
        part.return.respondedAt = now;
        if (action === ShopOrderAction.REJECT_RETURN) part.return.shopResponse = input.note?.trim();
      }
      break;
    case ShopOrderAction.RESOLVE_DISPUTE:
      if (part.return) {
        part.return.resolution = input.resolution;
        part.return.resolutionNote = input.note?.trim();
        part.return.resolvedAt = now;
      }
      break;
    case ShopOrderAction.CONFIRM_REFUND:
      part.payment.status =
        part.payment.refundedAmount >= part.amount
          ? ShopOrderPaymentStatus.REFUNDED
          : ShopOrderPaymentStatus.PARTIALLY_REFUNDED;
      part.payment.refundedAt = now;
      break;
    default:
      break;
  }

  // ── Fin négative : le stock et l'argent ───
  let refund = 0;
  let refundViaProvider = false;
  if (SHOP_ORDER_NEGATIVE_END.includes(to) && !SHOP_ORDER_NEGATIVE_END.includes(from)) {
    if (to === ShopOrderStatus.REFUSED && input.reason === "out_of_stock") {
      await markOutOfStock(part.items, session);
    } else if (to !== ShopOrderStatus.RETURNED) {
      // Un produit retourné ne revient pas d'office en vente : la boutique
      // juge s'il est revendable et corrige son stock elle-même.
      await restoreStock(part.items, session);
    }

    if (part.payment.status === ShopOrderPaymentStatus.PAID) {
      refund = refundAmountFor(part, to, input);
      if (refund > 0) {
        part.payment.status = ShopOrderPaymentStatus.REFUND_PENDING;
        part.payment.refundedAmount = refund;
        // En ligne, le prestataire rend l'argent ; à la remise, la boutique
        // rembourse en reprenant le produit puis le déclare (confirm-refund).
        refundViaProvider = part.payment.method === PaymentMethod.ONLINE;
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
    changedAt: now,
    actor,
    ...(userId ? { changedBy: new mongoose.Types.ObjectId(userId) } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(note ? { note } : {}),
  });

  await part.save({ session });
  const order = await syncOrderStatus(part.orderId, [part], session, now, userId);

  return { part, order, from, refund, refundViaProvider };
};

/**
 * Après la transaction : rembourse chez le prestataire. Un échec laisse la
 * sous-commande « remboursement en cours » : rien n'est perdu, l'admin la voit.
 */
export const settleProviderRefund = async (part: IShopOrder, order: Pick<IOrder, "paymentRef"> | null): Promise<void> => {
  const provider = getPaymentProvider();
  if (!provider) {
    logger.error(`Remboursement de ${part.reference} en attente : aucun prestataire de paiement configuré`);
    return;
  }
  try {
    const result = await provider.refund({
      providerRef: order?.paymentRef ?? null,
      amount: part.payment.refundedAmount,
      reference: part.reference,
    });
    if (result.status === "refunded") {
      part.payment.status =
        part.payment.refundedAmount >= part.amount
          ? ShopOrderPaymentStatus.REFUNDED
          : ShopOrderPaymentStatus.PARTIALLY_REFUNDED;
      part.payment.refundedAt = new Date();
      await part.save();
    }
    logger.info(`Remboursement ${result.status} pour ${part.reference} : ${part.payment.refundedAmount} GNF`);
  } catch (error) {
    logger.error(`Remboursement de ${part.reference} échoué : ${(error as Error).message}`);
  }
};
