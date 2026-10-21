import type { Product, ProductBoutique } from "../../product";
import type { Shop } from "../../shop";

// ─────────────────────────────────────────────
//  Commande — miroir de OrderResponseDto
//  (Back/src/shared/interfaces/Order.interfaces.ts) et des énumérations de
//  Back/src/models/order.model.ts.
//
//  Les lignes sont un instantané pris au moment de la commande : le prix
//  figé est `price`, pas celui de l'offre actuelle.
// ─────────────────────────────────────────────

export const OrderStatus = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const DeliveryMethod = {
  PICKUP: "pickup",
  STANDARD: "standard",
  EXPRESS: "express",
} as const;

export type DeliveryMethod = (typeof DeliveryMethod)[keyof typeof DeliveryMethod];

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
  status: OrderStatus;
  statusHistory: OrderStatusStep[];
  items: OrderItem[];
  totalItems: number;
  subtotal: number;
  discountAmount: number;
  promotionCode?: string | null | undefined;
  shippingFee: number;
  /** À payer : subtotal − discountAmount + shippingFee. */
  amount: number;
  deliveryMethod: DeliveryMethod;
  addressId?: string | null | undefined;
  shippingAddress?: ShippingAddress | undefined;
  createdAt: string;
  updatedAt: string;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
};

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  pickup: "Retrait en dépôt",
  standard: "Livraison standard",
  express: "Livraison express",
};

/** Parcours normal d'une commande, dans l'ordre. L'annulation en sort. */
export const ORDER_FLOW: readonly OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

/** Commande encore vivante : ni livrée, ni annulée. */
export const isOrderInProgress = (order: Pick<Order, "status">): boolean =>
  order.status !== OrderStatus.DELIVERED && order.status !== OrderStatus.CANCELLED;
