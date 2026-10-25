import mongoose, { type Document, Model, Schema, Types } from "mongoose";

// ─────────────────────────────────────────────
//  Complémentarité entre deux rayons (sous-catégories) :
//  « avec du ciment, on prend du sable ».
//
//  Deux origines, qui coexistent :
//    • regle     — posée à la main (seed, administration), valable dès le
//                  premier jour ;
//    • commandes — apprise des commandes (`npm run reco:complements`),
//                  recalculée en entier à chaque passage.
//  `poids` (0 à 1) ordonne les rayons proposés pour une même source.
// ─────────────────────────────────────────────
export enum OrigineComplementarite {
  REGLE = "regle",
  COMMANDES = "commandes",
}

export interface IComplementarite extends Document {
  source: Types.ObjectId;
  cible: Types.ObjectId;
  poids: number;
  origine: OrigineComplementarite;
  createdAt: Date;
  updatedAt: Date;
}

const complementariteSchema = new Schema<IComplementarite>(
  {
    source: { type: Schema.Types.ObjectId, ref: "sous-Categorie", required: true },
    cible: { type: Schema.Types.ObjectId, ref: "sous-Categorie", required: true },
    poids: { type: Number, required: true, min: 0, max: 1 },
    origine: { type: String, enum: Object.values(OrigineComplementarite), required: true },
  },
  { timestamps: true }
);

// Un lien par couple et par origine ; lecture « rayons qui vont avec X ».
complementariteSchema.index({ source: 1, cible: 1, origine: 1 }, { unique: true });
complementariteSchema.index({ source: 1, poids: -1 });

export const Complementarite: Model<IComplementarite> = mongoose.model<IComplementarite>(
  "complementarite",
  complementariteSchema
);
