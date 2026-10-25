import type { Request, Response } from "express";
import { validationResult } from "express-validator";
import { Order, OrderPaymentStatus, OrderStatus, PaymentMethod, type IOrder } from "../models/order.model.js";
import { EntityType, User } from "../models/user.model.js";
import type { IShopOrder } from "../models/shopOrder.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js";
import { HttpError } from "../shared/middlewares/error.middleware.js";
import { getPaymentProvider, isSandboxPayment } from "../shared/payment/payment.provider.js";
import { sendOrderConfirmationMail } from "../shared/helpers/mail.helper.js";
import {
  confirmOrderPayment,
  failOrderPayment,
  refundLatePayment,
  restoreCartAfterFailedPayment,
} from "../shared/services/orderPayment.service.js";
import { deliverNotices, newPartNotices } from "../shared/services/shopOrder.notifications.js";

// ─────────────────────────────────────────────
//  Paiement en ligne.
//
//   POST /payments/:orderId            relance le paiement d'une commande en attente
//   POST /payments/sandbox/:orderId    { outcome: paid | failed } — prestataire simulé
//
//  Le prestataire simulé n'existe que hors production : la page de paiement
//  factice du front appelle la seconde route à la place de la notification
//  signée qu'enverrait un vrai prestataire.
// ─────────────────────────────────────────────

const sendError = (res: Response, error: unknown, context: string) => {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json(new BaseResponse(false, error.message, error.statusCode, null));
  }
  logger.error(`${context} : ${(error as Error).message}`);
  const response = BaseResponse.ServerError((error as Error).message);
  return res.status(response.statusCode).json(response);
};

/** Commande en ligne du demandeur (ou n'importe laquelle pour l'administration). */
const loadOwnOnlineOrder = async (req: Request): Promise<IOrder> => {
  const order = await Order.findById(String(req.params.orderId));
  if (!order) throw new HttpError("Commande introuvable.", 404);
  if (req.user?.entityType !== EntityType.ADMIN && order.userId.toString() !== req.user?.id) {
    throw new HttpError("Vous ne pouvez payer que vos propres commandes.", 403);
  }
  if (order.paymentMethod !== PaymentMethod.ONLINE) {
    throw new HttpError("Cette commande se paie à la livraison ou au retrait.", 400);
  }
  return order;
};

const paymentSummary = (order: IOrder) => ({
  orderId: order._id.toString(),
  status: order.status,
  paymentStatus: order.paymentStatus,
  paymentExpiresAt: order.paymentExpiresAt ?? null,
});

/** Paiement confirmé : le client reçoit son récapitulatif, chaque boutique sa commande. */
export const notifyPaidOrder = async (order: IOrder, parts: IShopOrder[]): Promise<void> => {
  for (const part of parts) await deliverNotices(newPartNotices(part), part);
  try {
    const user = await User.findById(order.userId);
    if (user) {
      sendOrderConfirmationMail(user, {
        reference: order.reference,
        items: order.items.map((item) => ({
          productName: item.productName ?? "Article",
          quantity: item.quantity,
          price: item.price,
        })),
        subtotal: order.subtotal,
        discountAmount: order.discountAmount,
        shippingFee: order.shippingFee,
        amount: order.amount,
        ...(order.adresse ? { adresse: order.adresse } : {}),
      });
    }
  } catch (error) {
    logger.error(`Email de confirmation de ${order.reference} non envoyé : ${(error as Error).message}`);
  }
};

// ─────────────────────────────────────────────
//  POST /payments/:orderId — le client revient payer une commande en attente.
// ─────────────────────────────────────────────
export const restartPayment = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | ")));
    }

    const order = await loadOwnOnlineOrder(req);
    if (order.status !== OrderStatus.AWAITING_PAYMENT || order.paymentStatus !== OrderPaymentStatus.PENDING) {
      throw new HttpError("Cette commande n'attend plus de paiement.", 409);
    }
    if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() <= Date.now()) {
      throw new HttpError("Le délai de paiement est dépassé : la commande va être annulée.", 409);
    }

    const provider = getPaymentProvider();
    if (!provider) throw new HttpError("Le paiement en ligne n'est pas disponible pour le moment.", 503);

    const initiation = await provider.initiate({
      orderId: order._id.toString(),
      reference: order.reference,
      amount: order.amount,
    });
    order.paymentRef = initiation.providerRef;
    await order.save();

    const response = BaseResponse.WithSuccess(
      { ...paymentSummary(order), redirectUrl: initiation.redirectUrl },
      "Paiement relancé."
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur relance de paiement");
  }
};

// ─────────────────────────────────────────────
//  POST /payments/sandbox/:orderId   { outcome }
//  Ce qu'un vrai prestataire ferait par une notification signée.
// ─────────────────────────────────────────────
export const settleSandboxPayment = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | ")));
    }
    if (!isSandboxPayment()) throw new HttpError("Le paiement simulé est désactivé.", 404);

    const order = await loadOwnOnlineOrder(req);
    const paid = req.body.outcome === "paid";

    if (paid) {
      let settlement;
      try {
        settlement = await confirmOrderPayment(order._id);
      } catch (error) {
        // 409 : la commande a échoué entre-temps (délai dépassé). Le client a
        // payé une commande qui n'existe plus : son argent lui est rendu.
        if (error instanceof HttpError && error.statusCode === 409) {
          const refunded = await refundLatePayment(order);
          throw new HttpError(
            refunded
              ? "Le délai de paiement était dépassé : la commande est annulée et votre paiement remboursé."
              : "Le délai de paiement était dépassé : la commande est annulée. Le remboursement de votre paiement est en cours.",
            409
          );
        }
        throw error;
      }
      if (settlement.changed) await notifyPaidOrder(settlement.order, settlement.parts);
      logger.info(`Paiement simulé confirmé : ${order.reference}`);
      const response = BaseResponse.WithSuccess(paymentSummary(settlement.order), "Paiement confirmé.");
      return res.status(response.statusCode).json(response);
    }

    const settlement = await failOrderPayment(order._id, "refused");
    if (settlement.changed) await restoreCartAfterFailedPayment(settlement.order);
    logger.info(`Paiement simulé refusé : ${order.reference}`);
    const response = BaseResponse.WithSuccess(
      paymentSummary(settlement.order),
      "Paiement refusé : votre panier a été restauré."
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur paiement simulé");
  }
};
