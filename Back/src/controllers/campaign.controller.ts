import type { Request, Response } from "express";
import { Types } from "mongoose";
import { Campaign, type ICampaign } from "../models/campaign.model.js";
import { productBoutique } from "../models/product.model.js";
import { EntityType } from "../models/user.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import { enrichProductBoutiques } from "../shared/helpers/productBoutique.helper.js";
import { invalid, sendError } from "../shared/helpers/http.helper.js";
import { HttpError } from "../shared/middlewares/error.middleware.js";
import { campaignOfferIds, campaignState, checkCampaignInput, joinCampaign } from "../shared/services/promotion.service.js";
import { toShopPromotionDto } from "../shared/interfaces/ShopPromotion.interfaces.js";

// ─────────────────────────────────────────────
//  Campagnes de la plateforme : « Soldes », « Rentrée chantier »…
//  L'administration les crée ; une boutique y inscrit ses offres seule.
// ─────────────────────────────────────────────

const toCampaignDto = (campaign: ICampaign, now: Date, offerCount?: number) => ({
  id: String(campaign._id),
  slug: campaign.slug,
  nom: campaign.nom,
  ...(campaign.description ? { description: campaign.description } : {}),
  startDate: campaign.startDate,
  endDate: campaign.endDate,
  minDiscount: campaign.minDiscount,
  familleIds: campaign.familleIds.map(String),
  image: campaign.image ?? null,
  actif: campaign.actif,
  state: campaignState(campaign, now),
  ...(offerCount !== undefined ? { offerCount } : {}),
});

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

/** GET /campaigns — en cours et à venir ; l'administration voit tout (?all=true). */
export const listCampaigns = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const admin = req.session?.user?.entityType === EntityType.ADMIN && req.query.all === "true";
    const campaigns = await Campaign.find(admin ? {} : { actif: true, endDate: { $gte: now } }).sort({ startDate: 1 });
    const enrolled = await campaignOfferIds(campaigns.map((campaign) => campaign._id as Types.ObjectId), now);
    const visible = await productBoutique
      .find({ _id: { $in: [...enrolled.values()].flat() }, hiddenAt: null })
      .select("_id");
    const visibleIds = new Set(visible.map((offer) => String(offer._id)));
    const countOf = (campaign: ICampaign) =>
      new Set((enrolled.get(String(campaign._id)) ?? []).map(String).filter((id) => visibleIds.has(id))).size;
    const response = BaseResponse.WithSuccess(
      campaigns.map((campaign) => toCampaignDto(campaign, now, countOf(campaign))),
      "Campagnes récupérées avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur liste des campagnes");
  }
};

/** GET /campaigns/:slug — la campagne et ses offres en vigueur. */
export const getCampaign = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const key = String(req.params.slug);
    const campaign = await Campaign.findOne(Types.ObjectId.isValid(key) ? { _id: key } : { slug: key });
    if (!campaign) throw new HttpError("Campagne introuvable.", 404);
    const ids = (await campaignOfferIds([campaign._id as Types.ObjectId], now)).get(String(campaign._id)) ?? [];
    const offers = await productBoutique.find({ _id: { $in: ids }, hiddenAt: null, stock: { $gt: 0 } }).sort({ "promo.percent": -1 }).limit(60);
    const response = BaseResponse.WithSuccess(
      { ...toCampaignDto(campaign, now, offers.length), offers: await enrichProductBoutiques(offers) },
      "Campagne récupérée avec succès"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur lecture de campagne");
  }
};

/** POST /campaigns — administration. */
export const createCampaign = async (req: Request, res: Response) => {
  if (invalid(req, res)) return;
  try {
    const startDate = new Date(req.body.startDate);
    const endDate = new Date(req.body.endDate);
    const minDiscount = Number(req.body.minDiscount);
    const refusal = checkCampaignInput({ startDate, endDate, minDiscount });
    if (refusal) throw new HttpError(refusal, 400);
    const slug = slugify(req.body.slug || req.body.nom);
    if (await Campaign.findOne({ slug })) throw new HttpError("Une campagne porte déjà ce nom : choisissez-en un autre.", 409);
    const campaign = await Campaign.create({
      slug,
      nom: String(req.body.nom).trim(),
      description: req.body.description?.trim() || undefined,
      startDate,
      endDate,
      minDiscount,
      familleIds: (req.body.familleIds ?? []).map((id: string) => new Types.ObjectId(id)),
      image: req.body.image ?? null,
      actif: true,
      createdBy: req.user?.id ? new Types.ObjectId(req.user.id) : null,
    });
    const response = BaseResponse.Created(toCampaignDto(campaign, new Date(), 0), "Campagne créée.");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur création de campagne");
  }
};

/** PUT /campaigns/:id — administration : nom, dates, description, actif. */
export const updateCampaign = async (req: Request, res: Response) => {
  if (invalid(req, res)) return;
  try {
    const campaign = await Campaign.findById(String(req.params.id));
    if (!campaign) throw new HttpError("Campagne introuvable.", 404);
    if (req.body.nom !== undefined) campaign.nom = String(req.body.nom).trim();
    if (req.body.description !== undefined) campaign.description = String(req.body.description).trim();
    if (req.body.startDate !== undefined) campaign.startDate = new Date(req.body.startDate);
    if (req.body.endDate !== undefined) campaign.endDate = new Date(req.body.endDate);
    if (req.body.minDiscount !== undefined) campaign.minDiscount = Number(req.body.minDiscount);
    if (req.body.actif !== undefined) campaign.actif = Boolean(req.body.actif);
    const refusal = checkCampaignInput(campaign);
    if (refusal) throw new HttpError(refusal, 400);
    await campaign.save();
    const response = BaseResponse.WithSuccess(toCampaignDto(campaign, new Date()), "Campagne modifiée.");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur modification de campagne");
  }
};

/** POST /campaigns/:id/entries — une boutique inscrit ses offres, seule. */
export const joinCampaignHandler = async (req: Request, res: Response) => {
  if (invalid(req, res)) return;
  try {
    const promo = await joinCampaign(req.user, String(req.params.id), {
      boutiqueId: String(req.body.boutiqueId),
      productBoutiqueIds: req.body.productBoutiqueIds,
      discountValue: Number(req.body.discountValue),
      confirmHighDiscount: Boolean(req.body.confirmHighDiscount),
    });
    const response = BaseResponse.Created(toShopPromotionDto(promo), "Offres inscrites à la campagne.");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur inscription à une campagne");
  }
};
