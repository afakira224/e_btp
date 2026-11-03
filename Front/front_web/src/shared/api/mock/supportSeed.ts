import type {
  SanctionTargetKind,
  SanctionType,
  SupportAttachment,
  SupportOutcome,
  SupportParty,
  SupportPriority,
  SupportTicketStatus,
  SupportTicketType,
} from "../../../entities/support";
import type { MockShopOrder } from "./accountSeed";
import { supportScheduleFor } from "./supportRules";

// ─────────────────────────────────────────────
//  Support simulé : demandes, messages, sanctions, tels que le back les
//  stocke (support_ticket, support_message, sanction), et les demandes de
//  démonstration du compte mamadou@btp.com.
// ─────────────────────────────────────────────

export interface MockSupportTicket {
  id: string;
  number: string;
  type: SupportTicketType;
  reason: string;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportPriority;
  requester: { userId: string | null; accountType: string; name: string; email?: string | undefined };
  target: { kind: string; id: string; label: string } | null;
  boutiqueId: string | null;
  requesterShopId: string | null;
  orderId: string | null;
  assignee: string | null;
  escalatedAt: string | null;
  shopRespondedAt: string | null;
  adminRespondedAt: string | null;
  deadlineAt: string | null;
  reminderAt: string | null;
  proposal: { kind: string; details: string; status: "pending" | "accepted" | "declined"; at: string; by: string } | null;
  resolution: { outcome: SupportOutcome; note?: string | undefined; by: SupportParty; decidedBy?: string | null; at: string } | null;
  appeal: { by: SupportParty; userId: string; reason: string; at: string } | null;
  resolvedAt: string | null;
  closedAt: string | null;
  reopenedAt: string | null;
  satisfaction: { rating: number; comment?: string | undefined; at: string } | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MockSupportMessage {
  id: string;
  ticketId: string;
  author: { userId: string | null; party: SupportParty; name: string };
  visibility: "public" | "internal";
  kind: "message" | "proposal" | "decision" | "event";
  body: string;
  attachments: SupportAttachment[];
  containsContact: boolean;
  createdAt: string;
}

export interface MockSanction {
  id: string;
  type: SanctionType;
  target: { kind: SanctionTargetKind; id: string; label: string };
  notifiedUserId: string | null;
  reason: string;
  ticketId: string | null;
  startsAt: string;
  endsAt: string | null;
  provisional: boolean;
  createdBy: string | null;
  liftRequestedAt: string | null;
  liftedAt: string | null;
  liftedBy: string | null;
  liftReason: string | null;
  suspendedShopIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Effets des sanctions, lus par le catalogue, le panier, le checkout et la connexion. */
export interface MockModeration {
  hiddenOffers: Record<string, { at: string; reason: string }>;
  suspendedShops: Record<string, string>;
  blockedUsers: Record<string, string>;
  /** Boutique → fin de la sanction « promotions suspendues ». */
  promotionsBlocked?: Record<string, string>;
}

export const EMPTY_MODERATION: MockModeration = { hiddenOffers: {}, suspendedShops: {}, blockedUsers: {}, promotionsBlocked: {} };

export const PLATFORM_NAME = "Équipe de la plateforme";

const DAY = 24 * 3600 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

interface SeedUser {
  _id: string;
  nom: string;
  prenom: string;
  email: string;
}

const blankTicket = (over: Partial<MockSupportTicket> & Pick<MockSupportTicket, "id" | "number" | "type" | "reason" | "subject" | "status" | "requester" | "createdAt">): MockSupportTicket => ({
  priority: "normal",
  target: null,
  boutiqueId: null,
  requesterShopId: null,
  orderId: null,
  assignee: null,
  escalatedAt: null,
  shopRespondedAt: null,
  adminRespondedAt: null,
  deadlineAt: null,
  reminderAt: null,
  proposal: null,
  resolution: null,
  appeal: null,
  resolvedAt: null,
  closedAt: null,
  reopenedAt: null,
  satisfaction: null,
  lastMessageAt: over.createdAt,
  updatedAt: over.createdAt,
  ...over,
});

/**
 * Demandes de démonstration : un retard chez Volta Électrique (à traiter par
 * le gérant), les deux retours déjà en cours dans les commandes, un
 * signalement d'annonce et une question traitée.
 */
export const seedSupportFor = (
  user: SeedUser | undefined,
  shopOrders: readonly MockShopOrder[]
): { tickets: MockSupportTicket[]; messages: MockSupportMessage[]; seq: number } => {
  if (!user) return { tickets: [], messages: [], seq: 0 };
  const name = `${user.prenom} ${user.nom}`.trim();
  const requester = { userId: user._id, accountType: "user", name, email: user.email };
  const tickets: MockSupportTicket[] = [];
  const messages: MockSupportMessage[] = [];
  let seq = 0;
  const number = () => `SUP-${String(++seq).padStart(6, "0")}`;
  const say = (ticketId: string, at: string, author: MockSupportMessage["author"], body: string, kind: MockSupportMessage["kind"] = "message") =>
    messages.push({ id: `msg-${ticketId}-${messages.length + 1}`, ticketId, author, visibility: "public", kind, body, attachments: [], containsContact: false, createdAt: at });
  const client = { userId: user._id, party: "requester" as const, name };
  const platform = { userId: null, party: "system" as const, name: PLATFORM_NAME };

  const part = (n: number, shop: string) =>
    shopOrders.find((candidate) => candidate.orderId === `cmd-${user._id}-${n}` && candidate.boutiqueNom === shop);

  // 1. Un retard chez Volta : la boutique a encore une journée pour répondre.
  const late = part(2, "Volta Électrique");
  if (late) {
    const at = ago(1);
    const schedule = supportScheduleFor({ type: "order_problem", priority: "normal" }, "awaiting_shop", new Date(at));
    const ticket = blankTicket({
      id: "sup-1",
      number: number(),
      type: "order_problem",
      reason: "delay",
      subject: `Retard — ${late.reference}`,
      status: "awaiting_shop",
      requester,
      target: { kind: "shop_order", id: late.id, label: late.reference },
      boutiqueId: late.boutiqueId,
      orderId: late.orderId,
      ...schedule,
      createdAt: at,
    });
    tickets.push(ticket);
    say(ticket.id, at, client, "La commande devait partir avant-hier et elle est toujours en préparation. Pouvez-vous me donner une date de livraison ?");
  }

  // 2 et 3. Les retours en cours deviennent des demandes : la boutique doit
  // répondre à l'un ; l'autre, refusé, attend l'arbitrage.
  for (const [shop, id] of [["Volta Électrique", "sup-2"], ["Sanitaire Plus", "sup-3"]] as const) {
    const returned = part(5, shop);
    if (!returned?.return) continue;
    const disputed = returned.status === "disputed";
    const ticket = blankTicket({
      id,
      number: number(),
      type: "return",
      reason: returned.return.reason,
      subject: `${returned.return.reason === "incomplete" ? "Commande incomplète" : "Produit non conforme"} — ${returned.reference}`,
      status: disputed ? "awaiting_admin" : "awaiting_shop",
      requester,
      target: { kind: "shop_order", id: returned.id, label: returned.reference },
      boutiqueId: returned.boutiqueId,
      orderId: returned.orderId,
      escalatedAt: disputed ? returned.return.respondedAt : null,
      shopRespondedAt: returned.return.respondedAt,
      ...(disputed ? supportScheduleFor({ type: "return", priority: "normal" }, "awaiting_admin", new Date()) : {}),
      createdAt: returned.return.requestedAt,
      lastMessageAt: returned.return.respondedAt ?? returned.return.requestedAt,
    });
    tickets.push(ticket);
    say(ticket.id, returned.return.requestedAt, client, returned.return.details ?? "Retour demandé.");
    if (disputed && returned.return.respondedAt) {
      say(ticket.id, returned.return.respondedAt, { userId: null, party: "shop", name: shop }, returned.return.shopResponse ?? "La boutique refuse le retour.");
      say(ticket.id, returned.return.respondedAt, platform, "La boutique refuse le retour : l'administration va trancher.", "event");
    }
  }

  // 4. Un signalement d'annonce, à examiner par l'administration.
  {
    const at = ago(0.3);
    const ticket = blankTicket({
      id: "sup-4",
      number: number(),
      type: "listing_report",
      reason: "misleading",
      subject: "Description trompeuse — Meuleuse d'angle 125 mm",
      status: "awaiting_admin",
      requester,
      target: { kind: "offer", id: "off-meuleuse-125", label: "Meuleuse d'angle 125 mm — Pro Outillage" },
      boutiqueId: "shop-pro-outillage",
      ...supportScheduleFor({ type: "listing_report", priority: "normal" }, "awaiting_admin", new Date(at)),
      createdAt: at,
    });
    tickets.push(ticket);
    say(ticket.id, at, client, "L'annonce indique 1 200 W mais la fiche technique du fabricant parle de 900 W.");
  }

  // 5. Une question traitée, encore ouverte au recours quelques jours.
  {
    const at = ago(5);
    const answered = ago(4.8);
    const ticket = blankTicket({
      id: "sup-5",
      number: number(),
      type: "general_question",
      reason: "account",
      subject: "Changer mon adresse par défaut",
      status: "resolved",
      requester,
      resolution: {
        outcome: "answered",
        note: "Dans Mon compte → Adresses, « Définir par défaut » sur l'adresse voulue.",
        by: "admin",
        at: answered,
      },
      adminRespondedAt: answered,
      resolvedAt: answered,
      ...supportScheduleFor({ type: "general_question", priority: "normal" }, "resolved", new Date(answered)),
      createdAt: at,
      lastMessageAt: answered,
    });
    tickets.push(ticket);
    say(ticket.id, at, client, "Comment changer l'adresse utilisée par défaut pour mes livraisons ?");
    say(ticket.id, answered, { userId: null, party: "admin", name: PLATFORM_NAME }, "Question traitée — Dans Mon compte → Adresses, « Définir par défaut » sur l'adresse voulue.", "decision");
  }

  return { tickets, messages, seq };
};
