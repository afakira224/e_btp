import { Order, OrderStatus } from "../../models/order.model.js";
import { ShopOrder, ShopOrderActor, ShopOrderStatus } from "../../models/shopOrder.model.js";
import logger from "../logger/logger.js";
import { runInTransaction } from "../helpers/transaction.js";
import { AUTO_ACTIONS } from "../helpers/shopOrder.workflow.js";
import { failOrderPayment, restoreCartAfterFailedPayment } from "./orderPayment.service.js";
import { applyShopOrderAction, settleProviderRefund } from "./shopOrder.service.js";
import {
  deliverNotices,
  noticesForAction,
  reminderNotices,
  stalledNotices,
} from "./shopOrder.notifications.js";

// ─────────────────────────────────────────────
//  Délais automatiques.
//
//  Aucune commande ne reste bloquée parce qu'une personne ne répond pas :
//  toutes les 15 minutes, la plateforme fait échouer les paiements en ligne
//  non confirmés, envoie les rappels, puis applique les échéances (expirer,
//  clôturer, ouvrir un litige) avec les mêmes règles qu'une action manuelle.
//  Chaque sous-commande est traitée dans sa propre transaction : une erreur
//  sur l'une n'empêche pas les autres.
// ─────────────────────────────────────────────

export interface DeadlineSummary {
  payments: number;
  reminders: number;
  actions: number;
  alerts: number;
  errors: number;
}

export const runOrderDeadlines = async (now = new Date()): Promise<DeadlineSummary> => {
  const summary: DeadlineSummary = { payments: 0, reminders: 0, actions: 0, alerts: 0, errors: 0 };

  // 1. Paiements en ligne non confirmés à temps.
  const unpaid = await Order.find({ status: OrderStatus.AWAITING_PAYMENT, paymentExpiresAt: { $lte: now } });
  for (const order of unpaid) {
    try {
      const settlement = await failOrderPayment(order._id, "expired", now);
      if (settlement.changed) {
        await restoreCartAfterFailedPayment(settlement.order);
        summary.payments += 1;
      }
    } catch (error) {
      summary.errors += 1;
      logger.error(`Échec du paiement de ${order.reference} non appliqué : ${(error as Error).message}`);
    }
  }

  // 2. Rappels avant échéance.
  const reminders = await ShopOrder.find({ reminderAt: { $lte: now } });
  for (const part of reminders) {
    try {
      await deliverNotices(reminderNotices(part), part);
      part.reminderAt = null;
      await part.save();
      summary.reminders += 1;
    } catch (error) {
      summary.errors += 1;
      logger.error(`Rappel de ${part.reference} non envoyé : ${(error as Error).message}`);
    }
  }

  // 3. Échéances.
  const due = await ShopOrder.find({ deadlineAt: { $lte: now } });
  for (const part of due) {
    try {
      // En livraison depuis trop longtemps : on alerte, on ne décide pas à la place de la boutique.
      if (part.status === ShopOrderStatus.SHIPPED) {
        await deliverNotices(stalledNotices(part), part);
        part.deadlineAt = null;
        await part.save();
        summary.alerts += 1;
        continue;
      }

      const action = AUTO_ACTIONS[part.status];
      if (!action) {
        part.deadlineAt = null;
        await part.save();
        continue;
      }

      const result = await runInTransaction(async (session) => {
        // Relue dans la transaction : une personne a pu agir entre-temps.
        const fresh = await ShopOrder.findById(part._id).session(session);
        if (!fresh || fresh.status !== part.status) return null;
        return applyShopOrderAction({ part: fresh, action, actors: [ShopOrderActor.SYSTEM], input: {}, now, session });
      });
      if (!result) continue;

      if (result.refundViaProvider) await settleProviderRefund(result.part, result.order);
      await deliverNotices(
        noticesForAction(action, result.part, { refund: result.refund, input: {}, from: result.from }),
        result.part
      );
      summary.actions += 1;
    } catch (error) {
      summary.errors += 1;
      logger.error(`Échéance de ${part.reference} non appliquée : ${(error as Error).message}`);
    }
  }

  return summary;
};

let timer: NodeJS.Timeout | null = null;

/** Lance la tâche toutes les 15 minutes (et une première fois tout de suite). */
export const startOrderScheduler = (intervalMs = 15 * 60 * 1000): void => {
  if (timer) return;
  const tick = () => {
    runOrderDeadlines()
      .then((summary) => {
        const total = summary.payments + summary.reminders + summary.actions + summary.alerts + summary.errors;
        if (total > 0) logger.info(`Délais des commandes : ${JSON.stringify(summary)}`);
      })
      .catch((error) => logger.error(`Tâche des délais en échec : ${(error as Error).message}`));
  };
  timer = setInterval(tick, intervalMs);
  // Le minuteur ne retient pas le processus : l'arrêt propre reste possible.
  timer.unref();
  tick();
};

export const stopOrderScheduler = (): void => {
  if (timer) clearInterval(timer);
  timer = null;
};
