import mongoose, { type Document, Model, Schema, Types } from "mongoose";
import type { BaseModel } from "./baseModel.model.js";

// ─────────────────────────────────────────────
//  CART
//  Un panier par utilisateur. Chaque item référence un product_boutique
//  (l'unité vendable, qui porte le prix et le stock) + une quantité.
// ─────────────────────────────────────────────
export interface ICartItem {
  productBoutiqueId: Types.ObjectId;
  quantity: number;
  price: number;
}

export interface ICart extends Document, BaseModel {
  userId: Types.ObjectId;
  items: ICartItem[];
  amount: number;
}

const cartItemSchema = new Schema<ICartItem>(
  {
    productBoutiqueId: { type: Types.ObjectId, required: true, ref: "product_boutique" },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    // Prix unitaire figé au moment de l'ajout (discountPrice si présent, sinon price).
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const cartSchema = new Schema<ICart>(
  {
    userId: { type: Types.ObjectId, required: true, ref: "user", unique: true },
    items: { type: [cartItemSchema], default: [] },
    // Montant total du panier = somme des (price * quantity) de chaque item.
    amount: { type: Number, default: 0, min: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

cartSchema.pre(/^find/, function (this: mongoose.Query<unknown, ICart>) {
  this.where({ deletedAt: null });
});

export const Cart: Model<ICart> = mongoose.model<ICart>("cart", cartSchema);
