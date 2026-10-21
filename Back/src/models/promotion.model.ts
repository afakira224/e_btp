import mongoose, { type Document, Model, Schema, Types } from "mongoose";
import type { BaseModel } from "./baseModel.model.js";

// ─────────────────────────────────────────────
//  PROMOTION
//  Deux mécanismes : COUPON (code saisi) et FLASH_SALE (automatique sur période).
//  Deux cibles : des product_boutique précis, ou le panier entier (avec seuil).
//  Réduction en pourcentage (ou montant fixe, pour rester flexible).
// ─────────────────────────────────────────────
export enum PromotionType {
  COUPON = "coupon",
  FLASH_SALE = "flash_sale",
}

export enum PromotionScope {
  PRODUCT_BOUTIQUE = "product_boutique",
  CART = "cart",
}

export enum DiscountType {
  PERCENTAGE = "percentage",
  FIXED = "fixed",
}

export interface IPromotion extends Document, BaseModel {
  nom: string;
  description?: string;
  type: PromotionType;
  scope: PromotionScope;
  discountType: DiscountType;
  discountValue: number;
  code?: string | null;
  startDate: Date;
  endDate: Date;
  productBoutiqueIds: Types.ObjectId[];
  minAmount?: number;
  maxDiscount?: number | null;
  usageLimit?: number | null;
  usedCount: number;
  actif: boolean;
}

const promotionSchema = new Schema<IPromotion>(
  {
    nom: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    type: { type: String, enum: Object.values(PromotionType), required: true },
    scope: { type: String, enum: Object.values(PromotionScope), required: true },
    discountType: {
      type: String,
      enum: Object.values(DiscountType),
      default: DiscountType.PERCENTAGE,
    },
    discountValue: { type: Number, required: true, min: 0 },
    // Code du coupon (unique). sparse : plusieurs promotions sans code sont autorisées.
    code: { type: String, trim: true, uppercase: true, unique: true, sparse: true, default: null },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    // Produits ciblés (scope = product_boutique).
    productBoutiqueIds: { type: [Types.ObjectId], ref: "product_boutique", default: [] },
    // Montant minimum du panier requis (scope = cart).
    minAmount: { type: Number, min: 0, default: 0 },
    // Plafond de réduction (utile pour un pourcentage sur le panier).
    maxDiscount: { type: Number, min: 0, default: null },
    // Limite d'utilisation globale (coupons) ; null = illimité.
    usageLimit: { type: Number, min: 1, default: null },
    usedCount: { type: Number, min: 0, default: 0 },
    actif: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Recherche des promotions actives sur une période (ventes flash).
promotionSchema.index({ type: 1, actif: 1, startDate: 1, endDate: 1 });

promotionSchema.pre(/^find/, function (this: mongoose.Query<unknown, IPromotion>) {
  this.where({ deletedAt: null });
});

export const Promotion: Model<IPromotion> = mongoose.model<IPromotion>("promotion", promotionSchema);
