import mongoose, { type Document, Model, Schema, Types } from "mongoose";

// ─────────────────────────────────────────────
//  CAMPAGNE DE LA PLATEFORME
//  « Soldes », « Rentrée chantier »… L'administration la crée ; une boutique
//  y inscrit ses offres seule, avec au moins la remise minimale : chaque
//  inscription est une remise produit de la boutique, rattachée à la
//  campagne et à ses dates.
// ─────────────────────────────────────────────
export interface ICampaign extends Document {
  slug: string;
  nom: string;
  description?: string | undefined;
  startDate: Date;
  endDate: Date;
  /** Remise minimale, en pourcentage, pour y inscrire une offre. */
  minDiscount: number;
  /** Familles concernées ; vide = tout le catalogue. */
  familleIds: Types.ObjectId[];
  image?: string | null;
  actif: boolean;
  createdBy?: Types.ObjectId | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const campaignSchema = new Schema<ICampaign>(
  {
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    nom: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    minDiscount: { type: Number, required: true, min: 5, max: 70 },
    familleIds: { type: [Types.ObjectId], ref: "famille", default: [] },
    image: { type: String, default: null },
    actif: { type: Boolean, default: true },
    createdBy: { type: Types.ObjectId, ref: "user", default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

campaignSchema.index({ actif: 1, startDate: 1, endDate: 1 });

campaignSchema.pre(/^find/, function (this: mongoose.Query<unknown, ICampaign>) {
  this.where({ deletedAt: null });
});

export const Campaign: Model<ICampaign> = mongoose.model<ICampaign>("campaign", campaignSchema);
