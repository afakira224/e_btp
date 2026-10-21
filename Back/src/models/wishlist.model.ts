import mongoose, { type Document, Model, Schema, Types } from "mongoose";
import type { BaseModel } from "./baseModel.model.js";

// ─────────────────────────────────────────────
//  WISHLIST (favoris)
//  Une liste de favoris par utilisateur. Chaque item référence un product_boutique.
// ─────────────────────────────────────────────
export interface IWishlistItem {
  productBoutiqueId: Types.ObjectId;
}

export interface IWishlist extends Document, BaseModel {
  userId: Types.ObjectId;
  items: IWishlistItem[];
}

const wishlistItemSchema = new Schema<IWishlistItem>(
  {
    productBoutiqueId: { type: Types.ObjectId, required: true, ref: "product_boutique" },
  },
  { _id: false }
);

const wishlistSchema = new Schema<IWishlist>(
  {
    userId: { type: Types.ObjectId, required: true, ref: "user", unique: true },
    items: { type: [wishlistItemSchema], default: [] },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

wishlistSchema.pre(/^find/, function (this: mongoose.Query<unknown, IWishlist>) {
  this.where({ deletedAt: null });
});

export const Wishlist: Model<IWishlist> = mongoose.model<IWishlist>("wishlist", wishlistSchema);
