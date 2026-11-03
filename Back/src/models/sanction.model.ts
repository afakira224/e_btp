import mongoose, { Document, Model, Schema, Types } from "mongoose";

// ─────────────────────────────────────────────
//  SANCTION
//
//  Une mesure de la plateforme contre une annonce, un avis, une boutique ou
//  un compte : masquer, avertir, suspendre, bloquer. Toujours motivée,
//  rattachée à la demande qui la justifie, datée et levable. L'historique
//  d'une cible (ses sanctions, levées comprises) sert à graduer la suivante.
//  Les effets (offre masquée, boutique suspendue, compte bloqué) sont portés
//  par la cible elle-même ; ce document en garde la trace.
// ─────────────────────────────────────────────

export enum SanctionType {
  HIDE       = "hide",       // annonce ou avis retiré de la vue publique
  WARNING    = "warning",    // avertissement écrit
  SUSPENSION = "suspension", // boutique : plus de nouvelle commande
  BLOCK      = "block",      // compte : plus de connexion
  PROMO_BAN  = "promo_ban",  // boutique : plus de promotion ni de boost
}

export enum SanctionTargetKind {
  OFFER  = "offer",
  REVIEW = "review",
  SHOP   = "shop",
  USER   = "user",
}

export interface ISanction extends Document {
  _id: Types.ObjectId;
  type: SanctionType;
  target: { kind: SanctionTargetKind; id: Types.ObjectId; label: string };
  /** Compte prévenu de la mesure (gérant, auteur de l'avis, client). */
  notifiedUserId?: Types.ObjectId | null;
  reason: string;
  ticketId?: Types.ObjectId | null;
  startsAt: Date;
  /** Suspension seulement : la date de fin. */
  endsAt?: Date | null;
  /** Masquage automatique après plusieurs signalements, à confirmer. */
  provisional: boolean;
  createdBy?: Types.ObjectId | null;
  /** La boutique a corrigé son annonce et demande sa remise en ligne. */
  liftRequestedAt?: Date | null;
  liftedAt?: Date | null;
  liftedBy?: Types.ObjectId | null;
  liftReason?: string | null;
  /** Boutiques suspendues par le blocage de leur gérant, rouvertes à la levée. */
  suspendedShopIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const sanctionSchema = new Schema<ISanction>(
  {
    type: { type: String, enum: Object.values(SanctionType), required: true },
    target: {
      type: new Schema(
        {
          kind: { type: String, enum: Object.values(SanctionTargetKind), required: true },
          id: { type: Schema.Types.ObjectId, required: true },
          label: { type: String, required: true, trim: true },
        },
        { _id: false }
      ),
      required: true,
    },
    notifiedUserId: { type: Schema.Types.ObjectId, ref: "user", default: null },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    ticketId: { type: Schema.Types.ObjectId, ref: "support_ticket", default: null },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, default: null },
    provisional: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "user", default: null },
    liftRequestedAt: { type: Date, default: null },
    liftedAt: { type: Date, default: null },
    liftedBy: { type: Schema.Types.ObjectId, ref: "user", default: null },
    liftReason: { type: String, trim: true, default: null },
    suspendedShopIds: { type: [Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true, collection: "sanction" }
);

sanctionSchema.index({ "target.kind": 1, "target.id": 1, createdAt: -1 });
sanctionSchema.index({ notifiedUserId: 1, createdAt: -1 });
sanctionSchema.index({ type: 1, endsAt: 1 });

export const Sanction: Model<ISanction> = mongoose.model<ISanction>("sanction", sanctionSchema);
