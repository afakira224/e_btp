// ─────────────────────────────────────────────
//  SUPPORT - RESPONSE DTO
//
//  Une demande se lit de trois places : le demandeur, la boutique partie à
//  la demande (commande, retour), l'administration. Les notes internes ne
//  sortent que pour l'administration ; l'auteur d'un signalement n'est
//  jamais montré à la cible (qui ne lit d'ailleurs pas le signalement).
// ─────────────────────────────────────────────

import { SanctionType, type ISanction } from "../../models/sanction.model.js";
import {
  SupportParty,
  SupportTicketStatus,
  type ISupportTicket,
} from "../../models/supportTicket.model.js";
import { SupportVisibility, type ISupportMessage } from "../../models/supportMessage.model.js";
import {
  availableSupportActions,
  OUTCOME_LABELS,
  PROPOSAL_KINDS,
  reasonLabel,
  statusLabelFor,
  SUPPORT_TYPE_LABELS,
  type SupportAction,
} from "../helpers/support.workflow.js";

export interface SupportMessageDto {
  id: string;
  author: { party: SupportParty; name: string };
  visibility: SupportVisibility;
  kind: string;
  body: string;
  attachments: { url: string; name: string; mimetype: string; size: number }[];
  containsContact: boolean;
  createdAt: Date;
}

export interface SupportTicketDto {
  id: string;
  number: string;
  type: string;
  typeLabel: string;
  reason: string;
  reasonLabel: string;
  subject: string;
  status: SupportTicketStatus;
  statusLabel: string;
  priority: string;
  viewer: SupportParty;
  /** Qui doit agir maintenant ; null une fois la demande terminée. */
  waitingOn: SupportParty | null;
  requester: { name: string; accountType: string };
  target: { kind: string; id: string; label: string } | null;
  boutiqueId: string | null;
  requesterShopId: string | null;
  orderId: string | null;
  escalatedAt: Date | null;
  proposal: { kind: string; kindLabel: string; details: string; status: string; at: Date } | null;
  resolution: { outcome: string; outcomeLabel: string; note?: string | undefined; by: string; at: Date } | null;
  appeal: { by: string; reason: string; at: Date } | null;
  satisfaction: { rating: number; comment?: string | undefined } | null;
  assigneeId?: string | null | undefined;
  deadlineAt: Date | null;
  availableActions: SupportAction[];
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  messages?: SupportMessageDto[] | undefined;
}

const WAITING: Partial<Record<SupportTicketStatus, SupportParty>> = {
  [SupportTicketStatus.AWAITING_SHOP]: SupportParty.SHOP,
  [SupportTicketStatus.AWAITING_REQUESTER]: SupportParty.REQUESTER,
  [SupportTicketStatus.AWAITING_ADMIN]: SupportParty.ADMIN,
};

export const toSupportMessageDto = (message: ISupportMessage): SupportMessageDto => ({
  id: message._id.toString(),
  author: { party: message.author.party, name: message.author.name },
  visibility: message.visibility,
  kind: message.kind,
  body: message.body,
  attachments: (message.attachments ?? []).map((file) => ({ url: file.url, name: file.name, mimetype: file.mimetype, size: file.size })),
  containsContact: message.containsContact ?? false,
  createdAt: message.createdAt,
});

export const toSupportTicketDto = (
  ticket: ISupportTicket,
  viewer: SupportParty,
  parties: readonly SupportParty[],
  options: { now?: Date | undefined; messages?: ISupportMessage[] | undefined } = {}
): SupportTicketDto => {
  const now = options.now ?? new Date();
  const admin = viewer === SupportParty.ADMIN;
  return {
    id: ticket._id.toString(),
    number: ticket.number,
    type: ticket.type,
    typeLabel: SUPPORT_TYPE_LABELS[ticket.type],
    reason: ticket.reason,
    reasonLabel: reasonLabel(ticket.type, ticket.reason),
    subject: ticket.subject,
    status: ticket.status,
    statusLabel: statusLabelFor(ticket.status, viewer),
    priority: ticket.priority,
    viewer,
    waitingOn: WAITING[ticket.status] ?? null,
    requester: { name: ticket.requester.name, accountType: ticket.requester.accountType },
    target: ticket.target ? { kind: ticket.target.kind, id: ticket.target.id.toString(), label: ticket.target.label } : null,
    boutiqueId: ticket.boutiqueId ? ticket.boutiqueId.toString() : null,
    requesterShopId: ticket.requesterShopId ? ticket.requesterShopId.toString() : null,
    orderId: ticket.orderId ? ticket.orderId.toString() : null,
    escalatedAt: ticket.escalatedAt ?? null,
    proposal: ticket.proposal
      ? {
          kind: ticket.proposal.kind,
          kindLabel: PROPOSAL_KINDS[ticket.proposal.kind as keyof typeof PROPOSAL_KINDS] ?? ticket.proposal.kind,
          details: ticket.proposal.details,
          status: ticket.proposal.status,
          at: ticket.proposal.at,
        }
      : null,
    resolution: ticket.resolution
      ? {
          outcome: ticket.resolution.outcome,
          outcomeLabel: OUTCOME_LABELS[ticket.resolution.outcome],
          note: ticket.resolution.note,
          by: ticket.resolution.by,
          at: ticket.resolution.at,
        }
      : null,
    appeal: ticket.appeal ? { by: ticket.appeal.by, reason: ticket.appeal.reason, at: ticket.appeal.at } : null,
    satisfaction: ticket.satisfaction ? { rating: ticket.satisfaction.rating, comment: ticket.satisfaction.comment } : null,
    ...(admin ? { assigneeId: ticket.assignee ? ticket.assignee.toString() : null } : {}),
    deadlineAt: ticket.deadlineAt ?? null,
    availableActions: availableSupportActions(parties, ticket, now),
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    lastMessageAt: ticket.lastMessageAt ?? null,
    resolvedAt: ticket.resolvedAt ?? null,
    closedAt: ticket.closedAt ?? null,
    ...(options.messages
      ? {
          messages: options.messages
            .filter((message) => admin || message.visibility === SupportVisibility.PUBLIC)
            .map(toSupportMessageDto),
        }
      : {}),
  };
};

export interface SanctionDto {
  id: string;
  type: SanctionType;
  target: { kind: string; id: string; label: string };
  reason: string;
  ticketId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  provisional: boolean;
  /** en cours, terminée (suspension arrivée à échéance) ou levée. */
  state: "active" | "ended" | "lifted";
  liftRequestedAt: Date | null;
  liftedAt: Date | null;
  liftReason: string | null;
  createdAt: Date;
}

export const toSanctionDto = (sanction: ISanction, now = new Date()): SanctionDto => ({
  id: sanction._id.toString(),
  type: sanction.type,
  target: { kind: sanction.target.kind, id: sanction.target.id.toString(), label: sanction.target.label },
  reason: sanction.reason,
  ticketId: sanction.ticketId ? sanction.ticketId.toString() : null,
  startsAt: sanction.startsAt,
  endsAt: sanction.endsAt ?? null,
  provisional: sanction.provisional ?? false,
  state: sanction.liftedAt
    ? "lifted"
    : sanction.type === SanctionType.SUSPENSION && sanction.endsAt && sanction.endsAt <= now
      ? "ended"
      : "active",
  liftRequestedAt: sanction.liftRequestedAt ?? null,
  liftedAt: sanction.liftedAt ?? null,
  liftReason: sanction.liftReason ?? null,
  createdAt: sanction.createdAt,
});
