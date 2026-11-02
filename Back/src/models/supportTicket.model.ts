import mongoose, { Document, Model, Schema, Types } from "mongoose";

// ─────────────────────────────────────────────
//  DEMANDE DE SUPPORT
//
//  Un seul guichet pour tout ce qui ne va pas : un problème sur une commande,
//  le retour d'un produit, le signalement d'une annonce, d'une boutique, d'un
//  avis ou d'un client, une question, la contestation d'une sanction.
//
//  À chaque instant, la demande attend quelqu'un (la boutique, le demandeur
//  ou l'administration) avant une échéance ; sans réponse, elle avance seule
//  (shared/helpers/support.workflow.ts). Les messages vivent à part
//  (support_message) ; les décisions qui touchent l'argent passent par les
//  actions de la sous-commande, jamais par la demande.
// ─────────────────────────────────────────────

export enum SupportTicketType {
  ORDER_PROBLEM    = "order_problem",    // client → boutique, puis administration
  RETURN           = "return",           // ouverte par « Demander un retour » ; suit la sous-commande
  LISTING_REPORT   = "listing_report",   // une annonce (offre)
  SHOP_REPORT      = "shop_report",      // une boutique
  REVIEW_REPORT    = "review_report",    // un avis
  CUSTOMER_REPORT  = "customer_report",  // un client, signalé par une boutique
  GENERAL_QUESTION = "general_question", // compte, paiement, utilisation…
  SANCTION_APPEAL  = "sanction_appeal",  // contestation d'une mesure
}

export enum SupportTicketStatus {
  AWAITING_SHOP      = "awaiting_shop",      // la boutique doit répondre
  AWAITING_REQUESTER = "awaiting_requester", // le demandeur doit répondre
  AWAITING_ADMIN     = "awaiting_admin",     // l'administration doit répondre ou trancher
  RESOLVED           = "resolved",           // solution appliquée ; recours possible 7 jours
  CLOSED             = "closed",             // terminée ; réouvrable 14 jours par le demandeur
}

export enum SupportPriority {
  URGENT = "urgent",
  NORMAL = "normal",
  LOW    = "low",
}

export enum SupportTargetKind {
  SHOP_ORDER = "shop_order",
  OFFER      = "offer",
  SHOP       = "shop",
  REVIEW     = "review",
  USER       = "user",
  SANCTION   = "sanction",
}

/** Issue d'une demande. */
export enum SupportOutcome {
  UPHELD    = "upheld",    // donnée en faveur du demandeur
  REJECTED  = "rejected",  // rejetée
  ANSWERED  = "answered",  // question traitée
  AGREED    = "agreed",    // proposition de la boutique acceptée
  WITHDRAWN = "withdrawn", // retirée par le demandeur
  EXPIRED   = "expired",   // fermée faute de réponse du demandeur
}

/** Rôle d'une personne sur une demande. */
export enum SupportParty {
  REQUESTER = "requester",
  SHOP      = "shop",
  ADMIN     = "admin",
  SYSTEM    = "system",
}

export interface ISupportRequester {
  /** Absent pour un visiteur passé par « Nous contacter ». */
  userId?: Types.ObjectId | null;
  /** Type de compte au moment de la demande (user, shop, admin) ; « guest » sans compte. */
  accountType: string;
  name: string;
  email?: string | undefined;
}

export interface ISupportTarget {
  kind: SupportTargetKind;
  id: Types.ObjectId;
  /** Nom lisible figé à l'ouverture : référence de commande, produit, boutique… */
  label: string;
}

export interface ISupportProposal {
  kind: string;
  details: string;
  status: "pending" | "accepted" | "declined";
  at: Date;
  by: Types.ObjectId;
}

export interface ISupportResolution {
  outcome: SupportOutcome;
  note?: string | undefined;
  by: SupportParty;
  decidedBy?: Types.ObjectId | null;
  at: Date;
}

export interface ISupportAppeal {
  by: SupportParty;
  userId: Types.ObjectId;
  reason: string;
  at: Date;
}

export interface ISupportTicket extends Document {
  _id: Types.ObjectId;
  number: string;
  type: SupportTicketType;
  reason: string;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportPriority;
  requester: ISupportRequester;
  target?: ISupportTarget | null;
  /** Boutique concernée : partie à la demande pour une commande ou un retour, dossier pour un signalement. */
  boutiqueId?: Types.ObjectId | null;
  /** Une boutique demande (signalement d'un client, question) : celle au nom de laquelle elle écrit. */
  requesterShopId?: Types.ObjectId | null;
  orderId?: Types.ObjectId | null;
  assignee?: Types.ObjectId | null;
  escalatedAt?: Date | null;
  shopRespondedAt?: Date | null;
  adminRespondedAt?: Date | null;
  deadlineAt?: Date | null;
  reminderAt?: Date | null;
  proposal?: ISupportProposal | null;
  resolution?: ISupportResolution | null;
  appeal?: ISupportAppeal | null;
  resolvedAt?: Date | null;
  closedAt?: Date | null;
  reopenedAt?: Date | null;
  satisfaction?: { rating: number; comment?: string | undefined; at: Date } | null;
  lastMessageAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const requesterSchema = new Schema<ISupportRequester>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "user", default: null },
    accountType: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
  },
  { _id: false }
);

const targetSchema = new Schema<ISupportTarget>(
  {
    kind: { type: String, enum: Object.values(SupportTargetKind), required: true },
    id: { type: Schema.Types.ObjectId, required: true },
    label: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const proposalSchema = new Schema<ISupportProposal>(
  {
    kind: { type: String, required: true },
    details: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: ["pending", "accepted", "declined"], default: "pending" },
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: "user", required: true },
  },
  { _id: false }
);

const resolutionSchema = new Schema<ISupportResolution>(
  {
    outcome: { type: String, enum: Object.values(SupportOutcome), required: true },
    note: { type: String, trim: true, maxlength: 1000 },
    by: { type: String, enum: Object.values(SupportParty), required: true },
    decidedBy: { type: Schema.Types.ObjectId, ref: "user", default: null },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const appealSchema = new Schema<ISupportAppeal>(
  {
    by: { type: String, enum: Object.values(SupportParty), required: true },
    userId: { type: Schema.Types.ObjectId, ref: "user", required: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const supportTicketSchema = new Schema<ISupportTicket>(
  {
    number: { type: String, required: true, unique: true },
    type: { type: String, enum: Object.values(SupportTicketType), required: true },
    reason: { type: String, required: true },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    status: { type: String, enum: Object.values(SupportTicketStatus), required: true },
    priority: { type: String, enum: Object.values(SupportPriority), default: SupportPriority.NORMAL },
    requester: { type: requesterSchema, required: true },
    target: { type: targetSchema, default: null },
    boutiqueId: { type: Schema.Types.ObjectId, ref: "shop", default: null },
    requesterShopId: { type: Schema.Types.ObjectId, ref: "shop", default: null },
    orderId: { type: Schema.Types.ObjectId, ref: "order", default: null },
    assignee: { type: Schema.Types.ObjectId, ref: "user", default: null },
    escalatedAt: { type: Date, default: null },
    shopRespondedAt: { type: Date, default: null },
    adminRespondedAt: { type: Date, default: null },
    deadlineAt: { type: Date, default: null },
    reminderAt: { type: Date, default: null },
    proposal: { type: proposalSchema, default: null },
    resolution: { type: resolutionSchema, default: null },
    appeal: { type: appealSchema, default: null },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    reopenedAt: { type: Date, default: null },
    satisfaction: {
      type: new Schema(
        { rating: { type: Number, min: 1, max: 5, required: true }, comment: { type: String, trim: true, maxlength: 500 }, at: { type: Date, required: true } },
        { _id: false }
      ),
      default: null,
    },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "support_ticket" }
);

// « Mes demandes », l'espace d'une boutique, la file de l'administration.
supportTicketSchema.index({ "requester.userId": 1, updatedAt: -1 });
supportTicketSchema.index({ boutiqueId: 1, status: 1, updatedAt: -1 });
supportTicketSchema.index({ requesterShopId: 1, status: 1, updatedAt: -1 });
supportTicketSchema.index({ status: 1, priority: 1, createdAt: 1 });
// Dossier d'une cible : toutes les demandes qui la visent.
supportTicketSchema.index({ "target.kind": 1, "target.id": 1, createdAt: -1 });
// Tâche des délais.
supportTicketSchema.index({ deadlineAt: 1 });
supportTicketSchema.index({ reminderAt: 1 });

export const SupportTicket: Model<ISupportTicket> = mongoose.model<ISupportTicket>(
  "support_ticket",
  supportTicketSchema
);
