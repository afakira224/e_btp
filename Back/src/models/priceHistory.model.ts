import mongoose, { type Document, Model, Schema, Types } from "mongoose";

// ─────────────────────────────────────────────
//  HISTORIQUE DES PRIX
//  Un document par prix pratiqué sur une offre : du `from` au `to` (null =
//  en cours). Il donne le prix de référence d'une promotion, le plus bas
//  prix des 30 derniers jours : monter son prix puis le « barrer » ne
//  montre donc aucune remise. Gardé 90 jours.
// ─────────────────────────────────────────────
export interface IPriceHistory extends Document {
  productBoutiqueId: Types.ObjectId;
  price: number;
  from: Date;
  to: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const priceHistorySchema = new Schema<IPriceHistory>(
  {
    productBoutiqueId: { type: Types.ObjectId, ref: "product_boutique", required: true },
    price: { type: Number, required: true, min: 0 },
    from: { type: Date, required: true },
    to: { type: Date, default: null },
  },
  { timestamps: true }
);

priceHistorySchema.index({ productBoutiqueId: 1, from: -1 });
priceHistorySchema.index({ to: 1 });

export const PriceHistory: Model<IPriceHistory> = mongoose.model<IPriceHistory>("price_history", priceHistorySchema);
