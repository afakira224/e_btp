import mongoose, { type Document, Model, Schema, Types } from "mongoose";
import type { BaseModel } from "./baseModel.model.js";

// ─────────────────────────────────────────────
//  ADDRESS (adresse de livraison)
//  Un utilisateur peut avoir plusieurs adresses ; une seule est "par défaut".
// ─────────────────────────────────────────────
export interface IAddress extends Document, BaseModel {
  userId: Types.ObjectId;
  label?: string; // ex: "Maison", "Bureau"
  destinataire?: string; // nom du destinataire si différent
  telephone: string;
  adresse: string; // ligne d'adresse / rue
  ville: string;
  commune?: string; // quartier / commune (ex: Ratoma)
  pays: string;
  isDefault: boolean;
}

const addressSchema = new Schema<IAddress>(
  {
    userId: { type: Types.ObjectId, required: true, ref: "user" },
    label: { type: String, trim: true },
    destinataire: { type: String, trim: true },
    telephone: { type: String, required: true, trim: true },
    adresse: { type: String, required: true, trim: true },
    ville: { type: String, required: true, trim: true },
    commune: { type: String, trim: true },
    pays: { type: String, trim: true, default: "Guinée" },
    isDefault: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Liste des adresses d'un utilisateur, adresse par défaut en tête.
addressSchema.index({ userId: 1, isDefault: -1, createdAt: -1 });

addressSchema.pre(/^find/, function (this: mongoose.Query<unknown, IAddress>) {
  this.where({ deletedAt: null });
});

export const Address: Model<IAddress> = mongoose.model<IAddress>("address", addressSchema);
