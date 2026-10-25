import { DeliveryMode } from "../../../entities/delivery";
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  ShopOrderActor,
  ShopOrderPaymentStatus,
  ShopOrderStatus,
} from "../../../entities/order";
import type { MockOrder, MockShopOrder } from "./accountSeed";
import { OFFERS } from "./catalogSeed";
import type { MockDb } from "./mockDb";
import { allocateDiscount, generatePickupCode, orderStatusFrom, scheduleFor } from "./shopOrderRules";

// ─────────────────────────────────────────────
//  Commandes simulées d'avant les sous-commandes.
//
//  Une base enregistrée dans ce navigateur avant leur arrivée garde ses
//  commandes : chacune reçoit ses sous-commandes à la lecture, comme le fait
//  Back/src/migrations/shopOrders.migration.ts sur le vrai serveur. Livrée
//  devient terminée, annulée reste annulée, le reste reprend où il en était.
// ─────────────────────────────────────────────

const LEGACY_STATUS: Record<string, ShopOrderStatus> = {
  pending: ShopOrderStatus.PENDING,
  confirmed: ShopOrderStatus.CONFIRMED,
  shipped: ShopOrderStatus.SHIPPED,
  delivered: ShopOrderStatus.COMPLETED,
  cancelled: ShopOrderStatus.CANCELLED,
};

const shopOf = (db: MockDb, offerId: string): { id: string; nom?: string | undefined } | null => {
  const offer = OFFERS.find((candidate) => candidate.id === offerId) ?? db.offers.find((candidate) => candidate.id === offerId);
  if (!offer) return null;
  if ("boutique" in offer && offer.boutique) return { id: offer.boutique.id, nom: offer.boutique.nom };
  return "boutiqueId" in offer ? { id: offer.boutiqueId } : null;
};

const buildParts = (db: MockDb, order: MockOrder, now: Date): MockShopOrder[] => {
  const byShop = new Map<string, { nom?: string | undefined; items: MockOrder["items"] }>();
  for (const item of order.items) {
    const shop = shopOf(db, item.productBoutiqueId);
    if (!shop) continue;
    const entry = byShop.get(shop.id) ?? { nom: shop.nom, items: [] };
    entry.items.push(item);
    byShop.set(shop.id, entry);
  }

  const groups = [...byShop.entries()];
  const subtotals = groups.map(([, group]) => group.items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  const shares = allocateDiscount(subtotals, order.discountAmount);
  const status = LEGACY_STATUS[order.status] ?? ShopOrderStatus.PENDING;
  const schedule = scheduleFor(status, now);
  const user = db.users.find((candidate) => candidate._id === order.userId);
  const deliveredAt = order.statusHistory.find((entry) => entry.status === "delivered")?.changedAt ?? order.updatedAt;

  return groups.map(([boutiqueId, group], index) => {
    const delivery = order.deliveries.find((candidate) => candidate.boutiqueId === boutiqueId) ?? {
      boutiqueId,
      boutiqueNom: group.nom,
      method: DeliveryMode.FLAT_RATE,
      fee: index === 0 ? order.shippingFee : 0,
    };
    const subtotal = subtotals[index] ?? 0;
    const discount = shares[index] ?? 0;
    const history: MockShopOrder["statusHistory"] = order.statusHistory.flatMap((entry) => {
      const mapped = entry.status === "delivered" ? ShopOrderStatus.DELIVERED : LEGACY_STATUS[entry.status];
      return mapped ? [{ status: mapped, changedAt: entry.changedAt, actor: ShopOrderActor.SYSTEM, note: entry.note }] : [];
    });
    if (status === ShopOrderStatus.COMPLETED) {
      history.push({
        status,
        changedAt: now.toISOString(),
        actor: ShopOrderActor.SYSTEM,
        note: "Clôturée à la migration des commandes",
      });
    }

    return {
      id: `${order.id}-${index + 1}`,
      orderId: order.id,
      userId: order.userId,
      boutiqueId,
      boutiqueNom: delivery.boutiqueNom ?? group.nom,
      reference: `${order.reference}-${index + 1}`,
      items: group.items,
      subtotal,
      discountAmount: discount,
      deliveryFee: delivery.fee,
      amount: Math.max(0, subtotal - discount) + delivery.fee,
      delivery,
      ...(order.shippingAddress && delivery.method !== DeliveryMode.PICKUP
        ? { shippingAddress: order.shippingAddress }
        : {}),
      customer: { nom: user?.nom ?? "Client", prenom: user?.prenom ?? "", telephone: user?.telephone },
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
        refundedAt: null,
      },
      status,
      statusHistory: history,
      pickupCode: generatePickupCode(),
      deliveryAttempts: status === ShopOrderStatus.SHIPPED || status === ShopOrderStatus.COMPLETED ? 1 : 0,
      return: null,
      deadlineAt: schedule.deadlineAt,
      reminderAt: schedule.reminderAt,
      createdAt: order.createdAt,
      updatedAt: now.toISOString(),
    };
  });
};

/** Découpe les commandes qui n'ont pas encore de sous-commandes. */
export const migrateLegacyOrders = (db: MockDb, now = new Date()): MockDb => {
  const done = new Set(db.shopOrders.map((part) => part.orderId));
  const legacy = db.orders.filter((order) => !done.has(order.id));
  if (legacy.length === 0) return db;

  const shopOrders = [...db.shopOrders];
  const orders = db.orders.map((order) => {
    if (done.has(order.id)) return order;
    const parts = buildParts(db, order, now);
    shopOrders.push(...parts);
    return {
      ...order,
      status: parts.length > 0 ? orderStatusFrom(parts.map((part) => part.status)) : OrderStatus.CANCELLED,
      paymentMethod: PaymentMethod.ON_DELIVERY,
      paymentStatus: OrderPaymentStatus.ON_DELIVERY,
      paidAt: null,
      paymentExpiresAt: null,
    };
  });
  return { ...db, orders, shopOrders };
};
