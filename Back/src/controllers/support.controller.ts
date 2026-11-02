import type { Request, Response } from "express";
import { Types } from "mongoose";
import { validationResult } from "express-validator";
import { Shop } from "../models/boutique.model.js";
import { Sanction, SanctionTargetKind, type ISanction } from "../models/sanction.model.js";
import { SupportMessage } from "../models/supportMessage.model.js";
import {
  SupportParty,
  SupportPriority,
  SupportTargetKind,
  SupportTicket,
  SupportTicketStatus,
  SupportTicketType,
  type ISupportTicket,
} from "../models/supportTicket.model.js";
import { EntityType } from "../models/user.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js";
import { HttpError } from "../shared/middlewares/error.middleware.js";
import { cleanupUploadedFiles, getFileUrl } from "../shared/helpers/fileUpload.js";
import { canManageShop, SHOP_FORBIDDEN_MESSAGE } from "../shared/helpers/shopAccess.js";
import {
  REPORT_TYPES,
  SHOP_PARTY_TYPES,
  suggestSanction,
  type SupportAction,
  type SupportActionInput,
} from "../shared/helpers/support.workflow.js";
import {
  applySupportAction,
  createTicket,
  postMessage,
  supportParties,
  toAttachments,
  viewerOf,
} from "../shared/services/support.service.js";
import { toSanctionDto, toSupportTicketDto } from "../shared/interfaces/Support.interfaces.js";

// ─────────────────────────────────────────────
//  Support — les demandes et leurs messages.
//
//   POST  /support/tickets                    ouvrir une demande (multipart, pièces jointes)
//   POST  /support/contact                    « Nous contacter », sans compte
//   GET   /support/tickets?scope=&tab=…       mes demandes · celles d'une boutique · la file admin
//   GET   /support/tickets/:id                la demande, ses messages (et son dossier pour l'admin)
//   POST  /support/tickets/:id/messages       écrire (multipart)
//   PATCH /support/tickets/:id/:action        propose, accept, escalate, resolve, appeal, close,
//                                             reopen, assign, rate
//
//  Règles : shared/helpers/support.workflow.ts ; écritures :
//  shared/services/support.service.ts.
// ─────────────────────────────────────────────

const { REQUESTER, SHOP, ADMIN } = SupportParty;
const S = SupportTicketStatus;
const OPEN = [S.AWAITING_SHOP, S.AWAITING_REQUESTER, S.AWAITING_ADMIN];
const DONE = [S.RESOLVED, S.CLOSED];

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const oid = (value: unknown) => new Types.ObjectId(String(value));

const sendError = (res: Response, error: unknown, context: string) => {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json(new BaseResponse(false, error.message, error.statusCode, null));
  }
  logger.error(`${context} : ${(error as Error).message}`);
  const response = BaseResponse.ServerError((error as Error).message);
  return res.status(response.statusCode).json(response);
};

const invalid = (req: Request, res: Response, files: Express.Multer.File[] = []) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return null;
  cleanupUploadedFiles(files);
  return res.status(422).json(BaseResponse.BadRequest(errors.array().map((e) => e.msg).join(" | ")));
};

const filesOf = (req: Request) => (req.files as Express.Multer.File[] | undefined) ?? [];

const CONTACT_WARNING =
  "Votre message contient un numéro ou une adresse : ne payez jamais en dehors de la plateforme, vous ne seriez pas protégé.";

// ─────────────────────────────────────────────
//  POST /support/tickets
// ─────────────────────────────────────────────
export const createSupportTicket = async (req: Request, res: Response) => {
  const files = filesOf(req);
  try {
    if (invalid(req, res, files)) return;
    const { type, reason, description, subject, targetId, shopId } = req.body as Record<string, string | undefined>;
    const { ticket, contactWarning } = await createTicket(
      req.user,
      {
        type: type as SupportTicketType,
        reason: reason ?? "",
        description: description ?? "",
        subject,
        targetId,
        shopId,
      },
      toAttachments(files, getFileUrl)
    );
    const parties = await supportParties(req.user, ticket);
    const response = BaseResponse.Created(
      { ...toSupportTicketDto(ticket, viewerOf(parties) ?? REQUESTER, parties), ...(contactWarning ? { warning: CONTACT_WARNING } : {}) },
      `Demande ${ticket.number} enregistrée.`
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    cleanupUploadedFiles(files);
    return sendError(res, error, "Erreur ouverture de demande");
  }
};

// ─────────────────────────────────────────────
//  POST /support/contact — un visiteur, sans compte : réponse par email.
// ─────────────────────────────────────────────
export const contactSupport = async (req: Request, res: Response) => {
  try {
    if (invalid(req, res)) return;
    const { name, email, message, subject, reason } = req.body as Record<string, string | undefined>;
    const { ticket } = await createTicket(undefined, {
      type: SupportTicketType.GENERAL_QUESTION,
      reason: reason ?? "usage",
      description: message ?? "",
      subject,
      guest: { name: name ?? "", email: email ?? "" },
    });
    const response = BaseResponse.Created(
      { number: ticket.number },
      `Message reçu (${ticket.number}) : l'équipe vous répond par email sous 24 heures.`
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur formulaire de contact");
  }
};

// ─────────────────────────────────────────────
//  GET /support/tickets?scope=mine|shop|admin&boutiqueId=&tab=&type=&search=&page=&limit=
// ─────────────────────────────────────────────

type Filter = Record<string, unknown>;

const tabsFor = (scope: string, shopId?: Types.ObjectId): Record<string, Filter> => {
  if (scope === "admin") {
    return {
      urgent: { priority: SupportPriority.URGENT, status: { $in: OPEN } },
      todo: { status: S.AWAITING_ADMIN },
      reports: { type: { $in: REPORT_TYPES }, status: { $in: OPEN } },
      waiting: { status: { $in: [S.AWAITING_SHOP, S.AWAITING_REQUESTER] } },
      done: { status: { $in: DONE } },
    };
  }
  if (scope === "shop") {
    const party = { boutiqueId: shopId, type: { $in: SHOP_PARTY_TYPES } };
    const own = { requesterShopId: shopId };
    return {
      // À traiter : ce qu'on attend de la boutique, comme partie ou comme demandeuse.
      todo: { $or: [{ ...party, status: S.AWAITING_SHOP }, { ...own, status: S.AWAITING_REQUESTER }] },
      waiting: { $or: [{ ...party, status: S.AWAITING_REQUESTER }, { ...own, status: S.AWAITING_SHOP }] },
      admin: { status: S.AWAITING_ADMIN },
      done: { status: { $in: DONE } },
    };
  }
  return { open: { status: { $in: OPEN } }, done: { status: { $in: DONE } } };
};

/** Les rôles sur une demande d'une liste, sans aller relire chaque boutique. */
const partiesInList = (scope: string, ticket: ISupportTicket, userId: string, shopId?: Types.ObjectId): SupportParty[] => {
  if (scope === "admin") return [ADMIN];
  if (scope === "shop") {
    const parties: SupportParty[] = [];
    if (shopId && String(ticket.boutiqueId) === String(shopId) && SHOP_PARTY_TYPES.includes(ticket.type)) parties.push(SHOP);
    if ((shopId && String(ticket.requesterShopId) === String(shopId)) || String(ticket.requester.userId) === userId) parties.push(REQUESTER);
    return parties;
  }
  return [REQUESTER];
};

export const listSupportTickets = async (req: Request, res: Response) => {
  try {
    if (invalid(req, res)) return;
    const user = req.user!;
    const admin = user.entityType === EntityType.ADMIN;
    const { scope = "mine", boutiqueId, tab, type, search, page = "1", limit = "20" } = req.query as Record<string, string | undefined>;

    let base: Filter = {};
    let shopId: Types.ObjectId | undefined;
    if (scope === "admin") {
      if (!admin) throw new HttpError("Accès refusé, vous n'avez pas les permissions nécessaires", 403);
    } else if (scope === "shop") {
      if (!boutiqueId) throw new HttpError("Précisez la boutique dont vous lisez les demandes.", 400);
      const shop = await Shop.findById(boutiqueId);
      if (!shop) throw new HttpError("Boutique introuvable.", 404);
      if (!canManageShop(user, shop)) throw new HttpError(SHOP_FORBIDDEN_MESSAGE, 403);
      shopId = shop._id as Types.ObjectId;
      base = { $or: [{ boutiqueId: shopId, type: { $in: SHOP_PARTY_TYPES } }, { requesterShopId: shopId }] };
    } else {
      base = { "requester.userId": oid(user.id) };
    }

    const tabs = tabsFor(scope, shopId);
    const and: Filter[] = [base];
    if (tab && tabs[tab]) and.push(tabs[tab]!);
    if (type) and.push({ type });
    if (search?.trim()) {
      const pattern = { $regex: escapeRegex(search.trim()), $options: "i" };
      and.push({ $or: [{ number: pattern }, { subject: pattern }, { "target.label": pattern }] });
    }
    const filter = { $and: and };

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit)));
    // Une file se lit des plus anciennes aux plus récentes ; le reste, l'inverse.
    const queue = scope === "admin" && (tab === "todo" || tab === "urgent" || tab === "reports");
    const sort: Record<string, 1 | -1> = queue ? { createdAt: 1 } : { updatedAt: -1 };

    const [tickets, total, ...counted] = await Promise.all([
      SupportTicket.find(filter).sort(sort).skip((pageNum - 1) * limitNum).limit(limitNum),
      SupportTicket.countDocuments(filter),
      ...Object.values(tabs).map((tabFilter) => SupportTicket.countDocuments({ $and: [base, tabFilter] })),
    ]);
    const counts = Object.fromEntries(Object.keys(tabs).map((key, index) => [key, counted[index] ?? 0]));

    const now = new Date();
    const viewer = scope === "admin" ? ADMIN : scope === "shop" ? SHOP : REQUESTER;
    const response = BaseResponse.WithSuccess(
      {
        tickets: tickets.map((ticket) => {
          const parties = partiesInList(scope, ticket, user.id, shopId);
          return toSupportTicketDto(ticket, viewerOf(parties) ?? viewer, parties, { now });
        }),
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        counts,
      },
      "Demandes récupérées avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur liste des demandes");
  }
};

// ─────────────────────────────────────────────
//  GET /support/tickets/:id
// ─────────────────────────────────────────────

/** Sanctions qui pèsent sur la cible d'une demande (et sur la boutique en cause). */
const SANCTION_KIND: Partial<Record<SupportTargetKind, SanctionTargetKind>> = {
  [SupportTargetKind.OFFER]: SanctionTargetKind.OFFER,
  [SupportTargetKind.REVIEW]: SanctionTargetKind.REVIEW,
  [SupportTargetKind.SHOP]: SanctionTargetKind.SHOP,
  [SupportTargetKind.USER]: SanctionTargetKind.USER,
};

const dossierOf = async (ticket: ISupportTicket, now: Date) => {
  const or: Filter[] = [];
  if (ticket.target) or.push({ "target.id": ticket.target.id });
  if (ticket.boutiqueId) or.push({ boutiqueId: ticket.boutiqueId });
  const related = or.length
    ? await SupportTicket.find({ $or: or, _id: { $ne: ticket._id } }).sort({ createdAt: -1 }).limit(20)
    : [];

  const sanctionTargets: Filter[] = [];
  const kind = ticket.target ? SANCTION_KIND[ticket.target.kind] : undefined;
  if (kind && ticket.target) sanctionTargets.push({ "target.kind": kind, "target.id": ticket.target.id });
  if (ticket.boutiqueId) sanctionTargets.push({ "target.kind": SanctionTargetKind.SHOP, "target.id": ticket.boutiqueId });
  const sanctions: ISanction[] = sanctionTargets.length
    ? await Sanction.find({ $or: sanctionTargets }).sort({ createdAt: -1 })
    : [];

  // Barème : la mesure suggérée pour un nouveau manquement de la boutique ou du client.
  const shopSanctions = sanctions.filter((s) => s.target.kind === SanctionTargetKind.SHOP);
  const userSanctions = sanctions.filter((s) => s.target.kind === SanctionTargetKind.USER);
  return {
    tickets: related.map((other) => ({
      id: other._id.toString(),
      number: other.number,
      type: other.type,
      reason: other.reason,
      status: other.status,
      outcome: other.resolution?.outcome ?? null,
      createdAt: other.createdAt,
    })),
    sanctions: sanctions.map((sanction) => toSanctionDto(sanction, now)),
    suggestion: {
      ...(ticket.boutiqueId ? { shop: suggestSanction("shop", shopSanctions, now) } : {}),
      ...(ticket.target?.kind === SupportTargetKind.USER ? { user: suggestSanction("user", userSanctions, now) } : {}),
    },
  };
};

export const getSupportTicket = async (req: Request, res: Response) => {
  try {
    if (invalid(req, res)) return;
    const ticket = await SupportTicket.findById(String(req.params.id));
    if (!ticket) throw new HttpError("Demande introuvable.", 404);
    const parties = await supportParties(req.user, ticket);
    const viewer = viewerOf(parties);
    if (!viewer) throw new HttpError("Vous ne participez pas à cette demande.", 403);

    const now = new Date();
    const messages = await SupportMessage.find({ ticketId: ticket._id }).sort({ createdAt: 1 });
    const dto = toSupportTicketDto(ticket, viewer, parties, { now, messages });
    const response = BaseResponse.WithSuccess(
      viewer === ADMIN ? { ...dto, dossier: await dossierOf(ticket, now) } : dto,
      "Demande récupérée avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur lecture de demande");
  }
};

// ─────────────────────────────────────────────
//  POST /support/tickets/:id/messages
// ─────────────────────────────────────────────
export const postSupportMessage = async (req: Request, res: Response) => {
  const files = filesOf(req);
  try {
    if (invalid(req, res, files)) return;
    const { body, internal, waitFor } = req.body as { body?: string; internal?: boolean; waitFor?: string };
    const { ticket, contactWarning } = await postMessage(
      req.user,
      String(req.params.id),
      { body: body ?? "", internal: internal === true, waitFor: (waitFor || undefined) as SupportParty | undefined },
      toAttachments(files, getFileUrl)
    );
    const parties = await supportParties(req.user, ticket);
    const messages = await SupportMessage.find({ ticketId: ticket._id }).sort({ createdAt: 1 });
    const response = BaseResponse.WithSuccess(
      {
        ...toSupportTicketDto(ticket, viewerOf(parties) ?? REQUESTER, parties, { messages }),
        ...(contactWarning ? { warning: CONTACT_WARNING } : {}),
      },
      "Message envoyé."
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    cleanupUploadedFiles(files);
    return sendError(res, error, "Erreur message de demande");
  }
};

// ─────────────────────────────────────────────
//  PATCH /support/tickets/:id/:action
// ─────────────────────────────────────────────
export const performSupportAction = async (req: Request, res: Response) => {
  const action = String(req.params.action) as SupportAction;
  try {
    if (invalid(req, res)) return;
    const body = req.body as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === "string" ? value : undefined);
    const input: SupportActionInput = {
      kind: text(body.kind),
      details: text(body.details),
      outcome: text(body.outcome) as SupportActionInput["outcome"],
      note: text(body.note),
      reason: text(body.reason),
      rating: typeof body.rating === "number" ? body.rating : undefined,
      comment: text(body.comment),
      assignee: text(body.assignee),
    };
    const ticket = await applySupportAction(req.user, String(req.params.id), action, input);
    const parties = await supportParties(req.user, ticket);
    const messages = await SupportMessage.find({ ticketId: ticket._id }).sort({ createdAt: 1 });
    const response = BaseResponse.WithSuccess(
      toSupportTicketDto(ticket, viewerOf(parties) ?? REQUESTER, parties, { messages }),
      "Demande mise à jour."
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, `Erreur action ${action} sur une demande`);
  }
};
