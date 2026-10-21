import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface ICategorie extends Document {
  familleId:   Types.ObjectId;
  nom:         string;
  description?: string;
  image?:      string | null;
  ordre?:      number;
  actif:       boolean;
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
    deletedAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

// Unicité du nom, mais uniquement au sein de la même famille
categorieSchema.index({ familleId: 1, nom: 1 }, { unique: true });

categorieSchema.pre(/^find/, function (this: mongoose.Query<unknown, ICategorie>) {
  this.where({ deletedAt: null });
});

export const Categorie: Model<ICategorie> = mongoose.model<ICategorie>("categorie", categorieSchema);