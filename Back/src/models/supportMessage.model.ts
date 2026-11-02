import mongoose, { Document, Model, Schema, Types } from "mongoose";
import { SupportParty } from "./supportTicket.model.js";

// ─────────────────────────────────────────────
//  MESSAGE D'UNE DEMANDE DE SUPPORT
//  Public : lu par les parties et l'administration. Interne : une note de
//  l'administration, que les parties ne lisent jamais. Une proposition, une
//  décision ou un événement (escalade, rappel) est aussi un message : le fil
//  raconte toute l'histoire de la demande.
// ─────────────────────────────────────────────

export enum SupportMessageKind {
  MESSAGE  = "message",
  PROPOSAL = "proposal",
  DECISION = "decision",
  EVENT    = "event",
}

export enum SupportVisibility {
  PUBLIC   = "public",
  INTERNAL = "internal",
}

export interface ISupportAttachment {
  url: string;
  name: string;
  mimetype: string;
  size: number;
}

export interface ISupportMessage extends Document {
  _id: Types.ObjectId;
  ticketId: Types.ObjectId;
  author: { userId?: Types.ObjectId | null; party: SupportParty; name: string };
  visibility: SupportVisibility;
  kind: SupportMessageKind;
  body: string;
  attachments: ISupportAttachment[];
  /** Le message contient un numéro ou un email : l'auteur a été averti. */
  containsContact: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<ISupportAttachment>(
  {
    url: { type: String, required: true },
    name: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false }
);

const supportMessageSchema = new Schema<ISupportMessage>(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: "support_ticket", required: true },
    author: {
      type: new Schema(
        {
          userId: { type: Schema.Types.ObjectId, ref: "user", default: null },
          party: { type: String, enum: Object.values(SupportParty), required: true },
          name: { type: String, required: true, trim: true },
        },
        { _id: false }
      ),
      required: true,
    },
    visibility: { type: String, enum: Object.values(SupportVisibility), default: SupportVisibility.PUBLIC },
    kind: { type: String, enum: Object.values(SupportMessageKind), default: SupportMessageKind.MESSAGE },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    attachments: { type: [attachmentSchema], default: [] },
    containsContact: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "support_message" }
);

supportMessageSchema.index({ ticketId: 1, createdAt: 1 });

export const SupportMessage: Model<ISupportMessage> = mongoose.model<ISupportMessage>(
  "support_message",
  supportMessageSchema
);
