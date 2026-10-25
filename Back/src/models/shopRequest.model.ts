import mongoose, { Document, Model, Schema, Types } from "mongoose";

// ─────────────────────────────────────────────
//  DEMANDE D'OUVERTURE DE BOUTIQUE
//
//  Un client connecté demande l'ouverture d'une boutique depuis son profil :
//  il présente son activité en répondant à un questionnaire. La boutique
//  n'existe pas encore ; c'est l'administration qui l'ouvre en approuvant la
//  demande. Le compte passe alors au type « shop » et devient gérant.
//
//  La demande est conservée après examen : elle garde la trace de ce que le
//  vendeur a déclaré, de qui l'a examinée et quand.
// ─────────────────────────────────────────────

export enum ShopRequestStatus {
  PENDING   = "pending",   // en attente d'examen
  APPROVED  = "approved",  // boutique ouverte
  REJECTED  = "rejected",  // refusée, motif à l'appui
  CANCELLED = "cancelled", // retirée par le demandeur avant examen
}

/** Qui vend : un particulier ou une entreprise immatriculée. */
export enum SellerType {
  PARTICULIER = "particulier",
  ENTREPRISE  = "entreprise",
}

/** Depuis combien de temps le demandeur exerce cette activité. */
export enum SellerExperience {
  DEBUTANT    = "debutant",
  UN_A_TROIS  = "1_3_ans",
  TROIS_A_DIX = "3_10_ans",
  PLUS_DE_DIX = "plus_10_ans",
}

/** Nombre de références que le demandeur compte mettre en vente. */
export enum CatalogSize {
  MOINS_DE_50  = "moins_50",
  DE_50_A_200  = "50_200",
  PLUS_DE_200  = "plus_200",
}

export const SHOP_REQUEST_STATUS_LIBELLE: Record<ShopRequestStatus, string> = {
  [ShopRequestStatus.PENDING]: "En attente",
  [ShopRequestStatus.APPROVED]: "Approuvée",
  [ShopRequestStatus.REJECTED]: "Refusée",
  [ShopRequestStatus.CANCELLED]: "Annulée",
};

export interface IShopRequest extends Document {
  userId:            Types.ObjectId;
  nom:               string;
  description:       string;
  /** Domaines du catalogue dans lesquels la boutique vendra. */
  familleIds:        Types.ObjectId[];
  sellerType:        SellerType;
  /** Registre du commerce : exigé d'une entreprise, absent pour un particulier. */
  rccm?:             string | null;
  experience:        SellerExperience;
  catalogSize:       CatalogSize;
  /** Un point de vente où les clients peuvent retirer leurs achats. */
  hasPhysicalStore:  boolean;
  adresse:           string;
  /** Email de contact de la boutique ; à défaut, celui du compte. */
  email?:            string | null;
  /** Message libre à l'attention de l'administration. */
  message?:          string | null;
  acceptedTermsAt:   Date;
  status:            ShopRequestStatus;
  rejectionReason?:  string | null;
  reviewedBy?:       Types.ObjectId | null;
  reviewedAt?:       Date | null;
  /** Boutique ouverte à l'approbation. */
  shopId?:           Types.ObjectId | null;
  createdAt:         Date;
  updatedAt:         Date;
}

const shopRequestSchema = new Schema<IShopRequest>(
  {
    userId:           { type: Schema.Types.ObjectId, ref: "user", required: true },
    nom:              { type: String, required: true, trim: true },
    description:      { type: String, required: true, trim: true },
    familleIds:       { type: [{ type: Schema.Types.ObjectId, ref: "famille" }], default: [] },
    sellerType:       { type: String, enum: Object.values(SellerType), required: true },
    rccm:             { type: String, trim: true, default: null },
    experience:       { type: String, enum: Object.values(SellerExperience), required: true },
    catalogSize:      { type: String, enum: Object.values(CatalogSize), required: true },
    hasPhysicalStore: { type: Boolean, required: true },
    adresse:          { type: String, required: true, trim: true },
    email:            { type: String, trim: true, lowercase: true, default: null },
    message:          { type: String, trim: true, default: null },
    acceptedTermsAt:  { type: Date, required: true },
    status:           {
      type: String,
      enum: Object.values(ShopRequestStatus),
      default: ShopRequestStatus.PENDING,
    },
    rejectionReason:  { type: String, trim: true, default: null },
    reviewedBy:       { type: Schema.Types.ObjectId, ref: "user", default: null },
    reviewedAt:       { type: Date, default: null },
    shopId:           { type: Schema.Types.ObjectId, ref: "shop", default: null },
  },
  { timestamps: true }
);

// Une seule demande en cours par compte : la base le garantit, même si deux
// envois partent en même temps.
shopRequestSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: ShopRequestStatus.PENDING } }
);

// File d'examen de l'administration : par statut, les plus anciennes d'abord.
shopRequestSchema.index({ status: 1, createdAt: 1 });

export const ShopRequest: Model<IShopRequest> = mongoose.model<IShopRequest>(
  "shop_request",
  shopRequestSchema
);
