import mongoose, { type Document, Model, Schema, Types } from "mongoose";
import type { BaseModel } from "./baseModel.model.js";

// ─────────────────────────────────────────────
//  RECENTLY VIEWED (produits récemment vus)
//  Un historique par utilisateur : liste ordonnée (plus récent en tête),
//  sans doublon et plafonnée (voir MAX dans le contrôleur).
// ─────────────────────────────────────────────
export interface IRecentlyViewedItem {
  productBoutiqueId: Types.ObjectId;
  viewedAt: Date;
}

export interface IRecentlyViewed extends Document, BaseModel {
  userId: Types.ObjectId;
  items: IRecentlyViewedItem[];
}

const recentlyViewedItemSchema = new Schema<IRecentlyViewedItem>(
  {
    productBoutiqueId: { type: Types.ObjectId, required: true, ref: "product_boutique" },
    viewedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const recentlyViewedSchema = new Schema<IRecentlyViewed>(
  {
    userId: { type: Types.ObjectId, required: true, ref: "user", unique: true },
    items: { type: [recentlyViewedItemSchema], default: [] },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

recentlyViewedSchema.pre(/^find/, function (this: mongoose.Query<unknown, IRecentlyViewed>) {
  this.where({ deletedAt: null });
});

export const RecentlyViewed: Model<IRecentlyViewed> = mongoose.model<IRecentlyViewed>(
  "recently_viewed",
  recentlyViewedSchema
);
