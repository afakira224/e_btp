import mongoose, { type Document, Model, Schema, Types } from "mongoose";

// ─────────────────────────────────────────────
//  BOOST
//  Comme « Booster la publication » : une boutique paie un budget par jour
//  pour que ses produits soient montrés à plus de clients, et aux bons.
//  Deux sortes : le boost de promotion (les offres d'une promotion, jusqu'à
//  sa fin) et le boost de produit (1 à 10 offres, avec ou sans promotion).
//  Le budget total est réservé sur les crédits de la boutique au lancement,
//  dépensé à la visite (ou aux 1 000 affichages), et le reste est rendu à
//  l'arrêt.
// ─────────────────────────────────────────────
export enum BoostKind {
  PROMOTION = "promotion",
  PRODUCT = "product",
}

export enum BoostGoal {
  VISITS = "visits",
  VIEWS = "views",
}

export enum BoostStatus {
  ACTIVE = "active",
  PAUSED = "paused",
  ENDED = "ended",
  STOPPED = "stopped",
}

export enum BoostRelation {
  ALL = "all",
  NEW = "new",
  RETURNING = "returning",
}

export interface IBoostAudience {
  /** auto : clients intéressés par ces familles ; custom : critères ci-dessous. */
  mode: "auto" | "custom";
  communes: string[];
  villes: string[];
  /** Types de compte visés ; vide = particuliers et sociétés. */
  customerTypes: string[];
  /** Familles d'intérêt ; vide = celles des offres boostées. */
  interestFamilleIds: Types.ObjectId[];
  relation: BoostRelation;
}

export interface IBoost extends Document {
  boutiqueId: Types.ObjectId;
  kind: BoostKind;
  promotionId?: Types.ObjectId | null;
  productBoutiqueIds: Types.ObjectId[];
  goal: BoostGoal;
  audience: IBoostAudience;
  dailyBudget: number;
  /** Budget réservé au lancement : budget par jour × jours. */
  reserved: number;
  spent: number;
  /** Prix fixés au lancement, en GNF : ils ne changent pas pendant le boost. */
  costPerVisit: number;
  costPerThousandViews: number;
  startDate: Date;
  endDate: Date;
  status: BoostStatus;
  stopReason?: string | null;
  endedAt?: Date | null;
  /** Budget non dépensé rendu en crédits. */
  refunded: number;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const audienceSchema = new Schema<IBoostAudience>(
  {
    mode: { type: String, enum: ["auto", "custom"], default: "auto" },
    communes: { type: [String], default: [] },
    villes: { type: [String], default: [] },
    customerTypes: { type: [String], default: [] },
    interestFamilleIds: { type: [Types.ObjectId], ref: "famille", default: [] },
    relation: { type: String, enum: Object.values(BoostRelation), default: BoostRelation.ALL },
  },
  { _id: false }
);

const boostSchema = new Schema<IBoost>(
  {
    boutiqueId: { type: Types.ObjectId, ref: "shop", required: true },
    kind: { type: String, enum: Object.values(BoostKind), required: true },
    promotionId: { type: Types.ObjectId, ref: "promotion", default: null },
    productBoutiqueIds: { type: [Types.ObjectId], ref: "product_boutique", default: [] },
    goal: { type: String, enum: Object.values(BoostGoal), default: BoostGoal.VISITS },
    audience: { type: audienceSchema, default: () => ({}) },
    dailyBudget: { type: Number, required: true, min: 1 },
    reserved: { type: Number, required: true, min: 0 },
    spent: { type: Number, min: 0, default: 0 },
    costPerVisit: { type: Number, required: true, min: 0 },
    costPerThousandViews: { type: Number, required: true, min: 0 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: Object.values(BoostStatus), default: BoostStatus.ACTIVE },
    stopReason: { type: String, default: null },
    endedAt: { type: Date, default: null },
    refunded: { type: Number, min: 0, default: 0 },
    createdBy: { type: Types.ObjectId, ref: "user", default: null },
  },
  { timestamps: true }
);

boostSchema.index({ status: 1, endDate: 1 });
boostSchema.index({ boutiqueId: 1, status: 1, createdAt: -1 });
boostSchema.index({ productBoutiqueIds: 1 });

export const Boost: Model<IBoost> = mongoose.model<IBoost>("boost", boostSchema);

// ── Statistiques par jour ───────────────────
export interface IBoostStat extends Document {
  boostId: Types.ObjectId;
  /** Jour au format AAAA-MM-JJ (UTC, l'heure de Conakry). */
  day: string;
  impressions: number;
  reach: number;
  visits: number;
  carts: number;
  orders: number;
  revenue: number;
  spent: number;
}

const boostStatSchema = new Schema<IBoostStat>(
  {
    boostId: { type: Types.ObjectId, ref: "boost", required: true },
    day: { type: String, required: true },
    impressions: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    visits: { type: Number, default: 0 },
    carts: { type: Number, default: 0 },
    orders: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    spent: { type: Number, default: 0 },
  },
  { timestamps: true }
);
boostStatSchema.index({ boostId: 1, day: 1 }, { unique: true });

export const BoostStat: Model<IBoostStat> = mongoose.model<IBoostStat>("boost_stat", boostStatSchema);

// ── Expositions et visites ──────────────────
// Une exposition par boost, visiteur et jour (le plafond de 3 affichages) ;
// une visite payée par boost, visiteur et jour. La visite sert aussi à
// rattacher une vente au boost pendant 7 jours.
export interface IBoostExposure extends Document {
  boostId: Types.ObjectId;
  viewerKey: string;
  day: string;
  count: number;
}

const boostExposureSchema = new Schema<IBoostExposure>(
  {
    boostId: { type: Types.ObjectId, ref: "boost", required: true },
    viewerKey: { type: String, required: true },
    day: { type: String, required: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: true }
);
boostExposureSchema.index({ boostId: 1, viewerKey: 1, day: 1 }, { unique: true });
boostExposureSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3 * 24 * 3600 });

export const BoostExposure: Model<IBoostExposure> = mongoose.model<IBoostExposure>("boost_exposure", boostExposureSchema);

export interface IBoostVisit extends Document {
  boostId: Types.ObjectId;
  productBoutiqueId: Types.ObjectId;
  viewerKey: string;
  userId?: Types.ObjectId | null;
  day: string;
  createdAt: Date;
}

const boostVisitSchema = new Schema<IBoostVisit>(
  {
    boostId: { type: Types.ObjectId, ref: "boost", required: true },
    productBoutiqueId: { type: Types.ObjectId, ref: "product_boutique", required: true },
    viewerKey: { type: String, required: true },
    userId: { type: Types.ObjectId, ref: "user", default: null },
    day: { type: String, required: true },
  },
  { timestamps: true }
);
boostVisitSchema.index({ boostId: 1, viewerKey: 1, day: 1 }, { unique: true });
boostVisitSchema.index({ userId: 1, productBoutiqueId: 1, createdAt: -1 });
boostVisitSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 3600 });

export const BoostVisit: Model<IBoostVisit> = mongoose.model<IBoostVisit>("boost_visit", boostVisitSchema);
