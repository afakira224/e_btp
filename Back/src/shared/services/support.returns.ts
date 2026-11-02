import { Types, type ClientSession } from "mongoose";
import path from "node:path";
import { nextSequence } from "../../models/counter.model.js";
import { ShopOrderStatus, type IShopOrder } from "../../models/shopOrder.model.js";
import {
  SupportMessage,
  SupportMessageKind,
  SupportVisibility,
  type ISupportAttachment,
} from "../../models/supportMessage.model.js";
import {
  SupportOutcome,
  SupportParty,
  SupportPriority,
  SupportTargetKind,
  SupportTicket,
  SupportTicketStatus,
  SupportTicketType,
} from "../../models/supportTicket.model.js";
import { User } from "../../models/user.model.js";
import { ShopOrderAction, type ActionInput } from "../helpers/shopOrder.workflow.js";
import { reasonLabel, supportScheduleFor } from "../helpers/support.workflow.js";

// ─────────────────────────────────────────────
//  Le retour d'un produit, côté support.
//
//  « Demander un retour » sur une sous-commande ouvre une demande de support
//  de type retour : la conversation, les pièces et la décision y vivent. Le
//  statut, lui, suit la sous-commande (retour demandé, litige, retourné) et
//  ses délais : pas de seconde horloge. Appelé par applyShopOrderAction,
//  dans sa transaction ; un email part déjà avec chaque action de commande.
// ─────────────────────────────────────────────

export const supportNumber = async (): Promise<string> =>
  `SUP-${String(await nextSequence("support_ticket")).padStart(6, "0")}`;

const PLATFORM = "Plateforme";

const event = (ticketId: unknown, body: string, party = SupportParty.SYSTEM, name = PLATFORM) => ({
  ticketId,
  author: { userId: null, party, name },
  visibility: SupportVisibility.PUBLIC,
  kind: SupportMessageKind.EVENT,
  body,
});

export interface ReturnSyncParams {
  part: IShopOrder;
  action: ShopOrderAction | string;
  input: ActionInput;
  now: Date;
  session: ClientSession;
  userId?: string | undefined;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

/** Les photos d'un retour, déjà enregistrées par la sous-commande, deviennent ses pièces jointes. */
const photosAsAttachments = (photos: readonly string[] = []): ISupportAttachment[] =>
  photos.map((url) => ({
    url,
    name: path.basename(url),
    mimetype: MIME_BY_EXTENSION[path.extname(url).toLowerCase()] ?? "application/octet-stream",
    size: 0,
  }));

export const syncReturnTicket = async ({ part, action, input, now, session, userId }: ReturnSyncParams) => {
  if (action === ShopOrderAction.REQUEST_RETURN) {
    const client = await User.findById(part.userId).session(session);
    const name = client ? `${client.prenom} ${client.nom}`.trim() : "Client";
    const reason = input.reason ?? "not_as_described";
    const schedule = supportScheduleFor({ type: SupportTicketType.RETURN, priority: SupportPriority.NORMAL }, SupportTicketStatus.AWAITING_SHOP, now);
    const [ticket] = await SupportTicket.create(
      [
        {
          number: await supportNumber(),
          type: SupportTicketType.RETURN,
          reason,
          subject: `${reasonLabel(SupportTicketType.RETURN, reason)} — ${part.reference}`,
          status: SupportTicketStatus.AWAITING_SHOP,
          priority: SupportPriority.NORMAL,
          requester: { userId: part.userId, accountType: "user", name, email: client?.email },
          target: { kind: SupportTargetKind.SHOP_ORDER, id: part._id, label: part.reference },
          boutiqueId: part.boutiqueId,
          orderId: part.orderId,
          deadlineAt: schedule.deadlineAt,
          reminderAt: schedule.reminderAt,
          lastMessageAt: now,
        },
      ],
      { session }
    );
    if (!ticket) return null;
    await SupportMessage.create(
      [
        {
          ticketId: ticket._id,
          author: { userId: part.userId, party: SupportParty.REQUESTER, name },
          visibility: SupportVisibility.PUBLIC,
          kind: SupportMessageKind.MESSAGE,
          body: input.note?.trim() || `Retour demandé : ${reasonLabel(SupportTicketType.RETURN, reason)}.`,
          attachments: photosAsAttachments(input.photos),
        },
      ],
      { session }
    );
    return ticket;
  }

  const ticket = await SupportTicket.findOne({
    type: SupportTicketType.RETURN,
    "target.id": part._id,
    status: { $ne: SupportTicketStatus.CLOSED },
  })
    .sort({ createdAt: -1 })
    .session(session);
  if (!ticket) return null;

  const messages: Record<string, unknown>[] = [];
  const settle = (status: SupportTicketStatus) => {
    ticket.status = status;
    const schedule = supportScheduleFor(ticket, status, now);
    ticket.deadlineAt = schedule.deadlineAt;
    ticket.reminderAt = schedule.reminderAt;
  };

  switch (action) {
    case ShopOrderAction.ACCEPT_RETURN:
      ticket.shopRespondedAt = now;
      ticket.resolution = { outcome: SupportOutcome.UPHELD, note: "Retour accepté par la boutique.", by: SupportParty.SHOP, at: now };
      ticket.resolvedAt = now;
      settle(SupportTicketStatus.RESOLVED);
      messages.push(event(ticket._id, "La boutique accepte le retour : elle rembourse à la reprise du produit.", SupportParty.SHOP, part.boutiqueNom ?? "Boutique"));
      break;
    case ShopOrderAction.REJECT_RETURN:
      ticket.shopRespondedAt = now;
      ticket.escalatedAt = now;
      settle(SupportTicketStatus.AWAITING_ADMIN);
      messages.push({
        ...event(ticket._id, input.note?.trim() || "La boutique refuse le retour.", SupportParty.SHOP, part.boutiqueNom ?? "Boutique"),
        kind: SupportMessageKind.MESSAGE,
      });
      messages.push(event(ticket._id, "La boutique refuse le retour : l'administration va trancher."));
      break;
    case ShopOrderAction.ESCALATE:
      ticket.escalatedAt = now;
      settle(SupportTicketStatus.AWAITING_ADMIN);
      messages.push(event(ticket._id, "La boutique n'a pas répondu sous 48 heures : l'administration va trancher."));
      break;
    case ShopOrderAction.RESOLVE_DISPUTE: {
      const rejected = input.resolution === "rejected";
      ticket.resolution = {
        outcome: rejected ? SupportOutcome.REJECTED : SupportOutcome.UPHELD,
        note: input.note?.trim(),
        by: SupportParty.ADMIN,
        decidedBy: userId ? new Types.ObjectId(userId) : null,
        at: now,
      };
      ticket.resolvedAt = now;
      ticket.adminRespondedAt = now;
      settle(SupportTicketStatus.RESOLVED);
      messages.push({
        ...event(ticket._id, input.note?.trim() || "Décision de l'administration.", SupportParty.ADMIN, "Équipe de la plateforme"),
        kind: SupportMessageKind.DECISION,
      });
      break;
    }
    case ShopOrderAction.CONFIRM_REFUND:
      messages.push(event(ticket._id, "Remboursement confirmé."));
      break;
    default:
      // Toute autre fin de la sous-commande clôt le retour qu'elle portait.
      if (part.status === ShopOrderStatus.COMPLETED || part.status === ShopOrderStatus.CANCELLED) {
        settle(SupportTicketStatus.CLOSED);
        ticket.closedAt = now;
      } else {
        return ticket;
      }
  }

  ticket.lastMessageAt = now;
  await ticket.save({ session });
  if (messages.length > 0) await SupportMessage.create(messages, { session, ordered: true });
  return ticket;
};
