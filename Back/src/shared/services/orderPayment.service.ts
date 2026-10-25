import mongoose, { type Types } from "mongoose";
import {
  Order,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  type IOrder,
} from "../../models/order.model.js";
import {
  ShopOrder,
  ShopOrderActor,
  ShopOrderPaymentStatus,
  ShopOrderStatus,
  type IShopOrder,
} from "../../models/shopOrder.model.js";
import { Cart } from "../../models/cart.model.js";
import logger from "../logger/logger.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { runInTransaction } from "../helpers/transaction.js";
import { scheduleFor } from "../helpers/shopOrder.workflow.js";
import { releaseCoupon, restoreStock } from "./shopOrder.service.js";

// ─────────────────────────────────────────────
//  Paiement en ligne d'une commande.
//
//  Au checkout, la commande attend son paiement : stock réservé, sous-
//  commandes invisibles des boutiques. Seule une confirmation du prestataire
//  (jamais le navigateur du client) la fait partir chez les boutiques ; un
//  refus, ou 30 minutes sans confirmation, la fait échouer et rend le stock.
//  Les deux fonctions sont idempotentes : une notification reçue deux fois ne
//  fait rien la seconde.
// ─────────────────────────────────────────────

export interface PaymentSettlement {
  order: IOrder;
  parts: IShopOrder[];
  /** false : la commande était déjà dans cet état, rien n'a été fait. */
  changed: boolean;
}

const loadAwaitingOrder = async (orderId: Types.ObjectId | string, session: mongoose.ClientSession) => {
  const order = await Order.findById(orderId).session(session);
  if (!order) throw new HttpError("Commande introuvable.", 404);
  if (order.paymentMethod !== PaymentMethod.ONLINE) {
    throw new HttpError("Cette commande se paie à la livraison ou au retrait.", 400);
  }
  return order;
};

export const confirmOrderPayment = (
  orderId: Types.ObjectId | string,
  now = new Date()
): Promise<PaymentSettlement> =>
  runInTransaction(async (session) => {
    const order = await loadAwaitingOrder(orderId, session);
    if (order.paymentStatus === OrderPaymentStatus.PAID) return { order, parts: [], changed: false };
    if (order.paymentStatus !== OrderPaymentStatus.PENDING) {
      throw new HttpError("Ce paiement ne peut plus être confirmé : la commande a expiré.", 409);
    }

    const parts = await ShopOrder.find({ orderId: order._id }).session(session);
    for (const part of parts) {
      if (part.status !== ShopOrderStatus.AWAITING_PAYMENT) continue;
      part.status = ShopOrderStatus.PENDING;
      const schedule = scheduleFor(ShopOrderStatus.PENDING, now);
      part.deadlineAt = schedule.deadlineAt;
      part.reminderAt = schedule.reminderAt;
      part.payment.status = ShopOrderPaymentStatus.PAID;
      part.payment.paidAt = now;
      part.statusHistory.push({
        status: ShopOrderStatus.PENDING,
        changedAt: now,
        actor: ShopOrderActor.SYSTEM,
        note: "Paiement confirmé",
      });
      await part.save({ session });
    }

    order.paymentStatus = OrderPaymentStatus.PAID;
    order.paidAt = now;
    order.paymentExpiresAt = null;
    order.status = OrderStatus.IN_PROGRESS;
    order.statusHistory.push({ status: OrderStatus.IN_PROGRESS, changedAt: now, note: "Paiement confirmé" });
    await order.save({ session });

    return { order, parts, changed: true };
  });

export const failOrderPayment = (
  orderId: Types.ObjectId | string,
  cause: "refused" | "expired",
  now = new Date()
): Promise<PaymentSettlement> =>
  runInTransaction(async (session) => {
    const order = await loadAwaitingOrder(orderId, session);
    if (order.paymentStatus === OrderPaymentStatus.FAILED) return { order, parts: [], changed: false };
    if (order.paymentStatus !== OrderPaymentStatus.PENDING) {
      throw new HttpError("Ce paiement est déjà confirmé.", 409);
    }

    const note = cause === "expired" ? "Paiement non confirmé sous 30 minutes" : "Paiement refusé";
    const parts = await ShopOrder.find({ orderId: order._id }).session(session);
    for (const part of parts) {
      if (part.status !== ShopOrderStatus.AWAITING_PAYMENT) continue;
      await restoreStock(part.items, session);
      part.status = ShopOrderStatus.CANCELLED;
      part.payment.status = ShopOrderPaymentStatus.VOID;
      part.deadlineAt = null;
      part.reminderAt = null;
      part.statusHistory.push({ status: ShopOrderStatus.CANCELLED, changedAt: now, actor: ShopOrderActor.SYSTEM, note });
      await part.save({ session });
    }

    order.paymentStatus = OrderPaymentStatus.FAILED;
    order.paymentExpiresAt = null;
    order.status = OrderStatus.PAYMENT_FAILED;
    order.statusHistory.push({ status: OrderStatus.PAYMENT_FAILED, changedAt: now, note });
    if (order.promotionCode) await releaseCoupon(order.promotionCode, session);
    await order.save({ session });

    return { order, parts, changed: true };
  });

/**
 * Après un paiement échoué, les articles retournent dans le panier : le
 * client réessaie sans tout rechercher. Au mieux : un échec ici est journalisé.
 */
export const restoreCartAfterFailedPayment = async (order: Pick<IOrder, "userId" | "items" | "reference">) => {
  try {
    const cart = (await Cart.findOne({ userId: order.userId })) ?? new Cart({ userId: order.userId, items: [] });
    for (const item of order.items) {
      const existing = cart.items.find((line) => line.productBoutiqueId.toString() === item.productBoutiqueId.toString());
      if (existing) continue;
      cart.items.push({ productBoutiqueId: item.productBoutiqueId, quantity: item.quantity, price: item.price });
    }
    cart.amount = cart.items.reduce((sum, line) => sum + line.price * line.quantity, 0);
    await cart.save();
  } catch (error) {
    logger.error(`Panier non restauré après l'échec du paiement de ${order.reference} : ${(error as Error).message}`);
  }
};
