import { Router } from "express";
import { EntityType } from "../../models/user.model.js";
import { requireAuth, requireRole } from "../../shared/middlewares/auth.middleware.js";
import {
  createPromotionOfShop,
  getPromotionOfShop,
  listPromotionsOfShop,
  updatePromotionOfShop,
} from "../../controllers/shopPromotion.controller.js";
import {
  createBoostHandler,
  creditsOfShop,
  getCreditPurchase,
  estimateBoostHandler,
  listBoostsOfShop,
  rechargeCredits,
  settleSandboxCredits,
} from "../../controllers/boost.controller.js";
import {
  boostForm,
  rechargeForm,
  sandboxCreditsForm,
  shopIdParam,
  shopPromotionForm,
  shopPromotionUpdateForm,
} from "../../shared/forms/marketing.form.js";

// ─────────────────────────────────────────────
//  /shops/:id/… — promotions, boosts et crédits d'une boutique.
//  Réservé à son gérant et à l'administration (contrôlé par le service).
// ─────────────────────────────────────────────
const shopMarketingRouter = Router();
const manager = [requireAuth, requireRole(EntityType.SHOP, EntityType.ADMIN)];

/**
 * @swagger
 * /shops/{id}/promotions:
 *   get:
 *     summary: Promotions de la boutique par onglet (active, scheduled, ended), avec leurs ventes
 *     tags: [Promotions]
 *   post:
 *     summary: Créer une promotion (remise produit, promotion boutique, code, vente flash, paliers, livraison offerte) — lancée, programmée ou en brouillon, sans validation
 *     tags: [Promotions]
 */
shopMarketingRouter.get("/:id/promotions", ...manager, shopIdParam, listPromotionsOfShop);
shopMarketingRouter.post("/:id/promotions", ...manager, shopPromotionForm, createPromotionOfShop);
shopMarketingRouter.get("/:id/promotions/:promotionId", ...manager, shopIdParam, getPromotionOfShop);
shopMarketingRouter.put("/:id/promotions/:promotionId", ...manager, shopPromotionUpdateForm, updatePromotionOfShop);

/**
 * @swagger
 * /shops/{id}/boosts:
 *   get:
 *     summary: Boosts de la boutique (tab=active|ended) et leurs statistiques
 *     tags: [Boosts]
 *   post:
 *     summary: Lancer un boost de promotion ou de produit ; le budget est réservé sur les crédits
 *     tags: [Boosts]
 * /shops/{id}/boosts/estimate:
 *   post:
 *     summary: Audience et résultats estimés d'un boost, avant de le lancer
 *     tags: [Boosts]
 */
shopMarketingRouter.get("/:id/boosts", ...manager, shopIdParam, listBoostsOfShop);
shopMarketingRouter.post("/:id/boosts/estimate", ...manager, boostForm, estimateBoostHandler);
shopMarketingRouter.post("/:id/boosts", ...manager, boostForm, createBoostHandler);

/**
 * @swagger
 * /shops/{id}/credits:
 *   get:
 *     summary: Solde des crédits de boost, derniers mouvements, prix en vigueur
 *     tags: [Boosts]
 *   post:
 *     summary: Recharger ses crédits par le prestataire de paiement
 *     tags: [Boosts]
 */
shopMarketingRouter.get("/:id/credits", ...manager, shopIdParam, creditsOfShop);
shopMarketingRouter.post("/:id/credits", ...manager, rechargeForm, rechargeCredits);
shopMarketingRouter.get("/:id/credits/:purchaseId", ...manager, shopIdParam, getCreditPurchase);
shopMarketingRouter.post("/:id/credits/:purchaseId/sandbox", ...manager, sandboxCreditsForm, settleSandboxCredits);

export default shopMarketingRouter;
