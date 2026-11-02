import { Shop } from "../../models/boutique.model.js";
import { User } from "../../models/user.model.js";
import { type ISupportTicket } from "../../models/supportTicket.model.js";
import logger from "../logger/logger.js";
import { sendNoticeMail } from "../helpers/mail.helper.js";
import { SUPPORT_TYPE_LABELS } from "../helpers/support.workflow.js";

// ─────────────────────────────────────────────
//  Avis du support : qui est prévenu, et de quoi.
//  Chaque changement prévient celui qui doit agir ensuite ; une note interne
//  ne prévient personne. Construits sans base, envoyés après la transaction :
//  un email qui échoue n'annule jamais une action.
// ─────────────────────────────────────────────

export type SupportRecipient = "requester" | "shop" | "admin";

export interface SupportNotice {
  recipient: SupportRecipient;
  subject: string;
  title: string;
  paragraphs: string[];
}

type Ticket = Pick<ISupportTicket, "_id" | "number" | "type" | "subject" | "requester" | "boutiqueId" | "requesterShopId">;

/** Lien de la demande pour chacun : son espace à lui. */
export const ticketLink = (ticket: Ticket, recipient: SupportRecipient) => {
  const id = String(ticket._id);
  if (recipient === "admin") return { path: `/admin/support/${id}`, label: "Traiter la demande" };
  if (recipient === "shop") return { path: `/ma-boutique/${String(ticket.boutiqueId)}/support/${id}`, label: "Répondre" };
  if (ticket.requesterShopId) {
    return { path: `/ma-boutique/${String(ticket.requesterShopId)}/support/${id}`, label: "Voir ma demande" };
  }
  return ticket.requester.userId ? { path: `/compte/support/${id}`, label: "Voir ma demande" } : undefined;
};

const ref = (ticket: Ticket) => `${ticket.number} — ${ticket.subject}`;

export const newTicketNotices = (ticket: Ticket, shopIsParty: boolean): SupportNotice[] => [
  {
    recipient: "requester",
    subject: `Demande ${ticket.number} enregistrée`,
    title: "Votre demande est enregistrée",
    paragraphs: [
      ref(ticket),
      shopIsParty
        ? "La boutique a 48 heures pour vous répondre. Sans réponse, l'administration prend la main."
        : "L'équipe de la plateforme vous répond sous 24 heures.",
    ],
  },
  shopIsParty
    ? {
        recipient: "shop",
        subject: `Nouvelle demande ${ticket.number}`,
        title: "Un client a besoin de vous",
        paragraphs: [ref(ticket), "Répondez sous 48 heures : sans réponse, la demande passe à l'administration."],
      }
    : {
        recipient: "admin",
        subject: `${SUPPORT_TYPE_LABELS[ticket.type]} : ${ticket.number}`,
        title: SUPPORT_TYPE_LABELS[ticket.type],
        paragraphs: [ref(ticket)],
      },
];

export const messageNotices = (ticket: Ticket, to: readonly SupportRecipient[], authorName: string): SupportNotice[] =>
  to.map((recipient) => ({
    recipient,
    subject: `Nouveau message — ${ticket.number}`,
    title: "Nouveau message sur une demande",
    paragraphs: [ref(ticket), `${authorName} a écrit dans la demande.`],
  }));

export const eventNotices = (
  ticket: Ticket,
  to: readonly SupportRecipient[],
  title: string,
  line: string
): SupportNotice[] =>
  to.map((recipient) => ({ recipient, subject: `${title} — ${ticket.number}`, title, paragraphs: [ref(ticket), line] }));

/** Résout les adresses, puis met les emails en file. */
export const deliverSupportNotices = async (notices: SupportNotice[], ticket: Ticket): Promise<void> => {
  if (notices.length === 0) return;
  try {
    const needs = new Set(notices.map((notice) => notice.recipient));
    const requester = needs.has("requester") && ticket.requester.userId ? await User.findById(ticket.requester.userId) : null;
    const shop = needs.has("shop") && ticket.boutiqueId ? await Shop.findById(ticket.boutiqueId) : null;
    const owner = shop ? await User.findById(shop.ownerId) : null;

    for (const notice of notices) {
      const to =
        notice.recipient === "requester"
          ? requester?.email ?? ticket.requester.email
          : notice.recipient === "shop"
            ? owner?.email ?? shop?.email
            : process.env.ADMIN_EMAIL;
      if (!to) {
        logger.info(`Avis « ${notice.subject} » sans destinataire (${notice.recipient})`);
        continue;
      }
      sendNoticeMail({
        to,
        subject: notice.subject,
        title: notice.title,
        username: notice.recipient === "requester" ? requester?.prenom ?? ticket.requester.name : notice.recipient === "shop" ? owner?.prenom : undefined,
        paragraphs: notice.paragraphs,
        cta: ticketLink(ticket, notice.recipient),
      });
    }
  } catch (error) {
    logger.error(`Avis de support non envoyés : ${(error as Error).message}`);
  }
};
