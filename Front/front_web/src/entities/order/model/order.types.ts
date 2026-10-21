import { DELIVERY_MODE_LABELS, type DeliveryMode } from "../../delivery";
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
  /** Vide sur les commandes antérieures aux modes par boutique. */
  deliveries: OrderDelivery[];
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
  ...DELIVERY_MODE_LABELS,
  standard: "Livraison standard",
  express: "Livraison express",
  mixed: "Livraisons par boutique",
};

/** Libellé d'un mode, même inconnu : une valeur ajoutée au back ne doit pas afficher un vide. */
export const deliveryMethodLabel = (method: string): string =>
  DELIVERY_METHOD_LABELS[method as DeliveryMethod] ?? "Livraison";

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
