import mongoose, { type Document, Model, Schema, Types } from "mongoose";
import type { BaseModel } from "./baseModel.model.js";

// ─────────────────────────────────────────────
//  REVIEW (avis & note)
//  Un avis par utilisateur et par product_boutique. La note alimente les champs
//  agrégés rating / reviewsCount du product_boutique (recalculés côté contrôleur).
// ─────────────────────────────────────────────
export interface IReview extends Document, BaseModel {
  userId: Types.ObjectId;
  productBoutiqueId: Types.ObjectId;
  rating: number;
  comment?: string;
  verifiedPurchase: boolean;
}

const reviewSchema = new Schema<IReview>(
  {
    userId: { type: Types.ObjectId, required: true, ref: "user" },
    productBoutiqueId: { type: Types.ObjectId, required: true, ref: "product_boutique" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 2000 },
    verifiedPurchase: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Un seul avis par utilisateur et par produit en boutique.
reviewSchema.index({ userId: 1, productBoutiqueId: 1 }, { unique: true });

// Liste des avis d'un produit, du plus récent au plus ancien.
reviewSchema.index({ productBoutiqueId: 1, createdAt: -1 });

reviewSchema.pre(/^find/, function (this: mongoose.Query<unknown, IReview>) {
  this.where({ deletedAt: null });
});

export const Review: Model<IReview> = mongoose.model<IReview>("review", reviewSchema);
