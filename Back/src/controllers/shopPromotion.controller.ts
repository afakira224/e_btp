import type { Request, Response } from "express";
import { Types } from "mongoose";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import { invalid, pageOf, sendError } from "../shared/helpers/http.helper.js";
import { offerSummaries, pick } from "../shared/helpers/offerSummary.helper.js";
import { isPromotionAction, PROMOTION_TABS, type PromotionTab } from "../shared/helpers/promotion.rules.js";
import { HttpError } from "../shared/middlewares/error.middleware.js";
import {
  applyPromotionAction,
  createShopPromotion,
  listShopPromotions,
  managedPromotion,
  managedShop,
  promotionStats,
  updateShopPromotion,
  type ShopPromotionBody,
} from "../shared/services/promotion.service.js";
import { toShopPromotionDto } from "../shared/interfaces/ShopPromotion.interfaces.js";
import type { IPromotion } from "../models/promotion.model.js";

// ─────────────────────────────────────────────
//  Promotions d'une boutique — espace boutique.
//  La boutique les planifie et les lance seule : aucune validation.
// ─────────────────────────────────────────────

const withDetails = async (promos: IPromotion[], now: Date) => {
  const [offers, stats] = await Promise.all([
    offerSummaries(promos.flatMap((promo) => promo.productBoutiqueIds)),
    promotionStats(promos),
  ]);
  return promos.map((promo) =>
    toShopPromotionDto(promo, now, { offers: pick(offers, promo.productBoutiqueIds), stats: stats.get(String(promo._id)) })
  );
};

/** GET /shops/:id/promotions?tab=active|scheduled|ended&page=&limit= */
export const listPromotionsOfShop = async (req: Request, res: Response) => {
  try {
    const shop = await managedShop(req.user, String(req.params.id));
    const raw = String(req.query.tab ?? "active");
    const tab = (raw in PROMOTION_TABS ? raw : "active") as PromotionTab;
    const { page, limit } = pageOf(req);
    const result = await listShopPromotions(shop._id as Types.ObjectId, tab, page, limit);
    const now = new Date();
    const response = BaseResponse.WithSuccess(
      {
        promotions: await withDetails(result.items, now),
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        counts: result.counts,
        // Promotions suspendues par la modération : la date de fin, sinon null.
        promotionsBlockedUntil: shop.promotionsBlockedUntil && shop.promotionsBlockedUntil > now ? shop.promotionsBlockedUntil : null,
      },
      "Promotions de la boutique récupérées avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur liste des promotions de boutique");
  }
};

/** POST /shops/:id/promotions */
export const createPromotionOfShop = async (req: Request, res: Response) => {
  if (invalid(req, res)) return;
  try {
    const promo = await createShopPromotion(req.user, String(req.params.id), req.body as ShopPromotionBody);
    const [dto] = await withDetails([promo], new Date());
    const message =
      promo.status === "draft" ? "Brouillon enregistré." : promo.status === "active" ? "Promotion lancée : elle est en ligne." : "Promotion programmée.";
    const response = BaseResponse.Created(dto, message);
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur création de promotion");
  }
};

/** GET /shops/:id/promotions/:promotionId */
export const getPromotionOfShop = async (req: Request, res: Response) => {
  try {
    const { promo } = await managedPromotion(req.user, String(req.params.promotionId));
    if (String(promo.boutiqueId) !== String(req.params.id)) throw new HttpError("Promotion introuvable.", 404);
    const [dto] = await withDetails([promo], new Date());
    const response = BaseResponse.WithSuccess(dto, "Promotion récupérée avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur lecture de promotion");
  }
};

/** PUT /shops/:id/promotions/:promotionId — brouillon ou programmée seulement. */
export const updatePromotionOfShop = async (req: Request, res: Response) => {
  if (invalid(req, res)) return;
  try {
    const { promo: current } = await managedPromotion(req.user, String(req.params.promotionId));
    if (String(current.boutiqueId) !== String(req.params.id)) throw new HttpError("Promotion introuvable.", 404);
    const promo = await updateShopPromotion(req.user, String(req.params.promotionId), req.body as ShopPromotionBody);
    const [dto] = await withDetails([promo], new Date());
    const response = BaseResponse.WithSuccess(dto, "Promotion modifiée.");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur modification de promotion");
  }
};

const ACTION_MESSAGES: Record<string, string> = {
  launch: "Promotion lancée.",
  pause: "Promotion en pause : les prix reviennent à la normale.",
  resume: "Promotion reprise.",
  extend: "Promotion prolongée.",
  stop: "Promotion arrêtée.",
};

/** PATCH /promotions/:id/:action  (launch, pause, resume, extend, stop) — promotions de boutique. */
export const promotionActionOfShop = async (req: Request, res: Response) => {
  if (invalid(req, res)) return;
  try {
    const action = String(req.params.action);
    if (!isPromotionAction(action)) throw new HttpError("Action inconnue.", 404);
    const promo = await applyPromotionAction(req.user, String(req.params.id), action, req.body ?? {});
    const [dto] = await withDetails([promo], new Date());
    const message = action === "launch" && promo.status === "scheduled" ? "Promotion programmée." : ACTION_MESSAGES[action]!;
    const response = BaseResponse.WithSuccess(dto, message);
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur action sur une promotion");
  }
};
