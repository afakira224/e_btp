import mongoose, { Document, Model, Schema, Types } from "mongoose";
import { shopDeliverySchema, type IShopDelivery } from "./delivery.model.js";

export interface IShop extends Document {
  ownerId:     Types.ObjectId;
  nom:         string;
  description?: string;
  logo?:       string | null;
  telephone?:  string;
  email?:      string;
  adresse?:    string;
  delivery:    IShopDelivery;
  deletedAt?:  Date | null;
  createdAt:   Date;
  updatedAt:   Date;
}

const shopSchema = new Schema<IShop>(
  {
    ownerId:     { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    nom:         { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    logo:        { type: String, default: null },
    telephone:   { type: String, trim: true },
    email:       { type: String, trim: true, lowercase: true },
    adresse:     { type: String, trim: true },
    // Modes de livraison proposés par défaut aux produits de la boutique.
    // Une boutique antérieure à cette option reçoit les réglages par défaut
    // à la lecture (voir DEFAULT_SHOP_MODES).
    delivery:    { type: shopDeliverySchema, default: () => ({}) },
    deletedAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

// Boutiques appartenant à un utilisateur.
shopSchema.index({ ownerId: 1 });

shopSchema.pre(/^find/, function (this: mongoose.Query<unknown, IShop>) {
  this.where({ deletedAt: null });
});

export const Shop: Model<IShop> = mongoose.model<IShop>("shop", shopSchema);