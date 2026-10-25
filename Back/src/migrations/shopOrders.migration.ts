import dotenv from "dotenv";
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import { DB_CONNECT } from "../db/db.js";
import { DeliveryMethod, type IOrderDelivery } from "../models/delivery.model.js";
import {
  Order,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  type IOrder,
  type IOrderItem,
} from "../models/order.model.js";
import {
  ShopOrder,
  ShopOrderActor,
  ShopOrderPaymentStatus,
  ShopOrderStatus,
  type IShopOrderHistory,
} from "../models/shopOrder.model.js";
import { Shop } from "../models/boutique.model.js";
import { User, type IUser } from "../models/user.model.js";
import {
  allocateDiscount,
  generatePickupCode,
  orderStatusFrom,
  scheduleFor,
} from "../shared/helpers/shopOrder.workflow.js";

// ─────────────────────────────────────────────
//  Migration : sous-commandes des commandes passées avant leur arrivée
//
//    npm run migrate:shop-orders
//
//  Chaque commande sans sous-commande en reçoit une par boutique, avec ses
//  articles, sa livraison et sa part du coupon. L'ancien statut global est
//  repris par chaque partie : livrée devient terminée (le délai de retour est
//  dépassé depuis longtemps), en attente le reste — et expirera 48 h après la
//  migration si la boutique ne la confirme pas.
//
//  Idempotente : une commande qui a déjà ses sous-commandes est ignorée.
//  Le seed l'utilise aussi pour ses commandes de démonstration.
// ─────────────────────────────────────────────

const LEGACY_STATUS: Record<string, ShopOrderStatus> = {
  [OrderStatus.PENDING]: ShopOrderStatus.PENDING,
  [OrderStatus.CONFIRMED]: ShopOrderStatus.CONFIRMED,
  [OrderStatus.SHIPPED]: ShopOrderStatus.SHIPPED,
  [OrderStatus.DELIVERED]: ShopOrderStatus.COMPLETED,
  [OrderStatus.CANCELLED]: ShopOrderStatus.CANCELLED,
};

/** Statut d'une sous-commande dans l'historique ancien. */
const legacyHistoryStatus = (status: string): ShopOrderStatus | null =>
  status === OrderStatus.DELIVERED ? ShopOrderStatus.DELIVERED : LEGACY_STATUS[status] ?? null;

/**
 * Construit les sous-commandes d'une commande ancienne, sans accès à la base.
 * Les commandes antérieures aux livraisons par boutique (`deliveries` vide)
 * gardent leurs frais : ils vont à la première partie, en prix fixe.
 */
export const buildLegacyParts = (
  order: IOrder,
  customer: Pick<IUser, "nom" | "prenom" | "telephone"> | null,
  shopNames: Map<string, string>,
  now: Date
): Record<string, unknown>[] => {
  const byShop = new Map<string, IOrderItem[]>();
  for (const item of order.items) {
    if (!item.boutiqueId) continue;
    const key = item.boutiqueId.toString();
    byShop.set(key, [...(byShop.get(key) ?? []), item]);
  }

  const groups = [...byShop.entries()];
  const subtotals = groups.map(([, items]) => items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  const shares = allocateDiscount(subtotals, order.discountAmount ?? 0);
  const status = LEGACY_STATUS[order.status] ?? ShopOrderStatus.PENDING;
  const schedule = scheduleFor(status, now);
  const deliveredAt =
    order.statusHistory?.find((entry) => entry.status === OrderStatus.DELIVERED)?.changedAt ?? order.updatedAt;

  return groups.map(([boutiqueId, items], index) => {
    const found = order.deliveries?.find((delivery) => delivery.boutiqueId.toString() === boutiqueId);
    const delivery: IOrderDelivery = found ?? {
      boutiqueId: new mongoose.Types.ObjectId(boutiqueId),
      boutiqueNom: shopNames.get(boutiqueId),
      method: DeliveryMethod.FLAT_RATE,
      fee: index === 0 ? order.shippingFee ?? 0 : 0,
    };
    const subtotal = subtotals[index] ?? 0;
    const discount = shares[index] ?? 0;

    const history: IShopOrderHistory[] = (order.statusHistory ?? [])
      .map((entry) => ({ entry, mapped: legacyHistoryStatus(entry.status) }))
      .filter((line): line is { entry: (typeof order.statusHistory)[number]; mapped: ShopOrderStatus } => line.mapped !== null)
      .map(({ entry, mapped }) => ({
        status: mapped,
        changedAt: entry.changedAt,
        actor: ShopOrderActor.SYSTEM,
        ...(entry.changedBy ? { changedBy: entry.changedBy } : {}),
        ...(entry.note ? { note: entry.note } : {}),
      }));
    if (status === ShopOrderStatus.COMPLETED) {
      history.push({ status, changedAt: now, actor: ShopOrderActor.SYSTEM, note: "Clôturée à la migration des commandes" });
    }

    return {
      orderId: order._id,
      userId: order.userId,
      boutiqueId: delivery.boutiqueId,
      boutiqueNom: delivery.boutiqueNom ?? shopNames.get(boutiqueId),
      reference: `${order.reference}-${index + 1}`,
      items,
      subtotal,
      discountAmount: discount,
      deliveryFee: delivery.fee,
      amount: Math.max(0, subtotal - discount) + delivery.fee,
      delivery,
      ...(order.shippingAddress && delivery.method !== DeliveryMethod.PICKUP
        ? { shippingAddress: order.shippingAddress }
        : {}),
      customer: {
        nom: customer?.nom ?? "Client",
        prenom: customer?.prenom ?? "",
        telephone: order.telephone ?? customer?.telephone,
      },
      payment: {
        method: PaymentMethod.ON_DELIVERY,
        status:
          status === ShopOrderStatus.COMPLETED
            ? ShopOrderPaymentStatus.PAID
            : status === ShopOrderStatus.CANCELLED
              ? ShopOrderPaymentStatus.VOID
              : ShopOrderPaymentStatus.UNPAID,
        paidAt: status === ShopOrderStatus.COMPLETED ? deliveredAt : null,
        refundedAmount: 0,
      },
      status,
      statusHistory: history,
      pickupCode: generatePickupCode(),
      deliveryAttempts: status === ShopOrderStatus.SHIPPED || status === ShopOrderStatus.COMPLETED ? 1 : 0,
      deadlineAt: schedule.deadlineAt,
      reminderAt: schedule.reminderAt,
      createdAt: order.createdAt,
      updatedAt: now,
    };
  });
};

export interface ShopOrderMigrationReport {
  orders: number;
  parts: number;
  skipped: number;
}

export const migrateLegacyOrders = async (now = new Date()): Promise<ShopOrderMigrationReport> => {
  const report: ShopOrderMigrationReport = { orders: 0, parts: 0, skipped: 0 };
  const done = new Set((await ShopOrder.distinct("orderId")).map(String));
  const shopNames = new Map((await Shop.find({}).select("nom")).map((shop) => [shop._id.toString(), shop.nom]));

  for await (const order of Order.find({}).cursor()) {
    if (done.has(order._id.toString())) continue;

    const customer = await User.findById(order.userId).select("nom prenom telephone");
    const parts = buildLegacyParts(order, customer, shopNames, now);
    if (parts.length === 0) {
      report.skipped += 1;
      continue;
    }

    // Insertion directe : createdAt reste celui de la commande.
    const validated = [];
    for (const part of parts) {
      const document = new ShopOrder(part);
      await document.validate();
      validated.push(document.toObject({ depopulate: true }));
    }
    await ShopOrder.collection.insertMany(validated);

    const statuses = parts.map((part) => part.status as ShopOrderStatus);
    await Order.collection.updateOne(
      { _id: order._id },
      {
        $set: {
          status: orderStatusFrom(statuses),
          paymentMethod: PaymentMethod.ON_DELIVERY,
          paymentStatus: OrderPaymentStatus.ON_DELIVERY,
        },
      }
    );
    report.orders += 1;
    report.parts += parts.length;
  }
  return report;
};

const main = async () => {
  dotenv.config();
  await DB_CONNECT();
  try {
    const report = await migrateLegacyOrders();
    console.log(`${String(report.orders).padStart(7)}  commandes découpées`);
    console.log(`${String(report.parts).padStart(7)}  sous-commandes créées`);
    console.log(`${String(report.skipped).padStart(7)}  commandes ignorées (aucun article rattaché à une boutique)`);
    console.log("Migration des sous-commandes terminée.");
  } finally {
    await mongoose.disconnect();
  }
};

// Exécuté seulement en ligne de commande, pas à l'import (tests, seed).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Migration interrompue : ${(error as Error).message}`);
    process.exit(1);
  });
}
