import { DELIVERY_MODE_LABELS, type DeliveryMode } from "../../delivery";
import type { Product, ProductBoutique } from "../../product";
import type { Shop } from "../../shop";
import type { PaymentMethod, ShopOrder, StatusTone } from "./shopOrder.types";

// ─────────────────────────────────────────────
//  Commande — miroir de OrderResponseDto
//  (Back/src/shared/interfaces/Order.interfaces.ts) et des énumérations de
//  Back/src/models/order.model.ts.
//
//  Les lignes sont un instantané pris au moment de la commande : le prix
//  figé est `price`, pas celui de l'offre actuelle.
// ─────────────────────────────────────────────

// Le statut global se déduit des sous-commandes (une par boutique).
// `pending`, `confirmed`, `shipped` et `delivered` sont ceux des commandes
// d'avant les sous-commandes : lisibles, plus produits.
export const OrderStatus = {
  AWAITING_PAYMENT: "awaiting_payment",
  PAYMENT_FAILED: "payment_failed",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  PARTIALLY_COMPLETED: "partially_completed",
  CANCELLED: "cancelled",
  PENDING: "pending",
  CONFIRMED: "confirmed",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const OrderPaymentStatus = {
  ON_DELIVERY: "on_delivery",
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
} as const;

export type OrderPaymentStatus = (typeof OrderPaymentStatus)[keyof typeof OrderPaymentStatus];

// Mode résumé de la commande : celui de toutes ses livraisons, ou `mixed`
// quand les boutiques n'ont pas le même. `standard` et `express` sont ceux
// des commandes passées avant les modes par boutique : lisibles, plus proposés.
export const DeliveryMethod = {
  PICKUP: "pickup",
  FREE: "free",
  FLAT_RATE: "flat_rate",
  STANDARD: "standard",
  EXPRESS: "express",
  MIXED: "mixed",
} as const;

export type DeliveryMethod = (typeof DeliveryMethod)[keyof typeof DeliveryMethod];

/** Une livraison de la commande, figée au checkout : une par boutique. */
export interface OrderDelivery {
  boutiqueId: string;
  boutiqueNom?: string | undefined;
  method: DeliveryMode;
  fee: number;
  /** Adresse de la boutique au moment de la commande, pour un retrait. */
  pickupAdresse?: string | undefined;
}

export interface OrderItem {
  /** Absente si l'offre a été supprimée depuis : le back renvoie alors `undefined`. */
  productBoutique?: ProductBoutique | undefined;
  boutique?: Shop | undefined;
  product?: Product | undefined;
  /** Prix unitaire figé à la commande. */
  price: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderStatusStep {
  status: OrderStatus;
  changedAt: string;
  changedBy?: string | undefined;
  note?: string | undefined;
}

/** Adresse de livraison figée : elle survit à la modification de l'adresse d'origine. */
export interface ShippingAddress {
  destinataire?: string | undefined;
  telephone: string;
  adresse: string;
  ville: string;
  commune?: string | undefined;
  pays: string;
}

export interface Order {
  id: string;
  userId: string;
  reference: string;
  /** Se déduit des sous-commandes. */
  status: OrderStatus;
  statusHistory: OrderStatusStep[];
  paymentMethod: PaymentMethod;
  paymentStatus: OrderPaymentStatus;
  paidAt: string | null;
  /** Échéance d'un paiement en ligne pas encore confirmé. */
  paymentExpiresAt: string | null;
  /** Une sous-commande par boutique, chacune avec son statut et ses actions. */
  parts: ShopOrder[];
  items: OrderItem[];
  totalItems: number;
  subtotal: number;
  discountAmount: number;
  promotionCode?: string | null | undefined;
  shippingFee: number;
  /** À payer : subtotal − discountAmount + shippingFee. */
  amount: number;
  deliveryMethod: DeliveryMethod;
  /** Vide sur les commandes antérieures aux modes par boutique. */
  deliveries: OrderDelivery[];
  addressId?: string | null | undefined;
  shippingAddress?: ShippingAddress | undefined;
  createdAt: string;
  updatedAt: string;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: "En attente de paiement",
  payment_failed: "Paiement échoué",
  in_progress: "En cours",
  completed: "Terminée",
  partially_completed: "Partiellement terminée",
  cancelled: "Annulée",
  pending: "En attente",
  confirmed: "Confirmée",
  shipped: "Expédiée",
  delivered: "Livrée",
};

export const ORDER_STATUS_TONES: Record<OrderStatus, StatusTone> = {
  awaiting_payment: "warning",
  payment_failed: "danger",
  in_progress: "progress",
  completed: "success",
  partially_completed: "success",
  cancelled: "danger",
  pending: "warning",
  confirmed: "progress",
  shipped: "progress",
  delivered: "success",
};

export const ORDER_PAYMENT_LABELS: Record<OrderPaymentStatus, string> = {
  on_delivery: "À payer à la remise",
  pending: "Paiement en attente",
  paid: "Payée",
  failed: "Paiement échoué",
};

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  ...DELIVERY_MODE_LABELS,
  standard: "Livraison standard",
  express: "Livraison express",
  mixed: "Livraisons par boutique",
};

/** Libellé d'un mode, même inconnu : une valeur ajoutée au back ne doit pas afficher un vide. */
export const deliveryMethodLabel = (method: string): string =>
  DELIVERY_METHOD_LABELS[method as DeliveryMethod] ?? "Livraison";

const ORDER_ENDED: readonly OrderStatus[] = [
  OrderStatus.PAYMENT_FAILED,
  OrderStatus.COMPLETED,
  OrderStatus.PARTIALLY_COMPLETED,
  OrderStatus.CANCELLED,
  OrderStatus.DELIVERED,
];

/** Commande encore vivante : paiement attendu ou une boutique au moins pas finie. */
export const isOrderInProgress = (order: Pick<Order, "status">): boolean => !ORDER_ENDED.includes(order.status);
