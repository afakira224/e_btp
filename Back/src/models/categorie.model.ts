import mongoose, { Document, Model, Schema, Types } from "mongoose";
import { Etape } from "./projet.model.js";

export interface ICategorie extends Document {
  familleId:   Types.ObjectId;
  nom:         string;
  description?: string;
  image?:      string | null;
  ordre?:      number;
  actif:       boolean;
  /** Étape du chantier où l'on a besoin de cette catégorie. */
  etape:       Etape;
  deletedAt?:  Date | null;
  createdAt:   Date;
  updatedAt:   Date;
}

const categorieSchema = new Schema<ICategorie>(
  {
    familleId:   { type: mongoose.Schema.Types.ObjectId, ref: "famille", required: true },
    nom:         { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    image:       { type: String, default: null },
    ordre:       { type: Number, default: 0 },
    actif:       { type: Boolean, default: true },
    etape:       { type: String, enum: Object.values(Etape), default: Etape.TRANSVERSE },
    deletedAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

// « Pour la suite de votre chantier » : catégories d'une étape, par famille.
categorieSchema.index({ etape: 1, familleId: 1 });

// Unicité du nom, mais uniquement au sein de la même famille
categorieSchema.index({ familleId: 1, nom: 1 }, { unique: true });

categorieSchema.pre(/^find/, function (this: mongoose.Query<unknown, ICategorie>) {
  this.where({ deletedAt: null });
});

export const Categorie: Model<ICategorie> = mongoose.model<ICategorie>("categorie", categorieSchema);