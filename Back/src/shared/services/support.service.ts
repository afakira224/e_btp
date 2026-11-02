import mongoose, { Types, type ClientSession } from "mongoose";
import { Shop } from "../../models/boutique.model.js";
import { Product, productBoutique } from "../../models/product.model.js";
import { Review } from "../../models/review.model.js";
import { Sanction, SanctionTargetKind, SanctionType } from "../../models/sanction.model.js";
import { ShopOrder, ShopOrderStatus } from "../../models/shopOrder.model.js";
import {
  SupportMessage,
  SupportMessageKind,
  SupportVisibility,
  type ISupportAttachment,
  type ISupportMessage,
} from "../../models/supportMessage.model.js";
import {
  SupportOutcome,
  SupportParty,
  SupportTargetKind,
  SupportTicket,
  SupportTicketStatus,
  SupportTicketType,
  type ISupportTicket,
} from "../../models/supportTicket.model.js";
import { EntityType, User } from "../../models/user.model.js";
import logger from "../logger/logger.js";
import { HttpError } from "../middlewares/error.middleware.js";
import type { AuthUser } from "../middlewares/auth.middleware.js";
import { canManageShop } from "../helpers/shopAccess.js";
import { runInTransaction } from "../helpers/transaction.js";
import {
  AUTO_HIDE,
  autoStepFor,
  availableSupportActions,
  checkMessage,
  checkSupportAction,
  containsContact,
  initialStatus,
  isReport,
  ORDER_PROBLEM_WINDOW_MS,
  OUTCOME_LABELS,
  priorityFor,
  PROPOSAL_KINDS,
  reasonLabel,
  REPORT_ABUSE,
  shopIsParty,
  statusAfterMessage,
  SUPPORT_REASONS,
  SUPPORT_TYPE_LABELS,
  SupportAction,
  supportScheduleFor,
  type SupportActionInput,
} from "../helpers/support.workflow.js";
import { applySanction, confirmProvisional, liftSanction, SANCTION_LABELS } from "./sanction.service.js";
import {
  deliverSupportNotices,
  eventNotices,
  messageNotices,
  newTicketNotices,
  type SupportNotice,
  type SupportRecipient,
} from "./support.notifications.js";
import { supportNumber } from "./support.returns.js";

// ─────────────────────────────────────────────
//  Support — les écritures.
//
//  Ouvrir une demande, y écrire, la faire avancer, et laisser la plateforme
//  agir à l'échéance : mêmes contrôles (support.workflow.ts), mêmes effets,
//  même fil de messages. Chaque écriture se fait dans une transaction ; les
//  emails et les sanctions automatiques suivent sa validation.
// ─────────────────────────────────────────────

const { REQUESTER, SHOP, ADMIN, SYSTEM } = SupportParty;
const S = SupportTicketStatus;
const T = SupportTicketType;

export const PLATFORM_NAME = "Équipe de la plateforme";

const OPEN_STATUSES = [S.AWAITING_SHOP, S.AWAITING_REQUESTER, S.AWAITING_ADMIN];

const sameId = (a: unknown, b: unknown) => a != null && b != null && String(a) === String(b);

// ── Qui est qui ─────────────────────────────

/** Les rôles de la personne sur CETTE demande. Un gérant peut aussi être demandeur ailleurs. */
export const supportParties = async (
  user: AuthUser | undefined,
  ticket: Pick<ISupportTicket, "type" | "requester" | "boutiqueId" | "requesterShopId">,
  session?: ClientSession
): Promise<SupportParty[]> => {
  if (!user) return [];
  const parties: SupportParty[] = [];
  if (user.entityType === EntityType.ADMIN) parties.push(ADMIN);

  const shopFor = async (id: unknown) => {
    if (!id || user.entityType !== EntityType.SHOP) return null;
    const query = Shop.findById(String(id));
    return session ? query.session(session) : query;
  };

  if (sameId(ticket.requester.userId, user.id)) parties.push(REQUESTER);
  else {
    const own = await shopFor(ticket.requesterShopId);
    if (own && canManageShop(user, own)) parties.push(REQUESTER);
  }

  if (shopIsParty(ticket.type)) {
    const shop = await shopFor(ticket.boutiqueId);
    if (shop && canManageShop(user, shop)) parties.push(SHOP);
  }
  return parties;
};

/** La place d'où l'on lit : l'administration d'abord, puis la boutique, puis le demandeur. */
export const viewerOf = (parties: readonly SupportParty[]): SupportParty | null =>
  parties.includes(ADMIN) ? ADMIN : parties.includes(SHOP) ? SHOP : parties.includes(REQUESTER) ? REQUESTER : null;

// ── Ouvrir une demande ──────────────────────

export interface CreateTicketInput {
  type: SupportTicketType;
  reason: string;
  subject?: string | undefined;
  description: string;
  targetId?: string | undefined;
  /** Une boutique écrit en son nom (question depuis l'Espace boutique). */
  shopId?: string | undefined;
  /** Visiteur sans compte (formulaire « Nous contacter »). */
  guest?: { name: string; email: string } | undefined;
}

interface ResolvedTarget {
  target: NonNullable<ISupportTicket["target"]> | null;
  boutiqueId: Types.ObjectId | null;
  requesterShopId: Types.ObjectId | null;
  orderId: Types.ObjectId | null;
}

const oid = (value: unknown) => new Types.ObjectId(String(value));

const resolveTarget = async (user: AuthUser | undefined, input: CreateTicketInput, now: Date): Promise<ResolvedTarget> => {
  const none: ResolvedTarget = { target: null, boutiqueId: null, requesterShopId: null, orderId: null };
  const need = () => {
    if (!input.targetId || !mongoose.isValidObjectId(input.targetId)) throw new HttpError("Précisez ce que vous signalez.", 400);
    return input.targetId;
  };

  switch (input.type) {
    case T.ORDER_PROBLEM: {
      const part = await ShopOrder.findById(need());
      if (!part) throw new HttpError("Commande introuvable.", 404);
      if (!sameId(part.userId, user?.id)) throw new HttpError("Vous ne pouvez signaler un problème que sur vos commandes.", 403);
      if (part.status === ShopOrderStatus.AWAITING_PAYMENT) {
        throw new HttpError("Cette commande attend son paiement : rien n'est encore parti chez la boutique.", 400);
      }
      const delivered = [...(part.statusHistory ?? [])].reverse().find((step) => step.status === ShopOrderStatus.DELIVERED)?.changedAt;
      const since = delivered ?? (OPEN_PART_STATUSES.includes(part.status) ? null : part.updatedAt);
      if (since && now.getTime() - since.getTime() > ORDER_PROBLEM_WINDOW_MS) {
        throw new HttpError("Plus de 30 jours ont passé : posez plutôt une question à l'équipe de la plateforme.", 400);
      }
      const open = await SupportTicket.findOne({
        type: T.ORDER_PROBLEM,
        "target.id": part._id,
        status: { $in: OPEN_STATUSES },
      });
      if (open) throw new HttpError(`Une demande est déjà ouverte pour cette commande (${open.number}).`, 409);
      return {
        target: { kind: SupportTargetKind.SHOP_ORDER, id: part._id, label: part.reference },
        boutiqueId: part.boutiqueId,
        requesterShopId: null,
        orderId: part.orderId,
      };
    }
    case T.LISTING_REPORT: {
      const offer = await productBoutique.findById(need());
      if (!offer) throw new HttpError("Annonce introuvable.", 404);
      const shop = await Shop.findById(offer.boutiqueId);
      if (shop && user?.entityType === EntityType.SHOP && canManageShop(user, shop)) {
        throw new HttpError("Vous ne pouvez pas signaler votre propre annonce.", 400);
      }
      const product = await Product.findById(offer.productId);
      return {
        target: { kind: SupportTargetKind.OFFER, id: offer._id as Types.ObjectId, label: `${product?.name ?? "Annonce"} — ${shop?.nom ?? "boutique"}` },
        boutiqueId: offer.boutiqueId,
        requesterShopId: null,
        orderId: null,
      };
    }
    case T.SHOP_REPORT: {
      const shop = await Shop.findById(need());
      if (!shop) throw new HttpError("Boutique introuvable.", 404);
      if (user?.entityType === EntityType.SHOP && canManageShop(user, shop)) {
        throw new HttpError("Vous ne pouvez pas signaler votre propre boutique.", 400);
      }
      return {
        target: { kind: SupportTargetKind.SHOP, id: shop._id as Types.ObjectId, label: shop.nom },
        boutiqueId: shop._id as Types.ObjectId,
        requesterShopId: null,
        orderId: null,
      };
    }
    case T.REVIEW_REPORT: {
      const review = await Review.findById(need());
      if (!review) throw new HttpError("Avis introuvable.", 404);
      if (sameId(review.userId, user?.id)) throw new HttpError("Vous ne pouvez pas signaler votre propre avis.", 400);
      const offer = await productBoutique.findById(review.productBoutiqueId);
      const [author, product] = [await User.findById(review.userId), offer ? await Product.findById(offer.productId) : null];
      return {
        target: {
          kind: SupportTargetKind.REVIEW,
          id: review._id as Types.ObjectId,
          label: `Avis de ${author?.prenom ?? "client"} sur ${product?.name ?? "un produit"}`,
        },
        boutiqueId: offer?.boutiqueId ?? null,
        requesterShopId: null,
        orderId: null,
      };
    }
    case T.CUSTOMER_REPORT: {
      if (user?.entityType !== EntityType.SHOP && user?.entityType !== EntityType.ADMIN) {
        throw new HttpError("Seule une boutique signale un client.", 403);
      }
      const part = await ShopOrder.findById(need());
      if (!part) throw new HttpError("Commande introuvable.", 404);
      const shop = await Shop.findById(part.boutiqueId);
      if (!shop || !canManageShop(user, shop)) throw new HttpError("Vous ne pouvez signaler que les clients de vos commandes.", 403);
      const name = `${part.customer?.prenom ?? ""} ${part.customer?.nom ?? ""}`.trim() || "Client";
      return {
        target: { kind: SupportTargetKind.USER, id: part.userId, label: `${name} (commande ${part.reference})` },
        boutiqueId: null,
        requesterShopId: shop._id as Types.ObjectId,
        orderId: part.orderId,
      };
    }
    case T.SANCTION_APPEAL: {
      const sanction = await Sanction.findById(need());
      if (!sanction) throw new HttpError("Mesure introuvable.", 404);
      if (!sameId(sanction.notifiedUserId, user?.id)) throw new HttpError("Vous ne pouvez contester qu'une mesure qui vous vise.", 403);
      if (sanction.liftedAt) throw new HttpError("Cette mesure est déjà levée.", 400);
      const open = await SupportTicket.findOne({ type: T.SANCTION_APPEAL, "target.id": sanction._id, status: { $in: OPEN_STATUSES } });
      if (open) throw new HttpError(`Une contestation est déjà ouverte (${open.number}).`, 409);
      // Une mesure qui vise une boutique ou son annonce se suit depuis l'Espace boutique.
      let shopId: Types.ObjectId | null = null;
      if (sanction.target.kind === SanctionTargetKind.SHOP) shopId = sanction.target.id;
      if (sanction.target.kind === SanctionTargetKind.OFFER) shopId = (await productBoutique.findById(sanction.target.id))?.boutiqueId ?? null;
      return {
        target: { kind: SupportTargetKind.SANCTION, id: sanction._id, label: `${SANCTION_LABELS[sanction.type]} — ${sanction.target.label}` },
        boutiqueId: null,
        requesterShopId: shopId,
        orderId: null,
      };
    }
    case T.GENERAL_QUESTION: {
      if (!input.shopId) return none;
      const shop = await Shop.findById(input.shopId);
      if (!shop || !canManageShop(user, shop)) throw new HttpError("Vous ne pouvez écrire qu'au nom de vos boutiques.", 403);
      return { ...none, requesterShopId: shop._id as Types.ObjectId };
    }
    default:
      throw new HttpError("Ce type de demande ne s'ouvre pas ici.", 400);
  }
};

/** Sous-commandes encore en cours : un problème s'y signale sans limite de date. */
const OPEN_PART_STATUSES: readonly ShopOrderStatus[] = [
  ShopOrderStatus.PENDING,
  ShopOrderStatus.CONFIRMED,
  ShopOrderStatus.SHIPPED,
  ShopOrderStatus.READY_FOR_PICKUP,
  ShopOrderStatus.DELIVERY_FAILED,
];

export const toAttachments = (files: readonly Express.Multer.File[], urlOf: (path: string) => string): ISupportAttachment[] =>
  files.map((file) => ({ url: urlOf(file.path), name: file.originalname, mimetype: file.mimetype, size: file.size }));

/** Masquage provisoire d'une annonce signalée par plusieurs comptes pour un motif grave. */
const maybeAutoHide = async (ticket: ISupportTicket, now: Date) => {
  if (ticket.type !== T.LISTING_REPORT || !AUTO_HIDE.reasons.includes(ticket.reason) || !ticket.target) return;
  const offer = await productBoutique.findById(ticket.target.id);
  if (!offer || offer.hiddenAt) return;
  const reporters = await SupportTicket.distinct("requester.userId", {
    type: T.LISTING_REPORT,
    "target.id": ticket.target.id,
    reason: { $in: AUTO_HIDE.reasons },
    createdAt: { $gte: new Date(now.getTime() - AUTO_HIDE.windowMs) },
    "resolution.outcome": { $ne: SupportOutcome.REJECTED },
  });
  if (reporters.filter(Boolean).length < AUTO_HIDE.reporters) return;
  try {
    await applySanction({
      type: SanctionType.HIDE,
      targetKind: SanctionTargetKind.OFFER,
      targetId: String(ticket.target.id),
      reason: `Masquage provisoire : ${AUTO_HIDE.reporters} signalements pour ${reasonLabel(ticket.type, ticket.reason).toLowerCase()} en moins de 7 jours. L'administration confirme ou lève sous 24 heures.`,
      ticketId: String(ticket._id),
      provisional: true,
      createdBy: null,
      now,
    });
    logger.warn(`Annonce ${String(ticket.target.id)} masquée provisoirement après ${reporters.length} signalements`);
  } catch (error) {
    logger.error(`Masquage provisoire non appliqué : ${(error as Error).message}`);
  }
};

export const createTicket = async (
  user: AuthUser | undefined,
  input: CreateTicketInput,
  attachments: ISupportAttachment[] = [],
  now = new Date()
): Promise<{ ticket: ISupportTicket; message: ISupportMessage; contactWarning: boolean }> => {
  if (!user && !(input.guest && input.type === T.GENERAL_QUESTION)) {
    throw new HttpError("Session absente ou expirée, veuillez vous connecter.", 401);
  }
  if (!Object.hasOwn(SUPPORT_REASONS[input.type] ?? {}, input.reason)) {
    throw new HttpError(`Motif invalide. Valeurs acceptées : ${Object.keys(SUPPORT_REASONS[input.type] ?? {}).join(", ")}.`, 400);
  }
  if (input.reason === "other" && input.description.trim().length < 20) {
    throw new HttpError("Décrivez le problème en quelques phrases (20 caractères au moins).", 400);
  }

  const resolved = await resolveTarget(user, input, now);
  const account = user ? await User.findById(user.id) : null;
  if (user && !account) throw new HttpError("Compte introuvable.", 404);

  // Un même auteur ne signale pas deux fois la même chose en même temps.
  if (user && resolved.target && isReport(input.type)) {
    const twice = await SupportTicket.findOne({
      "requester.userId": oid(user.id),
      "target.id": resolved.target.id,
      status: { $in: OPEN_STATUSES },
    });
    if (twice) throw new HttpError(`Vous avez déjà signalé ceci (${twice.number}) : l'équipe l'examine.`, 409);
  }

  let abusive = false;
  if (user && isReport(input.type)) {
    const rejected = await SupportTicket.countDocuments({
      "requester.userId": oid(user.id),
      type: { $in: [T.LISTING_REPORT, T.SHOP_REPORT, T.REVIEW_REPORT, T.CUSTOMER_REPORT] },
      "resolution.outcome": SupportOutcome.REJECTED,
      resolvedAt: { $gte: new Date(now.getTime() - REPORT_ABUSE.windowMs) },
    });
    abusive = rejected >= REPORT_ABUSE.rejected;
  }

  const requesterName = account ? `${account.prenom} ${account.nom}`.trim() : (input.guest?.name ?? "Visiteur");
  const status = initialStatus(input.type);
  const priority = priorityFor(input.reason, abusive);
  const schedule = supportScheduleFor({ type: input.type, priority }, status, now);
  const subject =
    input.subject?.trim() ||
    `${reasonLabel(input.type, input.reason)}${resolved.target ? ` — ${resolved.target.label}` : ""}`.slice(0, 120);
  const number = await supportNumber();
  const flagged = containsContact(input.description);

  const { ticket, message } = await runInTransaction(async (session) => {
    const [created] = await SupportTicket.create(
      [
        {
          number,
          type: input.type,
          reason: input.reason,
          subject,
          status,
          priority,
          requester: {
            userId: account?._id ?? null,
            accountType: account?.role ?? "guest",
            name: requesterName,
            email: account?.email ?? input.guest?.email,
          },
          target: resolved.target,
          boutiqueId: resolved.boutiqueId,
          requesterShopId: resolved.requesterShopId,
          orderId: resolved.orderId,
          deadlineAt: schedule.deadlineAt,
          reminderAt: schedule.reminderAt,
          lastMessageAt: now,
        },
      ],
      { session }
    );
    if (!created) throw new Error("La demande n'a pas pu être enregistrée.");
    const [first] = await SupportMessage.create(
      [
        {
          ticketId: created._id,
          author: { userId: account?._id ?? null, party: REQUESTER, name: requesterName },
          visibility: SupportVisibility.PUBLIC,
          kind: SupportMessageKind.MESSAGE,
          body: input.description.trim(),
          attachments,
          containsContact: flagged,
        },
      ],
      { session }
    );
    if (!first) throw new Error("Le message n'a pas pu être enregistré.");
    return { ticket: created, message: first };
  });

  logger.info(`Demande ${ticket.number} ouverte (${ticket.type}, ${ticket.reason})`);
  await maybeAutoHide(ticket, now);
  await deliverSupportNotices(newTicketNotices(ticket, shopIsParty(ticket.type)), ticket);
  return { ticket, message, contactWarning: flagged };
};

// ── Écrire dans une demande ─────────────────

const authorName = async (party: SupportParty, ticket: ISupportTicket, session?: ClientSession) => {
  if (party === ADMIN || party === SYSTEM) return PLATFORM_NAME;
  if (party === SHOP) {
    const query = Shop.findById(ticket.boutiqueId);
    const shop = session ? await query.session(session) : await query;
    return shop?.nom ?? "Boutique";
  }
  return ticket.requester.name;
};

/** Qui prévenir d'un message ou d'un événement public : tous les autres. */
const othersOf = (ticket: ISupportTicket, author: SupportParty): SupportRecipient[] => {
  const to: SupportRecipient[] = [];
  if (author !== REQUESTER) to.push("requester");
  if (author !== SHOP && shopIsParty(ticket.type)) to.push("shop");
  if (author !== ADMIN && (ticket.escalatedAt || !shopIsParty(ticket.type))) to.push("admin");
  return to;
};

const reschedule = (ticket: ISupportTicket, status: SupportTicketStatus, now: Date) => {
  if (ticket.status === status) return;
  ticket.status = status;
  const schedule = supportScheduleFor(ticket, status, now);
  ticket.deadlineAt = schedule.deadlineAt;
  ticket.reminderAt = schedule.reminderAt;
};

export interface PostMessageInput {
  body: string;
  internal?: boolean | undefined;
  /** L'administration attend la réponse de cette partie. */
  waitFor?: SupportParty | undefined;
}

export const postMessage = async (
  user: AuthUser | undefined,
  ticketId: string,
  input: PostMessageInput,
  attachments: ISupportAttachment[] = [],
  now = new Date()
) => {
  const result = await runInTransaction(async (session) => {
    const ticket = await SupportTicket.findById(ticketId).session(session);
    if (!ticket) throw new HttpError("Demande introuvable.", 404);
    const parties = await supportParties(user, ticket, session);
    const refusal = checkMessage(parties, ticket, !!input.internal);
    if (refusal) throw new HttpError(refusal, parties.length === 0 ? 403 : 400);

    const author = viewerOf(parties) ?? REQUESTER;
    const flagged = containsContact(input.body);
    const [message] = await SupportMessage.create(
      [
        {
          ticketId: ticket._id,
          author: { userId: oid(user?.id), party: author, name: await authorName(author, ticket, session) },
          visibility: input.internal ? SupportVisibility.INTERNAL : SupportVisibility.PUBLIC,
          kind: SupportMessageKind.MESSAGE,
          body: input.body.trim(),
          attachments,
          containsContact: flagged,
        },
      ],
      { session }
    );

    if (!input.internal) {
      if (author === SHOP && !ticket.shopRespondedAt) ticket.shopRespondedAt = now;
      if (author === ADMIN && !ticket.adminRespondedAt) ticket.adminRespondedAt = now;
      reschedule(ticket, statusAfterMessage(ticket, author, input.waitFor), now);
      ticket.lastMessageAt = now;
    }
    await ticket.save({ session });
    return { ticket, message: message!, author, flagged };
  });

  if (!input.internal) {
    await deliverSupportNotices(messageNotices(result.ticket, othersOf(result.ticket, result.author), result.message.author.name), result.ticket);
  }
  return { ticket: result.ticket, message: result.message, contactWarning: result.flagged };
};

// ── Faire avancer une demande ───────────────

const outcomeLine = (outcome: SupportOutcome) => OUTCOME_LABELS[outcome];

export const applySupportAction = async (
  user: AuthUser | undefined,
  ticketId: string,
  action: SupportAction,
  input: SupportActionInput,
  now = new Date()
) => {
  const notices: SupportNotice[] = [];
  const effects: { liftProvisional?: string | undefined; confirmProvisional?: string | undefined } = {};

  const ticket = await runInTransaction(async (session) => {
    const found = await SupportTicket.findById(ticketId).session(session);
    if (!found) throw new HttpError("Demande introuvable.", 404);
    const parties = await supportParties(user, found, session);
    if (parties.length === 0) throw new HttpError("Vous ne participez pas à cette demande.", 403);
    const refusal = checkSupportAction(action, parties, found, input, now);
    if (refusal) throw new HttpError(refusal, 400);

    const actor = action === SupportAction.RESOLVE || action === SupportAction.ASSIGN ? ADMIN : (viewerOf(parties) ?? REQUESTER);
    const name = await authorName(actor, found, session);
    const messages: Record<string, unknown>[] = [];
    const say = (body: string, kind = SupportMessageKind.EVENT, party = actor, author = name) =>
      messages.push({
        ticketId: found._id,
        author: { userId: party === SYSTEM ? null : oid(user?.id), party, name: author },
        visibility: SupportVisibility.PUBLIC,
        kind,
        body,
      });

    switch (action) {
      case SupportAction.PROPOSE: {
        const kind = input.kind as keyof typeof PROPOSAL_KINDS;
        found.proposal = { kind, details: input.details!.trim(), status: "pending", at: now, by: oid(user?.id) };
        if (!found.shopRespondedAt) found.shopRespondedAt = now;
        say(`${PROPOSAL_KINDS[kind]} : ${input.details!.trim()}`, SupportMessageKind.PROPOSAL, SHOP);
        reschedule(found, S.AWAITING_REQUESTER, now);
        notices.push(...eventNotices(found, ["requester"], "La boutique vous propose une solution", `${PROPOSAL_KINDS[kind]} : ${input.details!.trim()}`));
        break;
      }
      case SupportAction.ACCEPT:
        found.proposal!.status = "accepted";
        found.resolution = { outcome: SupportOutcome.AGREED, note: found.proposal!.details, by: REQUESTER, at: now };
        found.resolvedAt = now;
        say("Le client accepte la solution proposée.");
        reschedule(found, S.RESOLVED, now);
        notices.push(...eventNotices(found, ["shop"], "Le client accepte votre solution", "Appliquez-la comme proposé : la demande est résolue."));
        break;
      case SupportAction.ESCALATE:
        if (found.proposal?.status === "pending") found.proposal.status = "declined";
        found.escalatedAt = now;
        say(
          input.reason?.trim()
            ? `Arbitrage demandé : ${input.reason.trim()}`
            : "Arbitrage demandé : l'administration reprend la demande.",
          SupportMessageKind.EVENT
        );
        reschedule(found, S.AWAITING_ADMIN, now);
        notices.push(...eventNotices(found, ["admin", ...othersOf(found, actor).filter((r) => r !== "admin")], "Arbitrage demandé", "L'administration examine la demande et tranchera sous 72 heures."));
        break;
      case SupportAction.RESOLVE: {
        const outcome = input.outcome!;
        found.resolution = { outcome, note: input.note!.trim(), by: ADMIN, decidedBy: oid(user?.id), at: now };
        found.resolvedAt = now;
        if (!found.adminRespondedAt) found.adminRespondedAt = now;
        say(`${outcomeLine(outcome)} — ${input.note!.trim()}`, SupportMessageKind.DECISION, ADMIN, PLATFORM_NAME);
        // Après un recours, la décision est définitive.
        if (found.appeal) {
          reschedule(found, S.CLOSED, now);
          found.closedAt = now;
        } else {
          reschedule(found, S.RESOLVED, now);
        }
        // Le masquage provisoire d'une annonce signalée suit la décision.
        if (found.type === T.LISTING_REPORT && found.target) {
          if (outcome === SupportOutcome.REJECTED) effects.liftProvisional = String(found.target.id);
          if (outcome === SupportOutcome.UPHELD) effects.confirmProvisional = String(found.target.id);
        }
        notices.push(...eventNotices(found, othersOf(found, ADMIN), "Décision sur votre demande", `${outcomeLine(outcome)} : ${input.note!.trim()}`));
        break;
      }
      case SupportAction.APPEAL:
        found.appeal = { by: actor, userId: oid(user?.id), reason: input.reason!.trim(), at: now };
        found.assignee = null;
        say(`Recours : ${input.reason!.trim()}`);
        reschedule(found, S.AWAITING_ADMIN, now);
        notices.push(...eventNotices(found, ["admin"], "Recours sur une décision", "Un autre membre de l'équipe réexamine la demande si possible."));
        break;
      case SupportAction.CLOSE:
        if (!found.resolution) {
          found.resolution =
            actor === ADMIN
              ? { outcome: SupportOutcome.REJECTED, note: input.note?.trim() || "Classée par l'administration.", by: ADMIN, decidedBy: oid(user?.id), at: now }
              : { outcome: SupportOutcome.WITHDRAWN, note: input.note?.trim(), by: REQUESTER, at: now };
        }
        found.closedAt = now;
        say(actor === ADMIN ? `Demande classée${input.note?.trim() ? ` : ${input.note.trim()}` : "."}` : "Le demandeur ferme sa demande.");
        reschedule(found, S.CLOSED, now);
        notices.push(...eventNotices(found, othersOf(found, actor), "Demande fermée", found.resolution?.note ?? "La demande est fermée."));
        break;
      case SupportAction.REOPEN:
        found.reopenedAt = now;
        found.closedAt = null;
        found.resolvedAt = null;
        found.resolution = null;
        say(`Demande rouverte : ${input.reason!.trim()}`);
        reschedule(found, found.escalatedAt || !shopIsParty(found.type) ? S.AWAITING_ADMIN : S.AWAITING_SHOP, now);
        notices.push(...eventNotices(found, othersOf(found, REQUESTER), "Demande rouverte", input.reason!.trim()));
        break;
      case SupportAction.ASSIGN:
        found.assignee = oid(input.assignee ?? user?.id);
        break;
      case SupportAction.RATE:
        found.satisfaction = { rating: input.rating!, comment: input.comment?.trim() || undefined, at: now };
        break;
      default:
        break;
    }

    await found.save({ session });
    if (messages.length > 0) await SupportMessage.create(messages, { session, ordered: true });
    return found;
  });

  // Après la transaction : le masquage provisoire est confirmé ou levé.
  if (effects.liftProvisional || effects.confirmProvisional) {
    const offerId = effects.liftProvisional ?? effects.confirmProvisional;
    const provisional = await Sanction.findOne({ "target.id": oid(offerId), provisional: true, liftedAt: null });
    if (provisional) {
      if (effects.liftProvisional) {
        await liftSanction(String(provisional._id), user?.id ?? null, "Signalements non fondés après examen.", now);
      } else {
        await confirmProvisional(provisional);
      }
    }
  }

  logger.info(`Demande ${ticket.number} : ${action} (${ticket.status})`);
  await deliverSupportNotices(notices, ticket);
  return ticket;
};

// ── Délais ──────────────────────────────────

const REMINDER_LINES: Partial<Record<SupportTicketStatus, { to: SupportRecipient; title: string; line: string }>> = {
  [S.AWAITING_SHOP]: { to: "shop", title: "Plus que 24 heures pour répondre", line: "Sans réponse, la demande passera à l'administration." },
  [S.AWAITING_REQUESTER]: { to: "requester", title: "Votre réponse est attendue", line: "Sans réponse sous 4 jours, la demande sera fermée." },
  [S.AWAITING_ADMIN]: { to: "admin", title: "Demande en attente de réponse", line: "La première réponse de l'équipe est attendue." },
};

export interface SupportDeadlineSummary {
  reminders: number;
  steps: number;
  errors: number;
}

export const runSupportDeadlines = async (now = new Date()): Promise<SupportDeadlineSummary> => {
  const summary: SupportDeadlineSummary = { reminders: 0, steps: 0, errors: 0 };

  for (const ticket of await SupportTicket.find({ reminderAt: { $lte: now } })) {
    try {
      const reminder = REMINDER_LINES[ticket.status];
      if (reminder) await deliverSupportNotices(eventNotices(ticket, [reminder.to], reminder.title, reminder.line), ticket);
      ticket.reminderAt = null;
      await ticket.save();
      summary.reminders += 1;
    } catch (error) {
      summary.errors += 1;
      logger.error(`Rappel de ${ticket.number} non envoyé : ${(error as Error).message}`);
    }
  }

  for (const due of await SupportTicket.find({ deadlineAt: { $lte: now } })) {
    try {
      const notices: SupportNotice[] = [];
      const ticket = await runInTransaction(async (session) => {
        // Relue dans la transaction : quelqu'un a pu répondre entre-temps.
        const fresh = await SupportTicket.findById(due._id).session(session);
        if (!fresh || fresh.status !== due.status || !fresh.deadlineAt || fresh.deadlineAt > now) return null;
        const step = autoStepFor(fresh);
        const say = (body: string) =>
          SupportMessage.create(
            [{ ticketId: fresh._id, author: { userId: null, party: SYSTEM, name: PLATFORM_NAME }, visibility: SupportVisibility.PUBLIC, kind: SupportMessageKind.EVENT, body }],
            { session }
          );
        switch (step) {
          case "escalate":
            fresh.escalatedAt = now;
            reschedule(fresh, S.AWAITING_ADMIN, now);
            await say("La boutique n'a pas répondu sous 48 heures : l'administration reprend la demande.");
            notices.push(...eventNotices(fresh, ["admin", "requester", "shop"], "Demande transmise à l'administration", "La boutique n'a pas répondu dans les délais."));
            break;
          case "back_to_admin":
            reschedule(fresh, S.AWAITING_ADMIN, now);
            await say("Pas de réponse dans les délais : la demande revient à l'administration.");
            notices.push(...eventNotices(fresh, ["admin"], "Demande sans réponse", "La partie interrogée n'a pas répondu."));
            break;
          case "close_expired":
            fresh.resolution = { outcome: SupportOutcome.EXPIRED, by: SYSTEM, at: now };
            fresh.closedAt = now;
            reschedule(fresh, S.CLOSED, now);
            await say("Sans réponse du demandeur sous 7 jours, la demande est fermée. Elle peut être rouverte pendant 14 jours.");
            notices.push(...eventNotices(fresh, ["requester"], "Demande fermée", "Vous pouvez la rouvrir pendant 14 jours si le problème persiste."));
            break;
          case "close_final":
            fresh.closedAt = now;
            reschedule(fresh, S.CLOSED, now);
            break;
          case "alert":
            fresh.deadlineAt = null;
            notices.push(...eventNotices(fresh, ["admin"], "Délai de décision dépassé", "La demande attend une décision depuis 72 heures."));
            break;
          default:
            fresh.deadlineAt = null;
        }
        await fresh.save({ session });
        return fresh;
      });
      if (!ticket) continue;
      await deliverSupportNotices(notices, ticket);
      summary.steps += 1;
    } catch (error) {
      summary.errors += 1;
      logger.error(`Échéance de ${due.number} non appliquée : ${(error as Error).message}`);
    }
  }
  return summary;
};

let timer: NodeJS.Timeout | null = null;

/** Comme les délais des commandes : toutes les 15 minutes, et une première fois tout de suite. */
export const startSupportScheduler = (intervalMs = 15 * 60 * 1000): void => {
  if (timer) return;
  const tick = () => {
    runSupportDeadlines()
      .then((summary) => {
        if (summary.reminders + summary.steps + summary.errors > 0) logger.info(`Délais du support : ${JSON.stringify(summary)}`);
      })
      .catch((error) => logger.error(`Tâche des délais du support en échec : ${(error as Error).message}`));
  };
  timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
};

export const stopSupportScheduler = (): void => {
  if (timer) clearInterval(timer);
  timer = null;
};

// ── Lecture ─────────────────────────────────

export const supportActionsFor = availableSupportActions;
export const SUPPORT_LABELS = { types: SUPPORT_TYPE_LABELS };
