import mongoose, { Document, Model, Schema } from "mongoose";

export interface IFamille extends Document {
  nom:         string;
  description?: string;
  image?:      string | null;
  ordre?:      number;
  actif:       boolean;
  deletedAt?:  Date | null;
  createdAt:   Date;
  updatedAt:   Date;
}

const familleSchema = new Schema<IFamille>(
  {
    nom:         { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true },
    image:       { type: String, default: null },
    ordre:       { type: Number, default: 0 },
    actif:       { type: Boolean, default: true },
    deletedAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

familleSchema.pre(/^find/, function (this: mongoose.Query<unknown, IFamille>) {
  this.where({ deletedAt: null });
});

export const Famille: Model<IFamille> = mongoose.model<IFamille>("famille", familleSchema);