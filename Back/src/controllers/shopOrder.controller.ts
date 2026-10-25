import type { Request, Response } from "express";
import mongoose, { type ClientSession } from "mongoose";
import { validationResult } from "express-validator";
import {
  ShopOrder,
  ShopOrderActor,
  ShopOrderStatus,
  type IShopOrder,
} from "../models/shopOrder.model.js";
import { Shop } from "../models/boutique.model.js";
import { EntityType } from "../models/user.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js";
import { HttpError } from "../shared/middlewares/error.middleware.js";
import type { AuthUser } from "../shared/middlewares/auth.middleware.js";
import { canManageShop, SHOP_FORBIDDEN_MESSAGE } from "../shared/helpers/shopAccess.js";
import { cleanupUploadedFiles, getFileUrl } from "../shared/helpers/fileUpload.js";
import { runInTransaction } from "../shared/helpers/transaction.js";
import {
  groupOf,
  SHOP_ORDER_GROUP_KEYS,
  SHOP_ORDER_GROUPS,
  ShopOrderAction,
  type ActionInput,
  type ShopOrderGroup,
} from "../shared/helpers/shopOrder.workflow.js";
import { applyShopOrderAction, settleProviderRefund } from "../shared/services/shopOrder.service.js";
import { deliverNotices, noticesForAction } from "../shared/services/shopOrder.notifications.js";
import {
  toShopOrderResponseDto,
  type ShopOrderViewer,
} from "../shared/interfaces/ShopOrder.interfaces.js";

// ─────────────────────────────────────────────
//  Sous-commandes — l'avancement d'une commande, boutique par boutique.
//
//   GET   /shop-orders                 l'espace commandes d'une boutique (ou tout, pour l'admin)
//   GET   /shop-orders/:id             client, gérant de la boutique, admin
//   PATCH /shop-orders/:id/:action     confirm, refuse, ship, ready, deliver, delivery-failed,
//                                      retry, abandon, cancel, admin-cancel, return,
//                                      accept-return, reject-return, resolve-dispute, confirm-refund
//
//  Qui peut faire quoi, et depuis quel statut : shared/helpers/shopOrder.workflow.ts.
// ─────────────────────────────────────────────

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sendError = (res: Response, error: unknown, context: string) => {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json(new BaseResponse(false, error.message, error.statusCode, null));
  }
  logger.error(`${context} : ${(error as Error).message}`);
  const response = BaseResponse.ServerError((error as Error).message);
  return res.status(response.statusCode).json(response);
};

/**
 * Rôles de la personne sur cette sous-commande. Un gérant peut aussi être
 * client d'une autre boutique : on ne déduit rien du seul type de compte.
 */
const resolveActors = async (
  user: AuthUser | undefined,
  part: Pick<IShopOrder, "userId" | "boutiqueId">,
  session?: ClientSession
): Promise<{ actors: ShopOrderActor[]; viewer: ShopOrderViewer | null }> => {
  if (!user) return { actors: [], viewer: null };
  const actors: ShopOrderActor[] = [];

  if (user.entityType === EntityType.ADMIN) actors.push(ShopOrderActor.ADMIN);
  if (part.userId.toString() === user.id) actors.push(ShopOrderActor.CLIENT);
  if (user.entityType === EntityType.SHOP) {
    const query = Shop.findById(part.boutiqueId);
    const shop = session ? await query.session(session) : await query;
    if (shop && canManageShop(user, shop)) actors.push(ShopOrderActor.SHOP);
  }

  const viewer: ShopOrderViewer | null = actors.includes(ShopOrderActor.SHOP)
    ? "shop"
    : actors.includes(ShopOrderActor.CLIENT)
      ? "client"
      : actors.includes(ShopOrderActor.ADMIN)
        ? "admin"
        : null;
  return { actors, viewer };
};

// ─────────────────────────────────────────────
//  GET /shop-orders?boutiqueId=&group=&status=&search=&page=&limit=
//  Gérant : boutiqueId obligatoire, et la boutique doit être la sienne.
//  « À confirmer » se lit des plus anciennes aux plus récentes (une file) ;
//  le reste, des plus récemment modifiées aux plus anciennes. `counts` donne
//  le nombre de sous-commandes de chaque onglet.
// ─────────────────────────────────────────────
export const listShopOrders = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const admin = req.user?.entityType === EntityType.ADMIN;
    const { boutiqueId, group, status, search, page = "1", limit = "20" } = req.query;

    if (!admin) {
      if (!boutiqueId) throw new HttpError("Précisez la boutique dont vous lisez les commandes.", 400);
      const shop = await Shop.findById(String(boutiqueId));
      if (!shop) throw new HttpError("Boutique introuvable.", 404);
      if (!canManageShop(req.user, shop)) throw new HttpError(SHOP_FORBIDDEN_MESSAGE, 403);
    }

    // Une commande pas encore payée n'existe pas pour la boutique.
    const scope: Record<string, unknown> = { status: { $ne: ShopOrderStatus.AWAITING_PAYMENT } };
    if (boutiqueId) scope.boutiqueId = String(boutiqueId);

    const filter: Record<string, unknown> = { ...scope };
    if (group) filter.status = { $in: SHOP_ORDER_GROUPS[group as ShopOrderGroup] };
    else if (status) filter.status = status;
    if (search) filter.reference = { $regex: escapeRegex(String(search)), $options: "i" };

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string)));
    const sort: Record<string, 1 | -1> = group === "todo" ? { createdAt: 1 } : { updatedAt: -1 };

    const [parts, total, grouped] = await Promise.all([
      ShopOrder.find(filter).sort(sort).skip((pageNum - 1) * limitNum).limit(limitNum),
      ShopOrder.countDocuments(filter),
      ShopOrder.aggregate<{ _id: ShopOrderStatus; count: number }>([
        // L'agrégation ne convertit pas les types : l'identifiant doit être un ObjectId.
        {
          $match: {
            status: { $ne: ShopOrderStatus.AWAITING_PAYMENT },
            deletedAt: null,
            ...(boutiqueId ? { boutiqueId: new mongoose.Types.ObjectId(String(boutiqueId)) } : {}),
          },
        },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const counts = Object.fromEntries(SHOP_ORDER_GROUP_KEYS.map((key) => [key, 0])) as Record<ShopOrderGroup, number>;
    for (const entry of grouped) {
      const key = groupOf(entry._id);
      if (key) counts[key] += entry.count;
    }

    const viewer: ShopOrderViewer = admin ? "admin" : "shop";
    const actors = admin ? [ShopOrderActor.ADMIN] : [ShopOrderActor.SHOP];
    const response = BaseResponse.WithSuccess(
      {
        shopOrders: parts.map((part) => toShopOrderResponseDto(part, viewer, actors)),
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        counts,
      },
      "Commandes récupérées avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur liste des sous-commandes");
  }
};

// ─────────────────────────────────────────────
//  GET /shop-orders/:id
// ─────────────────────────────────────────────
export const getShopOrderById = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    const part = await ShopOrder.findById(String(req.params.id));
    if (!part) throw new HttpError("Commande introuvable.", 404);

    const { actors, viewer } = await resolveActors(req.user, part);
    if (!viewer) throw new HttpError("Vous ne pouvez consulter que vos propres commandes.", 403);
    // Pas encore payée : seul le client et l'administration la voient.
    if (part.status === ShopOrderStatus.AWAITING_PAYMENT && viewer === "shop") {
      throw new HttpError("Commande introuvable.", 404);
    }

    const response = BaseResponse.WithSuccess(
      toShopOrderResponseDto(part, viewer, actors),
      "Commande récupérée avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur lecture sous-commande");
  }
};

// ─────────────────────────────────────────────
//  PATCH /shop-orders/:id/:action
//  Une transaction par action ; remboursement chez le prestataire et emails
//  ensuite. Les photos ne sont acceptées que pour une demande de retour.
// ─────────────────────────────────────────────
export const performShopOrderAction = async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const action = String(req.params.action) as ShopOrderAction;

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      cleanupUploadedFiles(files);
      const response = BaseResponse.BadRequest(errors.array().map(e => e.msg).join(" | "));
      return res.status(422).json(response);
    }

    if (files.length > 0 && action !== ShopOrderAction.REQUEST_RETURN) {
      cleanupUploadedFiles(files);
      throw new HttpError("Seule une demande de retour accepte des photos.", 400);
    }

    const body = req.body as Record<string, unknown>;
    const input: ActionInput = {
      reason: typeof body.reason === "string" && body.reason ? body.reason : undefined,
      note: typeof body.note === "string" ? body.note : undefined,
      code: typeof body.code === "string" ? body.code : undefined,
      resolution: body.resolution as ActionInput["resolution"],
      refundAmount: typeof body.refundAmount === "number" ? body.refundAmount : undefined,
      photos: files.map((file) => getFileUrl(file.path)),
    };
    const now = new Date();

    let viewer: ShopOrderViewer = "client";
    let actors: ShopOrderActor[] = [];
    const result = await runInTransaction(async (session) => {
      const part = await ShopOrder.findById(String(req.params.id)).session(session);
      if (!part || part.status === ShopOrderStatus.AWAITING_PAYMENT) throw new HttpError("Commande introuvable.", 404);

      const resolved = await resolveActors(req.user, part, session);
      if (!resolved.viewer) throw new HttpError("Vous ne pouvez agir que sur vos propres commandes.", 403);
      viewer = resolved.viewer;
      actors = resolved.actors;

      return applyShopOrderAction({ part, action, actors, userId: req.user?.id, input, now, session });
    });

    logger.info(`${result.part.reference} : ${action} (${result.from} → ${result.part.status}) par ${req.user?.id}`);

    if (result.refundViaProvider) await settleProviderRefund(result.part, result.order);
    await deliverNotices(
      noticesForAction(action, result.part, { refund: result.refund, input, from: result.from }),
      result.part
    );

    const response = BaseResponse.WithSuccess(
      toShopOrderResponseDto(result.part, viewer, actors, now),
      "Commande mise à jour."
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    // Les photos d'une demande refusée ne servent à rien : on ne les garde pas.
    cleanupUploadedFiles(files);
    return sendError(res, error, `Erreur action ${action} sur une sous-commande`);
  }
};
