import mongoose, { type Document, Model, Schema, Types } from "mongoose";
import type { BaseModel } from "./baseModel.model.js";
import { DeliveryMethod, orderDeliverySchema, type IOrderDelivery } from "./delivery.model.js";

// ─────────────────────────────────────────────
//  ORDER
//  Une commande appartient à un utilisateur. Ses items sont un instantané
//  (snapshot) du panier au moment du checkout : prix et infos produit figés.
// ─────────────────────────────────────────────
export enum OrderStatus {
  PENDING = "pending",
  CONFIRMED = "confirmed",
  SHIPPED = "shipped",
  DELIVERED = "delivered",
  CANCELLED = "cancelled",
}

// ─────────────────────────────────────────────
//  Modes de livraison : définis dans delivery.model.ts, partagés avec la
//  boutique et l'offre. Réexportés ici, où les consommateurs historiques
//  les importent.
// ─────────────────────────────────────────────
export { DeliveryMethod } from "./delivery.model.js";

// Transitions de statut autorisées. Une commande livrée ou annulée est terminale.
export const ALLOWED_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

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

const orderItemSchema = new Schema<IOrderItem>(
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

const shippingAddressSchema = new Schema<IShippingAddress>(
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
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    promotionCode: { type: String, default: null },
    shippingFee: { type: Number, min: 0, default: 0 },
    amount: { type: Number, required: true, min: 0, default: 0 },
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.PENDING,
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

orderSchema.pre(/^find/, function (this: mongoose.Query<unknown, IOrder>) {
  this.where({ deletedAt: null });
});

export const Order: Model<IOrder> = mongoose.model<IOrder>("order", orderSchema);
