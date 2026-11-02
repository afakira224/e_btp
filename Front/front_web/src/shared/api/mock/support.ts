import type { User } from "../../../entities/user";
import {
  PROPOSAL_KINDS,
  SANCTION_LABELS,
  SANCTION_TARGETS,
  SUSPENSION_DAYS,
  SUPPORT_REASONS,
  SUPPORT_TYPE_LABELS,
  type Sanction,
  type SanctionTargetKind,
  type SanctionType,
  type SupportAction,
  type SupportDossier,
  type SupportMessage,
  type SupportOutcome,
  type SupportParty,
  type SupportTicket,
  type SupportTicketStatus,
  type SupportTicketType,
} from "../../../entities/support";
import { ApiError } from "../ApiError";
import type { ApiResponse } from "../httpClient";
import { allShops, findLiveOffer } from "./liveCatalog";
import { writeDb, type MockDb } from "./mockDb";
import { applyAction, freshDb, sessionUser } from "./shopOrders";
import { PLATFORM_NAME, type MockSanction, type MockSupportMessage, type MockSupportTicket } from "./supportSeed";
import {
  AUTO_HIDE,
  autoStepFor,
  availableSupportActions,
  checkMessage,
  checkSupportAction,
  containsContact,
  initialStatus,
  isReport,
  OPENABLE_TYPES,
  ORDER_PROBLEM_WINDOW_MS,
  OUTCOME_LABELS,
  priorityFor,
  reasonLabel,
  REPORT_ABUSE,
  SHOP_PARTY_TYPES,
  shopIsParty,
  statusAfterMessage,
  statusLabelFor,
  suggestSanction,
  SUPPORT_ACTIONS,
  supportScheduleFor,
  type SupportRuleInput,
} from "./supportRules";
import { nextSupportNumber } from "./supportReturns";

// ─────────────────────────────────────────────
//  Support — routes simulées.
//
//   POST  /support/tickets · POST /support/contact
//   GET   /support/tickets?scope=&boutiqueId=&tab=&type=&search=&page=&limit=
//   GET   /support/tickets/:id · POST /support/tickets/:id/messages
//   PATCH /support/tickets/:id/:action
//   POST  /sanctions · GET /sanctions · GET /sanctions/mine
//   PATCH /sanctions/:id/lift · PATCH /sanctions/:id/request-lift
//
//  Mêmes contrôles, effets et messages que Back/src/controllers/{support,
//  sanction}.controller.ts et leurs services. Les délais (escalade, rappels,
//  fermetures) s'appliquent à chaque lecture, à la date de leur échéance.
// ─────────────────────────────────────────────

const ok = <T>(data: T, message: string, statusCode = 200): ApiResponse<T> => ({ success: true, message, statusCode, data });

const S = { shop: "awaiting_shop", requester: "awaiting_requester", admin: "awaiting_admin", resolved: "resolved", closed: "closed" } as const;
const OPEN: readonly SupportTicketStatus[] = [S.shop, S.requester, S.admin];
const DONE: readonly SupportTicketStatus[] = [S.resolved, S.closed];
const CONTACT_WARNING =
  "Votre message contient un numéro ou une adresse : ne payez jamais en dehors de la plateforme, vous ne seriez pas protégé.";
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ── Corps : JSON ou multipart, lu comme multer le rend ──
const readBody = (body: unknown): { fields: Record<string, unknown>; files: File[] } => {
  if (body instanceof FormData) {
    const fields: Record<string, unknown> = {};
    const files: File[] = [];
    body.forEach((value, key) => {
      if (typeof value !== "string") {
        if (key === "attachments") files.push(value);
        return;
      }
      fields[key] = value;
    });
    return { fields, files };
  }
  return { fields: (body ?? {}) as Record<string, unknown>, files: [] };
};

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

/** URL d'objet : comme les photos d'offres, les pièces jointes ne survivent pas à un rechargement. */
const toAttachments = (files: File[]) => {
  if (files.length > 5) throw new ApiError("5 pièces jointes au plus.", 400);
  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new ApiError(`Pièce jointe non autorisée : ${file.type || file.name}. Photos (JPEG, PNG, WebP) ou PDF.`, 400);
    }
    if (file.size > 5 * 1024 * 1024) throw new ApiError(`Le fichier "${file.name}" dépasse la taille maximale autorisée (5MB)`, 400);
  }
  return files.map((file) => ({ url: URL.createObjectURL(file), name: file.name, mimetype: file.type, size: file.size }));
};

const text = (value: unknown) => (typeof value === "string" ? value : undefined);

// ── Qui est qui ─────────────────────────────
const manages = (user: User, shopId: string | null) =>
  !!shopId && user.role === "shop" && allShops().find((shop) => shop.id === shopId)?.ownerId === user._id;

export const parties = (user: User | null, ticket: MockSupportTicket): SupportParty[] => {
  if (!user) return [];
  const list: SupportParty[] = [];
  if (user.role === "admin") list.push("admin");
  if (ticket.requester.userId === user._id || manages(user, ticket.requesterShopId)) list.push("requester");
  if (shopIsParty(ticket.type) && manages(user, ticket.boutiqueId)) list.push("shop");
  return list;
};

const viewerOf = (list: readonly SupportParty[]): SupportParty | null =>
  list.includes("admin") ? "admin" : list.includes("shop") ? "shop" : list.includes("requester") ? "requester" : null;

const WAITING: Partial<Record<SupportTicketStatus, SupportParty>> = {
  awaiting_shop: "shop",
  awaiting_requester: "requester",
  awaiting_admin: "admin",
};

const toMessage = (message: MockSupportMessage): SupportMessage => ({
  id: message.id,
  author: { party: message.author.party, name: message.author.name },
  visibility: message.visibility,
  kind: message.kind,
  body: message.body,
  attachments: message.attachments,
  containsContact: message.containsContact,
  createdAt: message.createdAt,
});

export const toTicket = (
  db: MockDb,
  ticket: MockSupportTicket,
  viewer: SupportParty,
  list: readonly SupportParty[],
  withMessages = false
): SupportTicket => {
  const admin = viewer === "admin";
  return {
    id: ticket.id,
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
    target: ticket.target,
    boutiqueId: ticket.boutiqueId,
    requesterShopId: ticket.requesterShopId,
    orderId: ticket.orderId,
    escalatedAt: ticket.escalatedAt,
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
    ...(admin ? { assigneeId: ticket.assignee } : {}),
    deadlineAt: ticket.deadlineAt,
    availableActions: availableSupportActions(list, ticket, new Date()),
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    lastMessageAt: ticket.lastMessageAt,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    ...(withMessages
      ? {
          messages: db.supportMessages
            .filter((message) => message.ticketId === ticket.id && (admin || message.visibility === "public"))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .map(toMessage),
        }
      : {}),
  };
};

const toSanction = (sanction: MockSanction, now = new Date()): Sanction => ({
  id: sanction.id,
  type: sanction.type,
  target: sanction.target,
  reason: sanction.reason,
  ticketId: sanction.ticketId,
  startsAt: sanction.startsAt,
  endsAt: sanction.endsAt,
  provisional: sanction.provisional,
  state: sanction.liftedAt
    ? "lifted"
    : sanction.type === "suspension" && sanction.endsAt && new Date(sanction.endsAt) <= now
      ? "ended"
      : "active",
  liftRequestedAt: sanction.liftRequestedAt,
  liftedAt: sanction.liftedAt,
  liftReason: sanction.liftReason,
  createdAt: sanction.createdAt,
});

// ── Délais ──────────────────────────────────
const reschedule = (ticket: MockSupportTicket, status: SupportTicketStatus, now: Date) => {
  if (ticket.status === status) return;
  ticket.status = status;
  Object.assign(ticket, supportScheduleFor(ticket, status, now));
};

const event = (db: MockDb, ticketId: string, at: string, body: string, party: SupportParty = "system", name = PLATFORM_NAME, kind: MockSupportMessage["kind"] = "event", userId: string | null = null) =>
  db.supportMessages.push({ id: uid("msg"), ticketId, author: { userId, party, name }, visibility: "public", kind, body, attachments: [], containsContact: false, createdAt: at });

/** Ce que le planificateur du back fait toutes les 15 minutes, à la date de chaque échéance. */
export const runSupportDeadlines = (db: MockDb, now = new Date()): boolean => {
  let changed = false;
  for (const ticket of db.supportTickets) {
    if (ticket.reminderAt && new Date(ticket.reminderAt) <= now) {
      ticket.reminderAt = null;
      changed = true;
    }
    if (!ticket.deadlineAt || new Date(ticket.deadlineAt) > now) continue;
    const due = new Date(ticket.deadlineAt);
    const at = due.toISOString();
    switch (autoStepFor(ticket)) {
      case "escalate":
        ticket.escalatedAt = at;
        reschedule(ticket, S.admin, due);
        event(db, ticket.id, at, "La boutique n'a pas répondu sous 48 heures : l'administration reprend la demande.");
        break;
      case "back_to_admin":
        reschedule(ticket, S.admin, due);
        event(db, ticket.id, at, "Pas de réponse dans les délais : la demande revient à l'administration.");
        break;
      case "close_expired":
        ticket.resolution = { outcome: "expired", by: "system", at };
        ticket.closedAt = at;
        reschedule(ticket, S.closed, due);
        event(db, ticket.id, at, "Sans réponse du demandeur sous 7 jours, la demande est fermée. Elle peut être rouverte pendant 14 jours.");
        break;
      case "close_final":
        ticket.closedAt = at;
        reschedule(ticket, S.closed, due);
        break;
      default:
        // L'administration en retard reçoit une alerte : rien ne change ici.
        ticket.deadlineAt = null;
    }
    ticket.updatedAt = at;
    changed = true;
  }
  return changed;
};

const supportDb = (): MockDb => {
  const db = freshDb();
  if (runSupportDeadlines(db)) writeDb(db);
  return db;
};

const findTicket = (db: MockDb, id: string) => {
  const ticket = db.supportTickets.find((candidate) => candidate.id === id);
  if (!ticket) throw new ApiError("Demande introuvable.", 404);
  return ticket;
};

// ── Ouvrir une demande ──────────────────────
const OPEN_PART_STATUSES = ["pending", "confirmed", "shipped", "ready_for_pickup", "delivery_failed"];

const resolveTarget = (db: MockDb, user: User, type: SupportTicketType, targetId: string | undefined, shopId: string | undefined, now: Date) => {
  const none = { target: null, boutiqueId: null, requesterShopId: null, orderId: null } as {
    target: MockSupportTicket["target"];
    boutiqueId: string | null;
    requesterShopId: string | null;
    orderId: string | null;
  };
  const need = () => {
    if (!targetId) throw new ApiError("Précisez ce que vous signalez.", 400);
    return targetId;
  };
  switch (type) {
    case "order_problem": {
      const part = db.shopOrders.find((candidate) => candidate.id === need());
      if (!part) throw new ApiError("Commande introuvable.", 404);
      if (part.userId !== user._id) throw new ApiError("Vous ne pouvez signaler un problème que sur vos commandes.", 403);
      if (part.status === "awaiting_payment") throw new ApiError("Cette commande attend son paiement : rien n'est encore parti chez la boutique.", 400);
      const delivered = [...part.statusHistory].reverse().find((step) => step.status === "delivered")?.changedAt;
      const since = delivered ?? (OPEN_PART_STATUSES.includes(part.status) ? null : part.updatedAt);
      if (since && now.getTime() - new Date(since).getTime() > ORDER_PROBLEM_WINDOW_MS) {
        throw new ApiError("Plus de 30 jours ont passé : posez plutôt une question à l'équipe de la plateforme.", 400);
      }
      const open = db.supportTickets.find((ticket) => ticket.type === "order_problem" && ticket.target?.id === part.id && OPEN.includes(ticket.status));
      if (open) throw new ApiError(`Une demande est déjà ouverte pour cette commande (${open.number}).`, 409);
      return { target: { kind: "shop_order", id: part.id, label: part.reference }, boutiqueId: part.boutiqueId, requesterShopId: null, orderId: part.orderId };
    }
    case "listing_report": {
      const offer = findLiveOffer(need());
      if (!offer) throw new ApiError("Annonce introuvable.", 404);
      if (manages(user, offer.boutique?.id ?? null)) throw new ApiError("Vous ne pouvez pas signaler votre propre annonce.", 400);
      return {
        target: { kind: "offer", id: offer.id, label: `${offer.product?.name ?? "Annonce"} — ${offer.boutique?.nom ?? "boutique"}` },
        boutiqueId: offer.boutique?.id ?? null,
        requesterShopId: null,
        orderId: null,
      };
    }
    case "shop_report": {
      const shop = allShops().find((candidate) => candidate.id === need());
      if (!shop) throw new ApiError("Boutique introuvable.", 404);
      if (manages(user, shop.id)) throw new ApiError("Vous ne pouvez pas signaler votre propre boutique.", 400);
      return { target: { kind: "shop", id: shop.id, label: shop.nom }, boutiqueId: shop.id, requesterShopId: null, orderId: null };
    }
    case "customer_report": {
      if (user.role !== "shop" && user.role !== "admin") throw new ApiError("Seule une boutique signale un client.", 403);
      const part = db.shopOrders.find((candidate) => candidate.id === need());
      if (!part) throw new ApiError("Commande introuvable.", 404);
      if (user.role !== "admin" && !manages(user, part.boutiqueId)) throw new ApiError("Vous ne pouvez signaler que les clients de vos commandes.", 403);
      const name = `${part.customer.prenom} ${part.customer.nom}`.trim() || "Client";
      return { target: { kind: "user", id: part.userId, label: `${name} (commande ${part.reference})` }, boutiqueId: null, requesterShopId: part.boutiqueId, orderId: part.orderId };
    }
    case "sanction_appeal": {
      const sanction = db.sanctions.find((candidate) => candidate.id === need());
      if (!sanction) throw new ApiError("Mesure introuvable.", 404);
      if (sanction.notifiedUserId !== user._id) throw new ApiError("Vous ne pouvez contester qu'une mesure qui vous vise.", 403);
      if (sanction.liftedAt) throw new ApiError("Cette mesure est déjà levée.", 400);
      const open = db.supportTickets.find((ticket) => ticket.type === "sanction_appeal" && ticket.target?.id === sanction.id && OPEN.includes(ticket.status));
      if (open) throw new ApiError(`Une contestation est déjà ouverte (${open.number}).`, 409);
      const shop =
        sanction.target.kind === "shop" ? sanction.target.id : sanction.target.kind === "offer" ? (findLiveOffer(sanction.target.id)?.boutique?.id ?? null) : null;
      return { target: { kind: "sanction", id: sanction.id, label: `${SANCTION_LABELS[sanction.type]} — ${sanction.target.label}` }, boutiqueId: null, requesterShopId: shop, orderId: null };
    }
    case "general_question": {
      if (!shopId) return none;
      if (!manages(user, shopId) && user.role !== "admin") throw new ApiError("Vous ne pouvez écrire qu'au nom de vos boutiques.", 403);
      return { ...none, requesterShopId: shopId };
    }
    default:
      throw new ApiError("Ce type de demande ne s'ouvre pas ici.", 400);
  }
};

const newTicket = (
  db: MockDb,
  input: {
    type: SupportTicketType;
    reason: string;
    description: string;
    subject?: string | undefined;
    requester: MockSupportTicket["requester"];
    resolved: ReturnType<typeof resolveTarget>;
    abusive: boolean;
    attachments: MockSupportMessage["attachments"];
  },
  now: Date
) => {
  const stamp = now.toISOString();
  const status = initialStatus(input.type);
  const priority = priorityFor(input.reason, input.abusive);
  const ticket: MockSupportTicket = {
    id: uid("sup"),
    number: nextSupportNumber(db),
    type: input.type,
    reason: input.reason,
    subject: (input.subject?.trim() || `${reasonLabel(input.type, input.reason)}${input.resolved.target ? ` — ${input.resolved.target.label}` : ""}`).slice(0, 120),
    status,
    priority,
    requester: input.requester,
    ...input.resolved,
    assignee: null,
    escalatedAt: null,
    shopRespondedAt: null,
    adminRespondedAt: null,
    ...supportScheduleFor({ type: input.type, priority }, status, now),
    proposal: null,
    resolution: null,
    appeal: null,
    resolvedAt: null,
    closedAt: null,
    reopenedAt: null,
    satisfaction: null,
    lastMessageAt: stamp,
    createdAt: stamp,
    updatedAt: stamp,
  };
  db.supportTickets.push(ticket);
  const flagged = containsContact(input.description);
  db.supportMessages.push({
    id: uid("msg"),
    ticketId: ticket.id,
    author: { userId: input.requester.userId, party: "requester", name: input.requester.name },
    visibility: "public",
    kind: "message",
    body: input.description.trim(),
    attachments: input.attachments,
    containsContact: flagged,
    createdAt: stamp,
  });
  return { ticket, flagged };
};

export const createTicket = (body: unknown) => {
  const user = sessionUser();
  const { fields, files } = readBody(body);
  const type = text(fields.type) as SupportTicketType | undefined;
  const reason = text(fields.reason)?.trim() ?? "";
  const description = text(fields.description)?.trim() ?? "";
  const errors: string[] = [];
  if (!type || !OPENABLE_TYPES.includes(type)) errors.push(`Type invalide. Valeurs acceptées : ${OPENABLE_TYPES.join(", ")}.`);
  if (!reason) errors.push("Le motif est requis.");
  if (description.length < 10 || description.length > 2000) errors.push("Décrivez la situation : 10 à 2 000 caractères.");
  if ((text(fields.subject) ?? "").length > 120) errors.push("Objet limité à 120 caractères.");
  if (errors.length > 0) throw new ApiError(errors.join(" | "), 422);
  if (!Object.hasOwn(SUPPORT_REASONS[type!] ?? {}, reason)) {
    throw new ApiError(`Motif invalide. Valeurs acceptées : ${Object.keys(SUPPORT_REASONS[type!] ?? {}).join(", ")}.`, 400);
  }
  if (reason === "other" && description.length < 20) throw new ApiError("Décrivez le problème en quelques phrases (20 caractères au moins).", 400);

  const db = supportDb();
  const now = new Date();
  const resolved = resolveTarget(db, user, type!, text(fields.targetId), text(fields.shopId), now);
  if (resolved.target && isReport(type!)) {
    const twice = db.supportTickets.find(
      (ticket) => ticket.requester.userId === user._id && ticket.target?.id === resolved.target!.id && OPEN.includes(ticket.status)
    );
    if (twice) throw new ApiError(`Vous avez déjà signalé ceci (${twice.number}) : l'équipe l'examine.`, 409);
  }
  const abusive =
    isReport(type!) &&
    db.supportTickets.filter(
      (ticket) =>
        ticket.requester.userId === user._id &&
        isReport(ticket.type) &&
        ticket.resolution?.outcome === "rejected" &&
        ticket.resolvedAt &&
        now.getTime() - new Date(ticket.resolvedAt).getTime() <= REPORT_ABUSE.windowMs
    ).length >= REPORT_ABUSE.rejected;

  const { ticket, flagged } = newTicket(
    db,
    {
      type: type!,
      reason,
      description,
      subject: text(fields.subject),
      requester: { userId: user._id, accountType: user.role, name: `${user.prenom} ${user.nom}`.trim(), email: user.email },
      resolved,
      abusive,
      attachments: toAttachments(files),
    },
    now
  );
  maybeAutoHide(db, ticket, now);
  writeDb(db);
  const list = parties(user, ticket);
  return ok({ ...toTicket(db, ticket, viewerOf(list) ?? "requester", list), ...(flagged ? { warning: CONTACT_WARNING } : {}) }, `Demande ${ticket.number} enregistrée.`, 201);
};

export const contact = (body: Record<string, unknown> = {}) => {
  const name = text(body.name)?.trim() ?? "";
  const email = text(body.email)?.trim() ?? "";
  const message = text(body.message)?.trim() ?? "";
  const errors: string[] = [];
  if (name.length < 2 || name.length > 80) errors.push("Votre nom : 2 à 80 caractères.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Email invalide.");
  if (message.length < 10 || message.length > 2000) errors.push("Votre message : 10 à 2 000 caractères.");
  if (errors.length > 0) throw new ApiError(errors.join(" | "), 422);
  const db = supportDb();
  const { ticket } = newTicket(
    db,
    {
      type: "general_question",
      reason: text(body.reason) ?? "usage",
      description: message,
      subject: text(body.subject),
      requester: { userId: null, accountType: "guest", name, email },
      resolved: { target: null, boutiqueId: null, requesterShopId: null, orderId: null },
      abusive: false,
      attachments: [],
    },
    new Date()
  );
  writeDb(db);
  return ok({ number: ticket.number }, `Message reçu (${ticket.number}) : l'équipe vous répond par email sous 24 heures.`, 201);
};

// ── Lire ────────────────────────────────────
type Predicate = (ticket: MockSupportTicket) => boolean;

const tabsFor = (scope: string, shopId: string | null): Record<string, Predicate> => {
  if (scope === "admin") {
    return {
      urgent: (t) => t.priority === "urgent" && OPEN.includes(t.status),
      todo: (t) => t.status === S.admin,
      reports: (t) => isReport(t.type) && OPEN.includes(t.status),
      waiting: (t) => t.status === S.shop || t.status === S.requester,
      done: (t) => DONE.includes(t.status),
    };
  }
  if (scope === "shop") {
    const party = (t: MockSupportTicket) => t.boutiqueId === shopId && SHOP_PARTY_TYPES.includes(t.type);
    const own = (t: MockSupportTicket) => t.requesterShopId === shopId;
    return {
      todo: (t) => (party(t) && t.status === S.shop) || (own(t) && t.status === S.requester),
      waiting: (t) => (party(t) && t.status === S.requester) || (own(t) && t.status === S.shop),
      admin: (t) => t.status === S.admin,
      done: (t) => DONE.includes(t.status),
    };
  }
  return { open: (t) => OPEN.includes(t.status), done: (t) => DONE.includes(t.status) };
};

export const listTickets = (params: URLSearchParams) => {
  const user = sessionUser();
  const scope = params.get("scope") ?? "mine";
  const shopId = params.get("boutiqueId");
  const tab = params.get("tab");
  const type = params.get("type");
  const search = params.get("search")?.trim().toLowerCase() ?? "";

  let base: Predicate = (t) => t.requester.userId === user._id;
  if (scope === "admin") {
    if (user.role !== "admin") throw new ApiError("Accès refusé, vous n'avez pas les permissions nécessaires", 403);
    base = () => true;
  } else if (scope === "shop") {
    if (!shopId) throw new ApiError("Précisez la boutique dont vous lisez les demandes.", 400);
    if (!allShops().some((shop) => shop.id === shopId)) throw new ApiError("Boutique introuvable.", 404);
    if (user.role !== "admin" && !manages(user, shopId)) throw new ApiError("Vous ne pouvez gérer que vos propres boutiques.", 403);
    base = (t) => (t.boutiqueId === shopId && SHOP_PARTY_TYPES.includes(t.type)) || t.requesterShopId === shopId;
  }

  const db = supportDb();
  const tabs = tabsFor(scope, shopId);
  const inScope = db.supportTickets.filter(base);
  const queue = scope === "admin" && (tab === "todo" || tab === "urgent" || tab === "reports");
  const filtered = inScope
    .filter((t) => !tab || !tabs[tab] || tabs[tab]!(t))
    .filter((t) => !type || t.type === type)
    .filter((t) => !search || [t.number, t.subject, t.target?.label ?? ""].some((value) => value.toLowerCase().includes(search)))
    .sort((a, b) => (queue ? a.createdAt.localeCompare(b.createdAt) : b.updatedAt.localeCompare(a.updatedAt)));
  const counts = Object.fromEntries(Object.entries(tabs).map(([key, predicate]) => [key, inScope.filter(predicate).length]));

  const page = Math.max(1, Number(params.get("page") ?? 1));
  const limit = Math.max(1, Math.min(100, Number(params.get("limit") ?? 20)));
  const fallback: SupportParty = scope === "admin" ? "admin" : scope === "shop" ? "shop" : "requester";
  return ok(
    {
      tickets: filtered.slice((page - 1) * limit, page * limit).map((ticket) => {
        const list = scope === "admin" ? (["admin"] as SupportParty[]) : parties(user, ticket);
        return toTicket(db, ticket, viewerOf(list) ?? fallback, list);
      }),
      total: filtered.length,
      page,
      totalPages: Math.ceil(filtered.length / limit),
      counts,
    },
    "Demandes récupérées avec succès"
  );
};

const SANCTION_KIND: Record<string, SanctionTargetKind | undefined> = { offer: "offer", review: "review", shop: "shop", user: "user" };

const dossierOf = (db: MockDb, ticket: MockSupportTicket): SupportDossier => {
  const related = db.supportTickets
    .filter((other) => other.id !== ticket.id && ((ticket.target && other.target?.id === ticket.target.id) || (ticket.boutiqueId && other.boutiqueId === ticket.boutiqueId)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
  const kind = ticket.target ? SANCTION_KIND[ticket.target.kind] : undefined;
  const sanctions = db.sanctions
    .filter(
      (sanction) =>
        (kind && ticket.target && sanction.target.kind === kind && sanction.target.id === ticket.target.id) ||
        (ticket.boutiqueId && sanction.target.kind === "shop" && sanction.target.id === ticket.boutiqueId)
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const now = new Date();
  return {
    tickets: related.map((other) => ({
      id: other.id,
      number: other.number,
      type: other.type,
      reason: other.reason,
      status: other.status,
      outcome: other.resolution?.outcome ?? null,
      createdAt: other.createdAt,
    })),
    sanctions: sanctions.map((sanction) => toSanction(sanction, now)),
    suggestion: {
      ...(ticket.boutiqueId ? { shop: suggestSanction("shop", sanctions.filter((s) => s.target.kind === "shop"), now) } : {}),
      ...(ticket.target?.kind === "user" ? { user: suggestSanction("user", sanctions.filter((s) => s.target.kind === "user"), now) } : {}),
    },
  };
};

export const getTicket = (id: string) => {
  const user = sessionUser();
  const db = supportDb();
  const ticket = findTicket(db, id);
  const list = parties(user, ticket);
  const viewer = viewerOf(list);
  if (!viewer) throw new ApiError("Vous ne participez pas à cette demande.", 403);
  const dto = toTicket(db, ticket, viewer, list, true);
  return ok(viewer === "admin" ? { ...dto, dossier: dossierOf(db, ticket) } : dto, "Demande récupérée avec succès");
};

// ── Écrire ──────────────────────────────────
const nameOf = (party: SupportParty, ticket: MockSupportTicket) =>
  party === "admin" || party === "system"
    ? PLATFORM_NAME
    : party === "shop"
      ? (allShops().find((shop) => shop.id === ticket.boutiqueId)?.nom ?? "Boutique")
      : ticket.requester.name;

export const postMessage = (id: string, body: unknown) => {
  const user = sessionUser();
  const { fields, files } = readBody(body);
  const content = text(fields.body)?.trim() ?? "";
  if (content.length < 1 || content.length > 2000) throw new ApiError("Message : 1 à 2 000 caractères.", 422);
  const internal = fields.internal === true || fields.internal === "true";
  const waitFor = (text(fields.waitFor) || undefined) as SupportParty | undefined;

  const db = supportDb();
  const ticket = findTicket(db, id);
  const list = parties(user, ticket);
  const refusal = checkMessage(list, ticket, internal);
  if (refusal) throw new ApiError(refusal, list.length === 0 ? 403 : 400);

  const now = new Date();
  const stamp = now.toISOString();
  const author = viewerOf(list) ?? "requester";
  const flagged = containsContact(content);
  db.supportMessages.push({
    id: uid("msg"),
    ticketId: ticket.id,
    author: { userId: user._id, party: author, name: nameOf(author, ticket) },
    visibility: internal ? "internal" : "public",
    kind: "message",
    body: content,
    attachments: toAttachments(files),
    containsContact: flagged,
    createdAt: stamp,
  });
  if (!internal) {
    if (author === "shop" && !ticket.shopRespondedAt) ticket.shopRespondedAt = stamp;
    if (author === "admin" && !ticket.adminRespondedAt) ticket.adminRespondedAt = stamp;
    reschedule(ticket, statusAfterMessage(ticket, author, waitFor), now);
    ticket.lastMessageAt = stamp;
  }
  ticket.updatedAt = stamp;
  writeDb(db);
  return ok({ ...toTicket(db, ticket, author, list, true), ...(flagged ? { warning: CONTACT_WARNING } : {}) }, "Message envoyé.");
};

// ── Agir ────────────────────────────────────
export const performAction = (id: string, actionName: string, body: Record<string, unknown> = {}) => {
  const user = sessionUser();
  if (!(SUPPORT_ACTIONS as string[]).includes(actionName)) {
    throw new ApiError(`Action inconnue. Valeurs acceptées : ${SUPPORT_ACTIONS.join(", ")}.`, 422);
  }
  const action = actionName as SupportAction;
  const input: SupportRuleInput = {
    kind: text(body.kind),
    details: text(body.details),
    outcome: text(body.outcome),
    note: text(body.note),
    reason: text(body.reason),
    rating: typeof body.rating === "number" ? body.rating : body.rating ? Number(body.rating) : undefined,
    comment: text(body.comment),
    assignee: text(body.assignee),
  };

  const db = supportDb();
  const ticket = findTicket(db, id);
  const list = parties(user, ticket);
  if (list.length === 0) throw new ApiError("Vous ne participez pas à cette demande.", 403);
  const now = new Date();
  const refusal = checkSupportAction(action, list, ticket, input, now);
  if (refusal) throw new ApiError(refusal, 400);

  const stamp = now.toISOString();
  const actor: SupportParty = action === "resolve" || action === "assign" ? "admin" : (viewerOf(list) ?? "requester");
  const say = (message: string, kind: MockSupportMessage["kind"] = "event", party: SupportParty = actor) =>
    event(db, ticket.id, stamp, message, party, nameOf(party, ticket), kind, user._id);
  let liftProvisional: string | null = null;
  let confirmProvisional: string | null = null;

  switch (action) {
    case "propose": {
      const kind = input.kind as keyof typeof PROPOSAL_KINDS;
      ticket.proposal = { kind, details: input.details!.trim(), status: "pending", at: stamp, by: user._id };
      if (!ticket.shopRespondedAt) ticket.shopRespondedAt = stamp;
      say(`${PROPOSAL_KINDS[kind]} : ${input.details!.trim()}`, "proposal", "shop");
      reschedule(ticket, S.requester, now);
      break;
    }
    case "accept":
      ticket.proposal!.status = "accepted";
      ticket.resolution = { outcome: "agreed", note: ticket.proposal!.details, by: "requester", at: stamp };
      ticket.resolvedAt = stamp;
      say("Le client accepte la solution proposée.");
      reschedule(ticket, S.resolved, now);
      break;
    case "escalate":
      if (ticket.proposal?.status === "pending") ticket.proposal.status = "declined";
      ticket.escalatedAt = stamp;
      say(input.reason?.trim() ? `Arbitrage demandé : ${input.reason.trim()}` : "Arbitrage demandé : l'administration reprend la demande.");
      reschedule(ticket, S.admin, now);
      break;
    case "resolve": {
      const outcome = input.outcome as SupportOutcome;
      ticket.resolution = { outcome, note: input.note!.trim(), by: "admin", decidedBy: user._id, at: stamp };
      ticket.resolvedAt = stamp;
      if (!ticket.adminRespondedAt) ticket.adminRespondedAt = stamp;
      say(`${OUTCOME_LABELS[outcome]} — ${input.note!.trim()}`, "decision", "admin");
      if (ticket.appeal) {
        reschedule(ticket, S.closed, now);
        ticket.closedAt = stamp;
      } else {
        reschedule(ticket, S.resolved, now);
      }
      if (ticket.type === "listing_report" && ticket.target) {
        if (outcome === "rejected") liftProvisional = ticket.target.id;
        if (outcome === "upheld") confirmProvisional = ticket.target.id;
      }
      break;
    }
    case "appeal":
      ticket.appeal = { by: actor, userId: user._id, reason: input.reason!.trim(), at: stamp };
      ticket.assignee = null;
      say(`Recours : ${input.reason!.trim()}`);
      reschedule(ticket, S.admin, now);
      break;
    case "close":
      if (!ticket.resolution) {
        ticket.resolution =
          actor === "admin"
            ? { outcome: "rejected", note: input.note?.trim() || "Classée par l'administration.", by: "admin", decidedBy: user._id, at: stamp }
            : { outcome: "withdrawn", note: input.note?.trim(), by: "requester", at: stamp };
      }
      ticket.closedAt = stamp;
      say(actor === "admin" ? `Demande classée${input.note?.trim() ? ` : ${input.note.trim()}` : "."}` : "Le demandeur ferme sa demande.");
      reschedule(ticket, S.closed, now);
      break;
    case "reopen":
      ticket.reopenedAt = stamp;
      ticket.closedAt = null;
      ticket.resolvedAt = null;
      ticket.resolution = null;
      say(`Demande rouverte : ${input.reason!.trim()}`);
      reschedule(ticket, ticket.escalatedAt || !shopIsParty(ticket.type) ? S.admin : S.shop, now);
      break;
    case "assign":
      ticket.assignee = input.assignee ?? user._id;
      break;
    case "rate":
      ticket.satisfaction = { rating: input.rating!, comment: input.comment?.trim() || undefined, at: stamp };
      break;
    default:
      break;
  }
  ticket.updatedAt = stamp;

  // Le masquage provisoire d'une annonce signalée suit la décision.
  const offerId = liftProvisional ?? confirmProvisional;
  const provisional = offerId ? db.sanctions.find((s) => s.target.id === offerId && s.provisional && !s.liftedAt) : undefined;
  if (provisional) {
    if (liftProvisional) liftEffects(db, provisional, user._id, "Signalements non fondés après examen.", now);
    else provisional.provisional = false;
  }
  writeDb(db);
  return ok(toTicket(db, ticket, viewerOf(list) ?? "requester", list, true), "Demande mise à jour.");
};

// ── Sanctions ───────────────────────────────
const DAY = 24 * 3600 * 1000;
const FAR_FUTURE = "9999-12-31T00:00:00.000Z";

const targetOf = (db: MockDb, kind: SanctionTargetKind, id: string): { label: string; notify: string | null } => {
  switch (kind) {
    case "offer": {
      const offer = findLiveOffer(id);
      if (!offer) throw new ApiError("Annonce introuvable.", 404);
      return { label: `${offer.product?.name ?? "Annonce"} — ${offer.boutique?.nom ?? "boutique"}`, notify: offer.boutique?.ownerId ?? null };
    }
    case "shop": {
      const shop = allShops().find((candidate) => candidate.id === id);
      if (!shop) throw new ApiError("Boutique introuvable.", 404);
      return { label: shop.nom, notify: shop.ownerId };
    }
    case "user": {
      const user = db.users.find((candidate) => candidate._id === id);
      if (!user) throw new ApiError("Compte introuvable.", 404);
      return { label: `${user.prenom} ${user.nom}`.trim(), notify: user._id };
    }
    default:
      throw new ApiError("Les avis ne sont pas encore simulés.", 400);
  }
};

const applySanctionEffects = (db: MockDb, input: { type: SanctionType; kind: SanctionTargetKind; id: string; reason: string; days?: number | undefined; ticketId?: string | undefined; createdBy: string | null; provisional?: boolean }, now: Date): MockSanction => {
  if (!SANCTION_TARGETS[input.type]?.includes(input.kind)) throw new ApiError(`${SANCTION_LABELS[input.type]} ne vise pas cette cible.`, 400);
  if (!input.reason.trim()) throw new ApiError("Le motif est requis : la personne visée le lira.", 400);
  if (input.type === "suspension" && !(SUSPENSION_DAYS as readonly number[]).includes(input.days ?? 0)) {
    throw new ApiError(`Durée de suspension invalide. Valeurs acceptées : ${SUSPENSION_DAYS.join(", ")} jours.`, 400);
  }
  const stamp = now.toISOString();
  const target = targetOf(db, input.kind, input.id);
  const suspendedShopIds: string[] = [];
  let endsAt: string | null = null;

  switch (input.type) {
    case "hide":
      if (db.moderation.hiddenOffers[input.id]) throw new ApiError("Cette annonce est déjà masquée.", 409);
      db.moderation.hiddenOffers[input.id] = { at: stamp, reason: input.reason.trim() };
      break;
    case "suspension": {
      endsAt = new Date(now.getTime() + (input.days ?? 7) * DAY).toISOString();
      const current = db.moderation.suspendedShops[input.id];
      if (!current || current < endsAt) db.moderation.suspendedShops[input.id] = endsAt;
      break;
    }
    case "block": {
      if (db.moderation.blockedUsers[input.id]) throw new ApiError("Ce compte est déjà bloqué.", 409);
      db.moderation.blockedUsers[input.id] = stamp;
      for (const shop of allShops().filter((candidate) => candidate.ownerId === input.id)) {
        if (db.moderation.suspendedShops[shop.id] === FAR_FUTURE) continue;
        db.moderation.suspendedShops[shop.id] = FAR_FUTURE;
        suspendedShopIds.push(shop.id);
      }
      // Sessions fermées : le compte bloqué perd la sienne s'il est connecté ici.
      if (db.sessionUserId === input.id) db.sessionUserId = null;
      // Commandes non expédiées annulées et remboursées.
      const unshipped = ["pending", "confirmed", "ready_for_pickup"];
      for (const part of db.shopOrders) {
        const concerned = part.userId === input.id || suspendedShopIds.includes(part.boutiqueId);
        if (!concerned || !unshipped.includes(part.status)) continue;
        try {
          applyAction(db, part, "admin-cancel", ["admin"], { note: "Compte bloqué par la modération." }, now);
        } catch {
          // Une sous-commande qui ne s'annule plus reste en l'état.
        }
      }
      break;
    }
    default:
      break;
  }

  const sanction: MockSanction = {
    id: uid("sanction"),
    type: input.type,
    target: { kind: input.kind, id: input.id, label: target.label },
    notifiedUserId: target.notify,
    reason: input.reason.trim(),
    ticketId: input.ticketId ?? null,
    startsAt: stamp,
    endsAt,
    provisional: input.provisional ?? false,
    createdBy: input.createdBy,
    liftRequestedAt: null,
    liftedAt: null,
    liftedBy: null,
    liftReason: null,
    suspendedShopIds,
    createdAt: stamp,
    updatedAt: stamp,
  };
  db.sanctions.push(sanction);
  return sanction;
};

/**
 * Comme remainingSuspension du back : ce qui suspend encore la boutique une
 * fois `excluded` levée — le blocage du gérant, sinon la plus lointaine des
 * suspensions en cours, sinon rien.
 */
const remainingSuspension = (db: MockDb, shopId: string, excluded: MockSanction, now: Date): string | null => {
  const others = db.sanctions.filter((other) => other !== excluded && !other.liftedAt);
  if (others.some((other) => other.type === "block" && other.suspendedShopIds.includes(shopId))) return FAR_FUTURE;
  const ends = others
    .filter((other) => other.type === "suspension" && other.target.kind === "shop" && other.target.id === shopId && other.endsAt && new Date(other.endsAt) > now)
    .map((other) => other.endsAt!)
    .sort();
  return ends.at(-1) ?? null;
};

const setSuspension = (db: MockDb, shopId: string, until: string | null) => {
  if (until) db.moderation.suspendedShops[shopId] = until;
  else delete db.moderation.suspendedShops[shopId];
};

const liftEffects = (db: MockDb, sanction: MockSanction, by: string | null, reason: string | undefined, now: Date) => {
  switch (sanction.type) {
    case "hide":
      delete db.moderation.hiddenOffers[sanction.target.id];
      break;
    case "suspension":
      if (db.moderation.suspendedShops[sanction.target.id]) setSuspension(db, sanction.target.id, remainingSuspension(db, sanction.target.id, sanction, now));
      break;
    case "block":
      delete db.moderation.blockedUsers[sanction.target.id];
      for (const shopId of sanction.suspendedShopIds) {
        if (db.moderation.suspendedShops[shopId] === FAR_FUTURE) setSuspension(db, shopId, remainingSuspension(db, shopId, sanction, now));
      }
      break;
    default:
      break;
  }
  sanction.liftedAt = now.toISOString();
  sanction.liftedBy = by;
  sanction.liftReason = reason?.trim() || null;
  sanction.updatedAt = sanction.liftedAt;
};

/** Masquage provisoire d'une annonce signalée par plusieurs comptes pour un motif grave. */
const maybeAutoHide = (db: MockDb, ticket: MockSupportTicket, now: Date) => {
  if (ticket.type !== "listing_report" || !AUTO_HIDE.reasons.includes(ticket.reason) || !ticket.target) return;
  if (db.moderation.hiddenOffers[ticket.target.id]) return;
  const reporters = new Set(
    db.supportTickets
      .filter(
        (other) =>
          other.type === "listing_report" &&
          other.target?.id === ticket.target!.id &&
          AUTO_HIDE.reasons.includes(other.reason) &&
          now.getTime() - new Date(other.createdAt).getTime() <= AUTO_HIDE.windowMs &&
          other.resolution?.outcome !== "rejected"
      )
      .map((other) => other.requester.userId)
      .filter(Boolean)
  );
  if (reporters.size < AUTO_HIDE.reporters) return;
  applySanctionEffects(
    db,
    {
      type: "hide",
      kind: "offer",
      id: ticket.target.id,
      reason: `Masquage provisoire : ${AUTO_HIDE.reporters} signalements pour ${reasonLabel(ticket.type, ticket.reason).toLowerCase()} en moins de 7 jours. L'administration confirme ou lève sous 24 heures.`,
      ticketId: ticket.id,
      createdBy: null,
      provisional: true,
    },
    now
  );
};

const requireAdmin = () => {
  const user = sessionUser();
  if (user.role !== "admin") throw new ApiError("Accès refusé, vous n'avez pas les permissions nécessaires", 403);
  return user;
};

export const createSanction = (body: Record<string, unknown> = {}) => {
  const user = requireAdmin();
  const type = text(body.type) as SanctionType | undefined;
  const kind = text(body.targetKind) as SanctionTargetKind | undefined;
  const targetId = text(body.targetId);
  const reason = text(body.reason)?.trim() ?? "";
  const errors: string[] = [];
  if (!type || !(type in SANCTION_LABELS)) errors.push(`Mesure invalide. Valeurs acceptées : ${Object.keys(SANCTION_LABELS).join(", ")}.`);
  if (!kind || !["offer", "review", "shop", "user"].includes(kind)) errors.push("Cible invalide.");
  if (!targetId) errors.push("Cible invalide.");
  if (reason.length < 10 || reason.length > 1000) errors.push("Motivez la mesure : 10 à 1 000 caractères.");
  if (errors.length > 0) throw new ApiError(errors.join(" | "), 422);
  const db = supportDb();
  const sanction = applySanctionEffects(
    db,
    {
      type: type!,
      kind: kind!,
      id: targetId!,
      reason,
      days: typeof body.days === "number" ? body.days : body.days ? Number(body.days) : undefined,
      ticketId: text(body.ticketId),
      createdBy: user._id,
    },
    new Date()
  );
  writeDb(db);
  return ok(toSanction(sanction), "Mesure appliquée.", 201);
};

export const listSanctions = (params: URLSearchParams) => {
  requireAdmin();
  const db = supportDb();
  const kind = params.get("targetKind");
  const id = params.get("targetId");
  const pending = params.get("pending") === "true";
  const now = new Date();
  const found = db.sanctions
    .filter((s) => (!kind || s.target.kind === kind) && (!id || s.target.id === id))
    .filter((s) => !pending || (!s.liftedAt && (s.provisional || !!s.liftRequestedAt)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);
  return ok(found.map((s) => toSanction(s, now)), "Mesures récupérées.");
};

export const mySanctions = () => {
  const user = sessionUser();
  const db = supportDb();
  const now = new Date();
  return ok(
    db.sanctions.filter((s) => s.notifiedUserId === user._id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((s) => toSanction(s, now)),
    "Mesures récupérées."
  );
};

export const liftSanction = (id: string, body: Record<string, unknown> = {}) => {
  const user = requireAdmin();
  const db = supportDb();
  const sanction = db.sanctions.find((candidate) => candidate.id === id);
  if (!sanction) throw new ApiError("Mesure introuvable.", 404);
  if (sanction.liftedAt) throw new ApiError("Cette mesure est déjà levée.", 409);
  liftEffects(db, sanction, user._id, text(body.reason), new Date());
  writeDb(db);
  return ok(toSanction(sanction), "Mesure levée.");
};

export const requestLift = (id: string) => {
  const user = sessionUser();
  const db = supportDb();
  const sanction = db.sanctions.find((candidate) => candidate.id === id);
  if (!sanction) throw new ApiError("Mesure introuvable.", 404);
  if (sanction.notifiedUserId !== user._id) throw new ApiError("Cette mesure ne vous concerne pas.", 403);
  if (sanction.type !== "hide" || sanction.target.kind !== "offer") {
    throw new ApiError("Seule une annonce masquée se remet en ligne : contestez les autres mesures.", 400);
  }
  if (sanction.liftedAt) throw new ApiError("Cette annonce est déjà remise en ligne.", 409);
  if (sanction.liftRequestedAt) throw new ApiError("Votre demande de remise en ligne est déjà transmise.", 409);
  sanction.liftRequestedAt = new Date().toISOString();
  writeDb(db);
  return ok(toSanction(sanction), "Demande de remise en ligne transmise.");
};
