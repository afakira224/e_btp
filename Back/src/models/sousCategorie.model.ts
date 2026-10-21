import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface ISousCategorie extends Document {
  categorieId: Types.ObjectId;
  nom:         string;
  description?: string;
  image?:      string | null;
  ordre?:      number;
  actif:       boolean;
  deletedAt?:  Date | null;
  createdAt:   Date;
  updatedAt:   Date;
}

const sousCategorieSchema = new Schema<ISousCategorie>(
  {
    categorieId: { type: mongoose.Schema.Types.ObjectId, ref: "categorie", required: true },
    nom:         { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    image:       { type: String, default: null },
    ordre:       { type: Number, default: 0 },
    actif:       { type: Boolean, default: true },
    deletedAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

// Unicité du nom, mais uniquement au sein de la même catégorie
sousCategorieSchema.index({ categorieId: 1, nom: 1 }, { unique: true });

sousCategorieSchema.pre(/^find/, function (this: mongoose.Query<unknown, ISousCategorie>) {
  this.where({ deletedAt: null });
});

export const SousCategorie: Model<ISousCategorie> = mongoose.model<ISousCategorie>("sous-Categorie", sousCategorieSchema);