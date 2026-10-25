import mongoose, { type Document, Model, Schema, Types } from "mongoose";
import type { BaseModel } from "./baseModel.model.js";
import { DeliveryMethod, orderDeliverySchema, type IOrderDelivery } from "./delivery.model.js";

// ─────────────────────────────────────────────
//  ORDER
//  Une commande appartient à un utilisateur. Ses items sont un instantané
//  (snapshot) du panier au moment du checkout : prix et infos produit figés.
//
//  Son avancement vit dans ses sous-commandes, une par boutique
//  (shopOrder.model.ts). Le statut de la commande n'est choisi par personne :
//  il se déduit de celui de ses sous-commandes (orderStatusFrom).
// ─────────────────────────────────────────────
export enum OrderStatus {
  AWAITING_PAYMENT = "awaiting_payment", // paiement en ligne lancé, pas encore confirmé
  PAYMENT_FAILED = "payment_failed",     // paiement refusé ou expiré : la commande ne part pas
  IN_PROGRESS = "in_progress",           // au moins une sous-commande n'est pas terminée
  COMPLETED = "completed",               // toutes terminées, toutes positives
  PARTIALLY_COMPLETED = "partially_completed", // toutes terminées, positives et négatives
  CANCELLED = "cancelled",               // toutes terminées, toutes négatives

  // Statuts des commandes passées avant les sous-commandes. Lisibles ;
  // `npm run migrate:shop-orders` les convertit.
  PENDING = "pending",
  CONFIRMED = "confirmed",
  SHIPPED = "shipped",
  DELIVERED = "delivered",
}

/** Une commande dans l'un de ces statuts n'a abouti à aucune vente. */
export const ORDER_STATUSES_WITHOUT_SALE: readonly OrderStatus[] = [
  OrderStatus.AWAITING_PAYMENT,
  OrderStatus.PAYMENT_FAILED,
  OrderStatus.CANCELLED,
];

/** Comment le client paie : à la remise (livraison ou retrait), ou en ligne. */
export enum PaymentMethod {
  ON_DELIVERY = "on_delivery",
  ONLINE = "online",
}

/** Paiement de la commande. En ligne : un paiement pour toute la commande. */
export enum OrderPaymentStatus {
  ON_DELIVERY = "on_delivery", // chaque boutique encaisse sa part à la remise
  PENDING = "pending",         // paiement en ligne lancé, pas encore confirmé
  PAID = "paid",               // confirmé par le prestataire
  FAILED = "failed",           // refusé ou expiré
}

// ─────────────────────────────────────────────
//  Modes de livraison : définis dans delivery.model.ts, partagés avec la
//  boutique et l'offre. Réexportés ici, où les consommateurs historiques
//  les importent.
// ─────────────────────────────────────────────
export { DeliveryMethod } from "./delivery.model.js";

export interface IOrderItem {
  productBoutiqueId: Types.ObjectId;
  boutiqueId?: Types.ObjectId | undefined;
  productId?: Types.ObjectId | undefined;
  productName?: string | undefined;
  urlImages: string[];
  price: number; // prix unitaire figé
  quantity: number;
}

// Une entrée de l'historique : qui a changé le statut, quand, et pourquoi.
export interface IOrderStatusHistory {
  status: OrderStatus;
  changedAt: Date;
  changedBy?: Types.ObjectId | undefined;
  note?: string | undefined;
}

// Adresse de livraison figée au moment de la commande : si le client modifie
// ou supprime son adresse ensuite, la commande garde la version d'origine.
export interface IShippingAddress {
  destinataire?: string | undefined;
  telephone: string;
  adresse: string;
  ville: string;
  commune?: string | undefined;
  pays: string;
}

export interface IOrder extends Document, BaseModel {
  userId: Types.ObjectId;
  reference: string;
  paymentMethod: PaymentMethod;
  paymentStatus: OrderPaymentStatus;
  /** Référence du paiement chez le prestataire (paiement en ligne). */
  paymentRef?: string | null;
  /** Au-delà, un paiement en ligne non confirmé échoue et le stock est rendu. */
  paymentExpiresAt?: Date | null;
  paidAt?: Date | null;
  items: IOrderItem[];
  subtotal: number; // somme des (price * quantity) avant réduction
  discountAmount: number; // réduction appliquée (coupon)
  promotionCode?: string | null; // code du coupon utilisé
  shippingFee: number; // frais de livraison = somme des frais de `deliveries`
  amount: number; // montant à payer = subtotal - discountAmount + shippingFee
  status: OrderStatus;
  statusHistory: IOrderStatusHistory[];
  // Mode commun à toutes les livraisons, MIXED s'ils diffèrent. Les commandes
  // antérieures aux modes par boutique gardent standard / express.
  deliveryMethod: DeliveryMethod;
  // Une livraison par boutique, figée au checkout. Vide sur les anciennes commandes.
  deliveries: IOrderDelivery[];
  addressId?: Types.ObjectId | null; // adresse d'origine (référence)
  shippingAddress?: IShippingAddress; // copie figée de cette adresse
  telephone?: string | undefined;
  adresse?: string | undefined;
}

export const orderItemSchema = new Schema<IOrderItem>(
  {
    productBoutiqueId: { type: Types.ObjectId, required: true, ref: "product_boutique" },
    boutiqueId: { type: Types.ObjectId, ref: "shop" },
    productId: { type: Types.ObjectId, ref: "product" },
    productName: { type: String },
    urlImages: { type: [String], default: [] },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderStatusHistorySchema = new Schema<IOrderStatusHistory>(
  {
    status: { type: String, enum: Object.values(OrderStatus), required: true },
    changedAt: { type: Date, required: true, default: () => new Date() },
    changedBy: { type: Types.ObjectId, ref: "user" },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
);

export const shippingAddressSchema = new Schema<IShippingAddress>(
  {
    destinataire: { type: String, trim: true },
    telephone: { type: String, required: true, trim: true },
    adresse: { type: String, required: true, trim: true },
    ville: { type: String, required: true, trim: true },
    commune: { type: String, trim: true },
    pays: { type: String, trim: true, default: "Guinée" },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    userId: { type: Types.ObjectId, required: true, ref: "user" },
    reference: { type: String, required: true, unique: true },
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
      default: PaymentMethod.ON_DELIVERY,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(OrderPaymentStatus),
      default: OrderPaymentStatus.ON_DELIVERY,
    },
    paymentRef: { type: String, default: null },
    paymentExpiresAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    promotionCode: { type: String, default: null },
    shippingFee: { type: Number, min: 0, default: 0 },
    amount: { type: Number, required: true, min: 0, default: 0 },
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.IN_PROGRESS,
    },
    statusHistory: { type: [orderStatusHistorySchema], default: [] },
    deliveryMethod: {
      type: String,
      enum: Object.values(DeliveryMethod),
      default: DeliveryMethod.STANDARD,
    },
    deliveries: { type: [orderDeliverySchema], default: [] },
    addressId: { type: Types.ObjectId, ref: "address", default: null },
    shippingAddress: { type: shippingAddressSchema, default: undefined },
    // Champs libres conservés pour compatibilité ascendante ; shippingAddress
    // est désormais la source de vérité pour la livraison.
    telephone: { type: String, trim: true },
    adresse: { type: String, trim: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Historique des commandes d'un client, du plus récent au plus ancien.
orderSchema.index({ userId: 1, createdAt: -1 });
// Tableau de bord back-office : filtrage par statut.
orderSchema.index({ status: 1, createdAt: -1 });
// Tâche des délais : paiements en ligne à faire échouer.
orderSchema.index({ status: 1, paymentExpiresAt: 1 });

orderSchema.pre(/^find/, function (this: mongoose.Query<unknown, IOrder>) {
  this.where({ deletedAt: null });
});

export const Order: Model<IOrder> = mongoose.model<IOrder>("order", orderSchema);
