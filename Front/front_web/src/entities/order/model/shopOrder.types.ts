import type { OrderDelivery, ShippingAddress } from "./order.types";

// ─────────────────────────────────────────────
//  Sous-commande — miroir de ShopOrderResponseDto
//  (Back/src/shared/interfaces/ShopOrder.interfaces.ts) et des règles de
//  Back/src/shared/helpers/shopOrder.workflow.ts.
//
//  Chaque commande est découpée en une sous-commande par boutique : chacune
//  avance à son rythme, jusqu'à une fin positive (terminée) ou négative.
//  `availableActions` est calculé par le serveur pour CE lecteur : l'écran
//  n'affiche que ces boutons, le serveur revérifie tout à l'envoi.
// ─────────────────────────────────────────────

export const ShopOrderStatus = {
  AWAITING_PAYMENT: "awaiting_payment",
  PENDING: "pending",
  CONFIRMED: "confirmed",
  SHIPPED: "shipped",
  READY_FOR_PICKUP: "ready_for_pickup",
  DELIVERY_FAILED: "delivery_failed",
  DELIVERED: "delivered",
  RETURN_REQUESTED: "return_requested",
  DISPUTED: "disputed",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  REFUSED: "refused",
  EXPIRED: "expired",
  FAILED: "failed",
  RETURNED: "returned",
} as const;

export type ShopOrderStatus = (typeof ShopOrderStatus)[keyof typeof ShopOrderStatus];

export const SHOP_ORDER_STATUS_LABELS: Record<ShopOrderStatus, string> = {
  awaiting_payment: "En attente de paiement",
  pending: "À confirmer",
  confirmed: "En préparation",
  shipped: "En livraison",
  ready_for_pickup: "Prête au retrait",
  delivery_failed: "Livraison échouée",
  delivered: "Livrée",
  return_requested: "Retour demandé",
  disputed: "Litige",
  completed: "Terminée",
  cancelled: "Annulée",
  refused: "Refusée",
  expired: "Expirée",
  failed: "Échec de livraison",
  returned: "Retournée",
};

/** Ton du statut : ce que la couleur du badge veut dire. */
export type StatusTone = "neutral" | "progress" | "warning" | "success" | "danger";

export const SHOP_ORDER_STATUS_TONES: Record<ShopOrderStatus, StatusTone> = {
  awaiting_payment: "warning",
  pending: "warning",
  confirmed: "progress",
  shipped: "progress",
  ready_for_pickup: "progress",
  delivery_failed: "warning",
  delivered: "success",
  return_requested: "warning",
  disputed: "warning",
  completed: "success",
  cancelled: "danger",
  refused: "danger",
  expired: "danger",
  failed: "danger",
  returned: "danger",
};

export const SHOP_ORDER_NEGATIVE_END: readonly ShopOrderStatus[] = [
  ShopOrderStatus.CANCELLED,
  ShopOrderStatus.REFUSED,
  ShopOrderStatus.EXPIRED,
  ShopOrderStatus.FAILED,
  ShopOrderStatus.RETURNED,
];

export const SHOP_ORDER_TERMINAL: readonly ShopOrderStatus[] = [ShopOrderStatus.COMPLETED, ...SHOP_ORDER_NEGATIVE_END];

export const isShopOrderTerminal = (status: ShopOrderStatus): boolean => SHOP_ORDER_TERMINAL.includes(status);

/** Retrait en boutique : la commande se met à disposition au lieu de s'expédier. */
export const isPickupDelivery = (delivery: Pick<OrderDelivery, "method">): boolean => delivery.method === "pickup";

/** Onglets de l'espace commandes d'une boutique. */
export const SHOP_ORDER_GROUPS = {
  todo: [ShopOrderStatus.PENDING],
  preparing: [ShopOrderStatus.CONFIRMED],
  delivering: [ShopOrderStatus.SHIPPED, ShopOrderStatus.READY_FOR_PICKUP],
  delivered: [ShopOrderStatus.DELIVERED],
  issues: [ShopOrderStatus.DELIVERY_FAILED, ShopOrderStatus.RETURN_REQUESTED, ShopOrderStatus.DISPUTED],
  done: [
    ShopOrderStatus.COMPLETED,
    ShopOrderStatus.CANCELLED,
    ShopOrderStatus.REFUSED,
    ShopOrderStatus.EXPIRED,
    ShopOrderStatus.FAILED,
    ShopOrderStatus.RETURNED,
  ],
} as const satisfies Record<string, readonly ShopOrderStatus[]>;

export type ShopOrderGroup = keyof typeof SHOP_ORDER_GROUPS;

export const SHOP_ORDER_GROUP_KEYS = Object.keys(SHOP_ORDER_GROUPS) as ShopOrderGroup[];

export const SHOP_ORDER_GROUP_LABELS: Record<ShopOrderGroup, string> = {
  todo: "À confirmer",
  preparing: "En préparation",
  delivering: "En livraison",
  delivered: "Livrées",
  issues: "Problèmes",
  done: "Terminées",
};

export const groupOf = (status: ShopOrderStatus): ShopOrderGroup | null =>
  SHOP_ORDER_GROUP_KEYS.find((group) => (SHOP_ORDER_GROUPS[group] as readonly ShopOrderStatus[]).includes(status)) ??
  null;

// ── Acteurs ─────────────────────────────────
export const ShopOrderActor = {
  CLIENT: "client",
  SHOP: "shop",
  ADMIN: "admin",
  SYSTEM: "system",
} as const;

export type ShopOrderActor = (typeof ShopOrderActor)[keyof typeof ShopOrderActor];

/** Qui lit la sous-commande : chacun en voit ce qui le concerne. */
export type ShopOrderViewer = "client" | "shop" | "admin";

export const SHOP_ORDER_ACTOR_LABELS: Record<ShopOrderActor, string> = {
  client: "Client",
  shop: "Boutique",
  admin: "Administration",
  system: "Automatique",
};

// ── Paiement ────────────────────────────────
export const ShopOrderPaymentStatus = {
  UNPAID: "unpaid",
  PAID: "paid",
  VOID: "void",
  REFUND_PENDING: "refund_pending",
  REFUNDED: "refunded",
  PARTIALLY_REFUNDED: "partially_refunded",
} as const;

export type ShopOrderPaymentStatus = (typeof ShopOrderPaymentStatus)[keyof typeof ShopOrderPaymentStatus];

export const PaymentMethod = {
  ON_DELIVERY: "on_delivery",
  ONLINE: "online",
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  on_delivery: "À la livraison ou au retrait",
  online: "En ligne",
};

export const SHOP_ORDER_PAYMENT_LABELS: Record<ShopOrderPaymentStatus, string> = {
  unpaid: "À payer",
  paid: "Payée",
  void: "Rien à payer",
  refund_pending: "Remboursement en cours",
  refunded: "Remboursée",
  partially_refunded: "Partiellement remboursée",
};

// ── Actions ─────────────────────────────────
export const ShopOrderAction = {
  CONFIRM: "confirm",
  REFUSE: "refuse",
  SHIP: "ship",
  READY: "ready",
  DELIVER: "deliver",
  FAIL_DELIVERY: "delivery-failed",
  RETRY_DELIVERY: "retry",
  ABANDON_DELIVERY: "abandon",
  CANCEL: "cancel",
  ADMIN_CANCEL: "admin-cancel",
  REQUEST_RETURN: "return",
  ACCEPT_RETURN: "accept-return",
  REJECT_RETURN: "reject-return",
  RESOLVE_DISPUTE: "resolve-dispute",
  CONFIRM_REFUND: "confirm-refund",
} as const;

export type ShopOrderAction = (typeof ShopOrderAction)[keyof typeof ShopOrderAction];

export const REFUSAL_REASONS = {
  out_of_stock: "Rupture de stock",
  wrong_price: "Prix erroné",
  area_not_served: "Zone non desservie",
  other: "Autre",
} as const;

export const CANCELLATION_REASONS = {
  changed_mind: "Changement d'avis",
  ordering_error: "Erreur de commande",
  too_slow: "Délai trop long",
  other: "Autre",
} as const;

export const DELIVERY_FAILURE_REASONS = {
  customer_absent: "Client absent ou injoignable",
  address_not_found: "Adresse introuvable",
  parcel_refused: "Colis refusé",
  other: "Autre",
} as const;

export const RETURN_REASONS = {
  not_as_described: "Produit non conforme",
  damaged: "Produit abîmé",
  incomplete: "Commande incomplète",
  not_received: "Commande non reçue",
} as const;

export type Resolution = "refund_full" | "refund_partial" | "rejected";

export const RESOLUTION_LABELS: Record<Resolution, string> = {
  refund_full: "Rembourser en entier",
  refund_partial: "Rembourser en partie",
  rejected: "Rejeter le retour",
};

/** Ce qu'une action demande de saisir, et comment elle s'affiche. */
export interface ActionSpec {
  label: string;
  /** Question posée au moment de confirmer. */
  confirm: string;
  /** Une action destructrice (annuler, refuser) se distingue visuellement. */
  danger?: boolean;
  reasons?: Readonly<Record<string, string>>;
  reasonRequired?: boolean;
  /** Précision libre : exigée, facultative, ou absente. */
  note?: "required" | "optional";
  noteLabel?: string;
  code?: boolean;
  photos?: boolean;
  resolution?: boolean;
}

export const ACTION_SPECS: Record<ShopOrderAction, ActionSpec> = {
  confirm: { label: "Confirmer la commande", confirm: "Vous confirmez pouvoir honorer cette commande ?" },
  refuse: {
    label: "Refuser",
    confirm: "Refuser cette commande ? Le client sera remboursé.",
    danger: true,
    reasons: REFUSAL_REASONS,
    reasonRequired: true,
    note: "optional",
    noteLabel: "Précision pour le client",
  },
  ship: { label: "Expédier", confirm: "Le colis part en livraison ? Le client recevra son code de remise." },
  ready: {
    label: "Mettre à disposition",
    confirm: "La commande est prête en boutique ? Le client recevra son code de remise.",
  },
  deliver: {
    label: "Remettre au client",
    confirm: "Saisissez le code de remise que le client vous donne.",
    code: true,
  },
  "delivery-failed": {
    label: "Signaler un échec de livraison",
    confirm: "Pourquoi la livraison a-t-elle échoué ?",
    reasons: DELIVERY_FAILURE_REASONS,
    reasonRequired: true,
    note: "optional",
  },
  retry: { label: "Relivrer", confirm: "Lancer une nouvelle tentative de livraison ?" },
  abandon: {
    label: "Abandonner la livraison",
    confirm: "Abandonner la livraison ? Le colis doit être revenu en boutique ; le client sera remboursé.",
    danger: true,
  },
  cancel: {
    label: "Annuler",
    confirm: "Annuler cette partie de la commande ?",
    danger: true,
    reasons: CANCELLATION_REASONS,
    note: "optional",
  },
  "admin-cancel": {
    label: "Annuler d'office",
    confirm: "Annuler cette commande ? Le client et la boutique seront prévenus.",
    danger: true,
    note: "required",
    noteLabel: "Motif, lu par le client et la boutique",
  },
  return: {
    label: "Demander un retour",
    confirm: "Que se passe-t-il avec cette commande ?",
    reasons: RETURN_REASONS,
    reasonRequired: true,
    note: "optional",
    noteLabel: "Détails",
    photos: true,
  },
  "accept-return": { label: "Accepter le retour", confirm: "Accepter ce retour ? Le client sera remboursé." },
  "reject-return": {
    label: "Refuser le retour",
    confirm: "Refuser ce retour ? L'administration tranchera.",
    danger: true,
    note: "required",
    noteLabel: "Pourquoi vous refusez",
  },
  "resolve-dispute": {
    label: "Trancher le litige",
    confirm: "Votre décision, lue par le client et la boutique.",
    resolution: true,
    note: "required",
    noteLabel: "Motif de la décision",
  },
  "confirm-refund": {
    label: "Confirmer le remboursement",
    confirm: "Le client a bien été remboursé ?",
  },
};

// ── La sous-commande ────────────────────────
export interface ShopOrderItem {
  productBoutiqueId: string;
  productId?: string | undefined;
  productName?: string | undefined;
  urlImages: string[];
  price: number;
  quantity: number;
  lineTotal: number;
}

export interface ShopOrderHistoryEntry {
  status: ShopOrderStatus;
  changedAt: string;
  actor: ShopOrderActor;
  reason?: string | undefined;
  reasonLabel?: string | undefined;
  note?: string | undefined;
}

export interface ShopOrderReturn {
  reason: string;
  reasonLabel: string;
  details?: string | undefined;
  photos: string[];
  requestedAt: string;
  shopResponse?: string | undefined;
  respondedAt: string | null;
  resolution?: Resolution | undefined;
  resolutionNote?: string | undefined;
  resolvedAt: string | null;
}

export interface ShopOrder {
  id: string;
  orderId: string;
  reference: string;
  boutique: { id: string; nom?: string | undefined };
  items: ShopOrderItem[];
  totalItems: number;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  amount: number;
  delivery: OrderDelivery;
  shippingAddress?: ShippingAddress | undefined;
  /** Coordonnées du client : boutique et administration seulement. */
  customer?: { nom: string; prenom: string; telephone?: string | undefined } | undefined;
  payment: {
    method: PaymentMethod;
    status: ShopOrderPaymentStatus;
    paidAt: string | null;
    refundedAmount: number;
    refundedAt: string | null;
  };
  status: ShopOrderStatus;
  statusHistory: ShopOrderHistoryEntry[];
  /** Client seulement : à donner à la remise. */
  pickupCode?: string | undefined;
  deliveryAttempts: number;
  return: ShopOrderReturn | null;
  deadlineAt: string | null;
  availableActions: ShopOrderAction[];
  createdAt: string;
  updatedAt: string;
}

export type ShopOrderCounts = Record<ShopOrderGroup, number>;

/** Saisie d'une action. */
export interface ShopOrderActionInput {
  reason?: string | undefined;
  note?: string | undefined;
  code?: string | undefined;
  resolution?: Resolution | undefined;
  refundAmount?: number | undefined;
  photos?: File[] | undefined;
}
