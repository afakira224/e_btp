import mongoose, { type Document, Model, Schema, Types } from "mongoose";
import type { BaseModel } from "./baseModel.model.js";
import { orderDeliverySchema, type IOrderDelivery } from "./delivery.model.js";
import {
  orderItemSchema,
  PaymentMethod,
  shippingAddressSchema,
  type IOrderItem,
  type IShippingAddress,
} from "./order.model.js";

// ─────────────────────────────────────────────
//  SOUS-COMMANDE — la part d'une commande qui revient à une boutique.
//
//  Le checkout découpe chaque commande en une sous-commande par boutique :
//  chacune a ses articles, sa livraison, son montant, son statut et son
//  historique. Une boutique lente ou en rupture ne bloque donc pas les
//  autres, et une issue négative ne touche que la partie concernée.
//
//  Les règles (qui peut faire quoi, à quel statut, avec quels effets) vivent
//  dans shared/helpers/shopOrder.workflow.ts ; les écritures passent toutes
//  par shared/services/shopOrder.service.ts.
// ─────────────────────────────────────────────
export enum ShopOrderStatus {
  /** Interne : paiement en ligne pas encore confirmé, invisible des boutiques. */
  AWAITING_PAYMENT = "awaiting_payment",
  PENDING = "pending",                   // à confirmer par la boutique
  CONFIRMED = "confirmed",               // en préparation
  SHIPPED = "shipped",                   // en livraison
  READY_FOR_PICKUP = "ready_for_pickup", // prête au retrait
  DELIVERY_FAILED = "delivery_failed",   // livraison échouée : relivrer ou abandonner
  DELIVERED = "delivered",               // remise au client, payée
  RETURN_REQUESTED = "return_requested", // le client demande un retour
  DISPUTED = "disputed",                 // litige : l'administration tranche
  // Fin positive.
  COMPLETED = "completed",
  // Fins négatives.
  CANCELLED = "cancelled",               // par le client ou l'administration
  REFUSED = "refused",                   // par la boutique, motif à l'appui
  EXPIRED = "expired",                   // boutique muette, ou retrait jamais fait
  FAILED = "failed",                     // échec de livraison définitif
  RETURNED = "returned",                 // retour accepté, client remboursé
}

export const SHOP_ORDER_NEGATIVE_END: readonly ShopOrderStatus[] = [
  ShopOrderStatus.CANCELLED,
  ShopOrderStatus.REFUSED,
  ShopOrderStatus.EXPIRED,
  ShopOrderStatus.FAILED,
  ShopOrderStatus.RETURNED,
];

export const SHOP_ORDER_TERMINAL: readonly ShopOrderStatus[] = [
  ShopOrderStatus.COMPLETED,
  ...SHOP_ORDER_NEGATIVE_END,
];

/** Ce que la boutique a encaissé ou rendu pour cette part. */
export enum ShopOrderPaymentStatus {
  UNPAID = "unpaid",                     // à payer à la remise, ou paiement en ligne pas confirmé
  PAID = "paid",
  VOID = "void",                         // fin avant tout encaissement : rien à rendre
  REFUND_PENDING = "refund_pending",     // à rembourser (prestataire, ou boutique à la reprise)
  REFUNDED = "refunded",
  PARTIALLY_REFUNDED = "partially_refunded",
}

/** Qui a agi : le client, la boutique, l'administration ou la plateforme (délais). */
export enum ShopOrderActor {
  CLIENT = "client",
  SHOP = "shop",
  ADMIN = "admin",
  SYSTEM = "system",
}

export interface IShopOrderHistory {
  status: ShopOrderStatus;
  changedAt: Date;
  actor: ShopOrderActor;
  changedBy?: Types.ObjectId | undefined;
  /** Motif choisi dans une liste (rupture, client absent…). */
  reason?: string | undefined;
  /** Précision libre. */
  note?: string | undefined;
}

export interface IShopOrderPayment {
  method: PaymentMethod;
  status: ShopOrderPaymentStatus;
  paidAt?: Date | null;
  refundedAmount: number;
  refundedAt?: Date | null;
}

export interface IShopOrderReturn {
  reason: string;
  details?: string | undefined;
  photos: string[];
  requestedAt: Date;
  /** Réponse de la boutique quand elle refuse. */
  shopResponse?: string | undefined;
  respondedAt?: Date | null;
  /** Décision de l'administration sur un litige. */
  resolution?: "refund_full" | "refund_partial" | "rejected" | undefined;
  resolutionNote?: string | undefined;
  resolvedAt?: Date | null;
}

/** Coordonnées figées du client : la boutique en a besoin pour livrer. */
export interface IShopOrderCustomer {
  nom: string;
  prenom: string;
  telephone?: string | undefined;
}

export interface IShopOrder extends Document, BaseModel {
  orderId: Types.ObjectId;
  userId: Types.ObjectId;
  boutiqueId: Types.ObjectId;
  boutiqueNom?: string | undefined;
  /** Référence de la commande + « -1 », « -2 »… */
  reference: string;
  items: IOrderItem[];
  subtotal: number;
  /** Part du coupon de la commande, répartie au prorata des sous-totaux. */
  discountAmount: number;
  deliveryFee: number;
  /** = subtotal − discountAmount + deliveryFee */
  amount: number;
  delivery: IOrderDelivery;
  shippingAddress?: IShippingAddress | undefined;
  customer: IShopOrderCustomer;
  payment: IShopOrderPayment;
  status: ShopOrderStatus;
  statusHistory: IShopOrderHistory[];
  /** Code à 6 chiffres que le client donne à la remise. Jamais montré à la boutique. */
  pickupCode: string;
  deliveryAttempts: number;
  return?: IShopOrderReturn | null;
  /** Prochaine action automatique (expiration, clôture, escalade). */
  deadlineAt?: Date | null;
  /** Rappel envoyé avant la prochaine action automatique. */
  reminderAt?: Date | null;
}

const historySchema = new Schema<IShopOrderHistory>(
  {
    status: { type: String, enum: Object.values(ShopOrderStatus), required: true },
    changedAt: { type: Date, required: true, default: () => new Date() },
    actor: { type: String, enum: Object.values(ShopOrderActor), required: true },
    changedBy: { type: Types.ObjectId, ref: "user" },
    reason: { type: String, trim: true, maxlength: 100 },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
);

const paymentSchema = new Schema<IShopOrderPayment>(
  {
    method: { type: String, enum: Object.values(PaymentMethod), required: true },
    status: {
      type: String,
      enum: Object.values(ShopOrderPaymentStatus),
      default: ShopOrderPaymentStatus.UNPAID,
    },
    paidAt: { type: Date, default: null },
    refundedAmount: { type: Number, min: 0, default: 0 },
    refundedAt: { type: Date, default: null },
  },
  { _id: false }
);

const returnSchema = new Schema<IShopOrderReturn>(
  {
    reason: { type: String, required: true, trim: true },
    details: { type: String, trim: true, maxlength: 1000 },
    photos: { type: [String], default: [] },
    requestedAt: { type: Date, required: true },
    shopResponse: { type: String, trim: true, maxlength: 500 },
    respondedAt: { type: Date, default: null },
    resolution: { type: String, enum: ["refund_full", "refund_partial", "rejected"] },
    resolutionNote: { type: String, trim: true, maxlength: 500 },
    resolvedAt: { type: Date, default: null },
  },
  { _id: false }
);

const shopOrderSchema = new Schema<IShopOrder>(
  {
    orderId: { type: Types.ObjectId, ref: "order", required: true },
    userId: { type: Types.ObjectId, ref: "user", required: true },
    boutiqueId: { type: Types.ObjectId, ref: "shop", required: true },
    boutiqueNom: { type: String },
    reference: { type: String, required: true, unique: true },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    deliveryFee: { type: Number, min: 0, default: 0 },
    amount: { type: Number, required: true, min: 0 },
    delivery: { type: orderDeliverySchema, required: true },
    shippingAddress: { type: shippingAddressSchema, default: undefined },
    customer: {
      nom: { type: String, required: true },
      prenom: { type: String, required: true },
      telephone: { type: String },
    },
    payment: { type: paymentSchema, required: true },
    status: {
      type: String,
      enum: Object.values(ShopOrderStatus),
      default: ShopOrderStatus.PENDING,
    },
    statusHistory: { type: [historySchema], default: [] },
    pickupCode: { type: String, required: true },
    deliveryAttempts: { type: Number, min: 0, default: 0 },
    return: { type: returnSchema, default: null },
    deadlineAt: { type: Date, default: null },
    reminderAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Les sous-commandes d'une commande (détail client, statut global).
shopOrderSchema.index({ orderId: 1 });
// L'espace commandes d'une boutique, par statut, les plus récentes d'abord.
shopOrderSchema.index({ boutiqueId: 1, status: 1, createdAt: -1 });
// La tâche des délais : ce qui arrive à échéance.
shopOrderSchema.index({ deadlineAt: 1 });
shopOrderSchema.index({ reminderAt: 1 });

shopOrderSchema.pre(/^find/, function (this: mongoose.Query<unknown, IShopOrder>) {
  this.where({ deletedAt: null });
});

export const ShopOrder: Model<IShopOrder> = mongoose.model<IShopOrder>("shop_order", shopOrderSchema);
