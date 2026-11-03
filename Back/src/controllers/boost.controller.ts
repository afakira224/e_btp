import type { Request, Response } from "express";
import { Types } from "mongoose";
import { Boost, BoostStat, BoostStatus, type IBoost } from "../models/boost.model.js";
import { CreditLedger, CreditPurchase, CreditPurchaseStatus, CreditReason } from "../models/credit.model.js";
import { Promotion } from "../models/promotion.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import { enrichProductBoutiques } from "../shared/helpers/productBoutique.helper.js";
import { invalid, pageOf, sendError } from "../shared/helpers/http.helper.js";
import { offerSummaries, pick } from "../shared/helpers/offerSummary.helper.js";
import { viewerOf } from "../shared/helpers/viewer.helper.js";
import { HttpError } from "../shared/middlewares/error.middleware.js";
import { getPaymentProvider, isSandboxPayment } from "../shared/payment/payment.provider.js";
import logger from "../shared/logger/logger.js";
import {
  applyBoostAction,
  BOOST_ACTIONS,
  boostTotals,
  createBoost,
  EMPTY_TOTALS,
  estimateBoost,
  getBoostSettings,
  managedBoost,
  minDailyBudget,
  moveCredits,
  SLOT_PLACES,
  sponsoredOffers,
  updateBoostSettings,
  type BoostAction,
  type BoostInput,
  type SponsoredSlot,
} from "../shared/services/boost.service.js";
import { managedShop } from "../shared/services/promotion.service.js";
import { toBoostDto } from "../shared/interfaces/Boost.interfaces.js";

// ─────────────────────────────────────────────
//  Boosts de promotion et de produit, crédits, places sponsorisées.
// ─────────────────────────────────────────────

const withDetails = async (boosts: IBoost[], daily = false) => {
  const [totals, offers, promos] = await Promise.all([
    boostTotals(boosts.map((boost) => boost._id)),
    offerSummaries(boosts.flatMap((boost) => boost.productBoutiqueIds)),
    Promotion.find({ _id: { $in: boosts.flatMap((boost) => (boost.promotionId ? [boost.promotionId] : [])) } }),
  ]);
  const rows = daily ? await BoostStat.find({ boostId: { $in: boosts.map((boost) => boost._id) } }).sort({ day: 1 }) : [];
  return boosts.map((boost) => {
    const promo = promos.find((candidate) => String(candidate._id) === String(boost.promotionId));
    return toBoostDto(boost, totals.get(String(boost._id)) ?? EMPTY_TOTALS, {
      offers: pick(offers, boost.productBoutiqueIds),
      ...(promo ? { promotion: { id: String(promo._id), nom: promo.nom, endDate: promo.endDate } } : {}),
      ...(daily
        ? {
            daily: rows
              .filter((row) => String(row.boostId) === String(boost._id))
              .map((row) => ({
                day: row.day,
                impressions: row.impressions,
                reach: row.reach,
                visits: row.visits,
                carts: row.carts,
                orders: row.orders,
                revenue: row.revenue,
                spent: row.spent,
              })),
          }
        : {}),
    });
  });
};

const boostInput = (body: Record<string, unknown>): BoostInput => ({
  kind: body.kind as BoostInput["kind"],
  promotionId: body.promotionId ? String(body.promotionId) : undefined,
  productBoutiqueIds: Array.isArray(body.productBoutiqueIds) ? body.productBoutiqueIds.map(String) : undefined,
  goal: body.goal as BoostInput["goal"],
  audience: (body.audience ?? undefined) as BoostInput["audience"],
  dailyBudget: Number(body.dailyBudget),
  days: Number(body.days),
});

/** POST /shops/:id/boosts/estimate — audience et résultats estimés, avant de lancer. */
export const estimateBoostHandler = async (req: Request, res: Response) => {
  if (invalid(req, res)) return;
  try {
    const estimate = await estimateBoost(req.user, String(req.params.id), boostInput(req.body));
    const response = BaseResponse.WithSuccess(estimate, "Estimation calculée");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur estimation de boost");
  }
};

/** POST /shops/:id/boosts — lance un boost : le budget est réservé sur les crédits. */
export const createBoostHandler = async (req: Request, res: Response) => {
  if (invalid(req, res)) return;
  try {
    const boost = await createBoost(req.user, String(req.params.id), boostInput(req.body));
    const [dto] = await withDetails([boost]);
    const response = BaseResponse.Created(dto, "Boost lancé : vos produits sont mis en avant.");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur lancement de boost");
  }
};

/** GET /shops/:id/boosts?tab=active|ended&page= */
export const listBoostsOfShop = async (req: Request, res: Response) => {
  try {
    const shop = await managedShop(req.user, String(req.params.id));
    const ended = req.query.tab === "ended";
    const { page, limit } = pageOf(req);
    const statuses = ended ? [BoostStatus.ENDED, BoostStatus.STOPPED] : [BoostStatus.ACTIVE, BoostStatus.PAUSED];
    const filter = { boutiqueId: shop._id, status: { $in: statuses } };
    const [boosts, total, activeCount, endedCount] = await Promise.all([
      Boost.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Boost.countDocuments(filter),
      Boost.countDocuments({ boutiqueId: shop._id, status: { $in: [BoostStatus.ACTIVE, BoostStatus.PAUSED] } }),
      Boost.countDocuments({ boutiqueId: shop._id, status: { $in: [BoostStatus.ENDED, BoostStatus.STOPPED] } }),
    ]);
    const response = BaseResponse.WithSuccess(
      { boosts: await withDetails(boosts), total, page, totalPages: Math.ceil(total / limit), counts: { active: activeCount, ended: endedCount } },
      "Boosts de la boutique récupérés avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur liste des boosts");
  }
};

/** GET /boosts/:id — un boost et ses statistiques jour par jour. */
export const getBoostHandler = async (req: Request, res: Response) => {
  try {
    const boost = await managedBoost(req.user, String(req.params.id));
    const [dto] = await withDetails([boost], true);
    const response = BaseResponse.WithSuccess(dto, "Boost récupéré avec succès");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur lecture de boost");
  }
};

const BOOST_MESSAGES: Record<BoostAction, string> = {
  pause: "Boost en pause : vos produits ne sont plus montrés.",
  resume: "Boost repris.",
  stop: "Boost arrêté : le budget non dépensé est rendu en crédits.",
};

/** PATCH /boosts/:id/:action  (pause, resume, stop) */
export const boostActionHandler = async (req: Request, res: Response) => {
  try {
    const action = String(req.params.action);
    if (!(BOOST_ACTIONS as readonly string[]).includes(action)) throw new HttpError("Action inconnue.", 404);
    const boost = await applyBoostAction(req.user, String(req.params.id), action as BoostAction);
    const [dto] = await withDetails([boost]);
    const response = BaseResponse.WithSuccess(dto, BOOST_MESSAGES[action as BoostAction]);
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur action sur un boost");
  }
};

// ── Crédits ─────────────────────────────────

/** GET /shops/:id/credits — solde, derniers mouvements, prix en vigueur. */
export const creditsOfShop = async (req: Request, res: Response) => {
  try {
    const shop = await managedShop(req.user, String(req.params.id));
    const settings = await getBoostSettings();
    const ledger = await CreditLedger.find({ boutiqueId: shop._id }).sort({ createdAt: -1 }).limit(50);
    const response = BaseResponse.WithSuccess(
      {
        balance: shop.boostCredits ?? 0,
        settings: {
          costPerVisit: settings.costPerVisit,
          costPerThousandViews: settings.costPerThousandViews,
          monthlyCredits: settings.monthlyCredits,
          minDailyBudget: minDailyBudget(settings),
          minAudience: settings.minAudience,
        },
        ledger: ledger.map((row) => ({
          id: String(row._id),
          delta: row.delta,
          balanceAfter: row.balanceAfter,
          reason: row.reason,
          label: row.label,
          createdAt: row.createdAt,
        })),
      },
      "Crédits récupérés avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur lecture des crédits");
  }
};

/** POST /shops/:id/credits { amount } — recharge par le prestataire de paiement (mobile money). */
/** Une recharge : la page de paiement simulée en affiche le montant. */
export const getCreditPurchase = async (req: Request, res: Response) => {
  try {
    const shop = await managedShop(req.user, String(req.params.id));
    const purchaseId = String(req.params.purchaseId);
    const purchase = Types.ObjectId.isValid(purchaseId)
      ? await CreditPurchase.findOne({ _id: purchaseId, boutiqueId: shop._id })
      : null;
    if (!purchase) throw new HttpError("Recharge introuvable.", 404);
    const response = BaseResponse.WithSuccess(
      { purchaseId: String(purchase._id), amount: purchase.amount, status: purchase.status },
      "Recharge récupérée"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur lecture d'une recharge");
  }
};

export const rechargeCredits = async (req: Request, res: Response) => {
  if (invalid(req, res)) return;
  try {
    const shop = await managedShop(req.user, String(req.params.id));
    const provider = getPaymentProvider();
    if (!provider) throw new HttpError("Le paiement en ligne n'est pas encore disponible.", 400);
    const amount = Math.round(Number(req.body.amount));
    const purchase = await CreditPurchase.create({
      boutiqueId: shop._id,
      amount,
      createdBy: req.user?.id ? new Types.ObjectId(req.user.id) : null,
    });
    // La page de paiement simulée lit la boutique et la recharge dans cet identifiant.
    const initiation = await provider.initiate({
      orderId: `credits-${String(shop._id)}-${String(purchase._id)}`,
      reference: `CRD-${String(purchase._id).slice(-8)}`,
      amount,
    });
    purchase.providerRef = initiation.providerRef;
    await purchase.save();
    const response = BaseResponse.Created(
      { purchaseId: String(purchase._id), amount, status: purchase.status, redirectUrl: initiation.redirectUrl },
      "Recharge lancée : il reste à payer."
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur recharge de crédits");
  }
};

/**
 * POST /shops/:id/credits/:purchaseId/sandbox { outcome: paid | failed }
 * Rôle de la notification signée d'un vrai prestataire ; désactivé hors bac à sable.
 */
export const settleSandboxCredits = async (req: Request, res: Response) => {
  if (invalid(req, res)) return;
  try {
    if (!isSandboxPayment()) throw new HttpError("Paiement simulé indisponible.", 404);
    const shop = await managedShop(req.user, String(req.params.id));
    const purchase = await CreditPurchase.findOne({ _id: String(req.params.purchaseId), boutiqueId: shop._id });
    if (!purchase) throw new HttpError("Recharge introuvable.", 404);
    if (purchase.status !== CreditPurchaseStatus.PENDING) throw new HttpError("Cette recharge est déjà réglée.", 409);
    // Écriture conditionnelle : deux règlements simultanés (double envoi,
    // notification rejouée) ne créditent qu'une fois.
    const paid = req.body.outcome === "paid";
    const changes = paid ? { status: CreditPurchaseStatus.PAID, paidAt: new Date() } : { status: CreditPurchaseStatus.FAILED };
    const written = await CreditPurchase.updateOne({ _id: purchase._id, status: CreditPurchaseStatus.PENDING }, { $set: changes });
    if ((written as { modifiedCount?: number } | undefined)?.modifiedCount === 0) throw new HttpError("Cette recharge est déjà réglée.", 409);
    Object.assign(purchase, changes);
    if (paid) {
      await moveCredits(shop._id, purchase.amount, CreditReason.RECHARGE, "Recharge par mobile money", String(purchase._id));
      logger.info(`Recharge de ${purchase.amount} GNF pour ${shop.nom}`);
    }
    const fresh = await managedShop(req.user, String(req.params.id));
    const response = BaseResponse.WithSuccess(
      { purchaseId: String(purchase._id), status: purchase.status, balance: fresh.boostCredits ?? 0 },
      paid ? "Crédits ajoutés à votre portefeuille." : "Paiement refusé : aucun crédit ajouté."
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur règlement de recharge");
  }
};

// ── Places sponsorisées ─────────────────────

const SLOTS = Object.keys(SLOT_PLACES) as SponsoredSlot[];

/** GET /sponsored?slot=home|search|category|similar|promotions&q=&familleId=&categoryId=&sousCategoryId=&offerId= */
export const sponsoredHandler = async (req: Request, res: Response) => {
  try {
    const slot = String(req.query.slot ?? "home") as SponsoredSlot;
    if (!SLOTS.includes(slot)) throw new HttpError("Emplacement inconnu.", 400);
    const text = (key: string) => (typeof req.query[key] === "string" ? String(req.query[key]) : undefined);
    const picked = await sponsoredOffers({
      slot,
      viewer: viewerOf(req),
      q: text("q"),
      familleId: text("familleId"),
      categoryId: text("categoryId"),
      sousCategoryId: text("sousCategoryId"),
      offerId: text("offerId"),
    });
    const dtos = await enrichProductBoutiques(picked.map((entry) => entry.offer));
    const response = BaseResponse.WithSuccess(
      dtos.map((dto, index) => ({
        ...dto,
        sponsored: { boostId: String(picked[index]!.boost._id), kind: picked[index]!.boost.kind, why: whyShown(picked[index]!.boost, dto) },
      })),
      "Produits sponsorisés"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur produits sponsorisés");
  }
};

/** « Pourquoi je vois ceci ? » */
const whyShown = (boost: IBoost, dto: { boutique?: { nom: string } | undefined }): string => {
  const shop = dto.boutique?.nom ?? "Cette boutique";
  const zones = [...boost.audience.communes, ...boost.audience.villes];
  const where = boost.audience.mode === "custom" && zones.length > 0 ? `, à ${zones.join(", ")}` : "";
  return `${shop} paie pour montrer ce produit aux clients intéressés par ce type d'article${where}.`;
};

// ── Administration ──────────────────────────

/** GET /boosts?status=&page= — administration : tous les boosts. */
export const listAllBoosts = async (req: Request, res: Response) => {
  try {
    const { page, limit } = pageOf(req);
    const status = typeof req.query.status === "string" && (Object.values(BoostStatus) as string[]).includes(req.query.status) ? (req.query.status as BoostStatus) : undefined;
    const filter = { status: { $in: status ? [status] : [BoostStatus.ACTIVE, BoostStatus.PAUSED] } };
    const [boosts, total] = await Promise.all([Boost.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Boost.countDocuments(filter)]);
    const response = BaseResponse.WithSuccess(
      { boosts: await withDetails(boosts), total, page, totalPages: Math.ceil(total / limit) },
      "Boosts récupérés avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur liste des boosts (admin)");
  }
};

/** GET /boosts/settings · PUT /boosts/settings — prix de la visite, des 1 000 affichages, crédits offerts. */
export const getBoostSettingsHandler = async (_req: Request, res: Response) => {
  try {
    const settings = await getBoostSettings();
    const response = BaseResponse.WithSuccess({ ...settings, minDailyBudget: minDailyBudget(settings) }, "Réglages des boosts");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur réglages des boosts");
  }
};

export const updateBoostSettingsHandler = async (req: Request, res: Response) => {
  if (invalid(req, res)) return;
  try {
    const settings = await updateBoostSettings({
      costPerVisit: req.body.costPerVisit,
      costPerThousandViews: req.body.costPerThousandViews,
      monthlyCredits: req.body.monthlyCredits,
      minVisitsPerDay: req.body.minVisitsPerDay,
    });
    const response = BaseResponse.WithSuccess({ ...settings, minDailyBudget: minDailyBudget(settings) }, "Réglages enregistrés : ils valent pour les prochains boosts.");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur réglages des boosts");
  }
};
