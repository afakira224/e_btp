import mongoose, { type Document, Model, Schema, Types } from "mongoose";

// ─────────────────────────────────────────────
//  CRÉDITS DE BOOST
//  Le portefeuille d'une boutique, en GNF : rechargé par mobile money (ou
//  offert chaque mois), réservé au lancement d'un boost, rendu à son arrêt.
//  Le solde vit sur le registre : chaque mouvement porte le solde après lui.
// ─────────────────────────────────────────────
export enum CreditReason {
  RECHARGE = "recharge",
  MONTHLY_GRANT = "monthly_grant",
  BOOST_RESERVE = "boost_reserve",
  BOOST_REFUND = "boost_refund",
}

export interface ICreditLedger extends Document {
  boutiqueId: Types.ObjectId;
  delta: number;
  balanceAfter: number;
  reason: CreditReason;
  /** Boost, achat de crédits, ou mois du don (AAAA-MM). */
  ref?: string | null;
  label: string;
  createdAt: Date;
}

const creditLedgerSchema = new Schema<ICreditLedger>(
  {
    boutiqueId: { type: Types.ObjectId, ref: "shop", required: true },
    delta: { type: Number, required: true },
    balanceAfter: { type: Number, required: true, min: 0 },
    reason: { type: String, enum: Object.values(CreditReason), required: true },
    ref: { type: String, default: null },
    label: { type: String, required: true },
  },
  { timestamps: true }
);
creditLedgerSchema.index({ boutiqueId: 1, createdAt: -1 });
// Un seul don par boutique et par mois.
creditLedgerSchema.index({ boutiqueId: 1, reason: 1, ref: 1 }, { unique: true, partialFilterExpression: { reason: CreditReason.MONTHLY_GRANT } });

export const CreditLedger: Model<ICreditLedger> = mongoose.model<ICreditLedger>("credit_ledger", creditLedgerSchema);

export enum CreditPurchaseStatus {
  PENDING = "pending",
  PAID = "paid",
  FAILED = "failed",
}

export interface ICreditPurchase extends Document {
  boutiqueId: Types.ObjectId;
  amount: number;
  status: CreditPurchaseStatus;
  providerRef?: string | null;
  paidAt?: Date | null;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
}

const creditPurchaseSchema = new Schema<ICreditPurchase>(
  {
    boutiqueId: { type: Types.ObjectId, ref: "shop", required: true },
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: Object.values(CreditPurchaseStatus), default: CreditPurchaseStatus.PENDING },
    providerRef: { type: String, default: null },
    paidAt: { type: Date, default: null },
    createdBy: { type: Types.ObjectId, ref: "user", default: null },
  },
  { timestamps: true }
);
creditPurchaseSchema.index({ boutiqueId: 1, createdAt: -1 });

export const CreditPurchase: Model<ICreditPurchase> = mongoose.model<ICreditPurchase>("credit_purchase", creditPurchaseSchema);

// ── Réglages de la plateforme ───────────────
// Prix de la visite, des 1 000 affichages et crédits offerts chaque mois :
// fixés par l'administration.
export interface IPlatformSetting extends Document {
  key: string;
  value: Record<string, unknown>;
}

const platformSettingSchema = new Schema<IPlatformSetting>(
  { key: { type: String, required: true, unique: true }, value: { type: Schema.Types.Mixed, default: {} } },
  { timestamps: true }
);

export const PlatformSetting: Model<IPlatformSetting> = mongoose.model<IPlatformSetting>("platform_setting", platformSettingSchema);
