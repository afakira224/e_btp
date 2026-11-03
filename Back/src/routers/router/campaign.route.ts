import { Router } from "express";
import { EntityType } from "../../models/user.model.js";
import { requireAuth, requireRole } from "../../shared/middlewares/auth.middleware.js";
import { createCampaign, getCampaign, joinCampaignHandler, listCampaigns, updateCampaign } from "../../controllers/campaign.controller.js";
import { campaignEntryForm, campaignForm, campaignUpdateForm } from "../../shared/forms/marketing.form.js";

const campaignRouter = Router();
const adminOnly = [requireAuth, requireRole(EntityType.ADMIN)];

/**
 * @swagger
 * /campaigns:
 *   get:
 *     summary: Campagnes de la plateforme en cours et à venir (all=true pour l'administration)
 *     tags: [Campagnes]
 *   post:
 *     summary: Créer une campagne — administration
 *     tags: [Campagnes]
 * /campaigns/{slug}:
 *   get:
 *     summary: Une campagne et ses offres en vigueur
 *     tags: [Campagnes]
 * /campaigns/{id}/entries:
 *   post:
 *     summary: Une boutique inscrit ses offres, avec la remise minimale de la campagne au moins
 *     tags: [Campagnes]
 */
campaignRouter.get("/", listCampaigns);
campaignRouter.post("/", ...adminOnly, campaignForm, createCampaign);
campaignRouter.get("/:slug", getCampaign);
campaignRouter.put("/:id", ...adminOnly, campaignUpdateForm, updateCampaign);
campaignRouter.post("/:id/entries", requireAuth, requireRole(EntityType.SHOP, EntityType.ADMIN), campaignEntryForm, joinCampaignHandler);

export default campaignRouter;
