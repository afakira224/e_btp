import { Router } from "express";
import { requireAuth, requireRole, requireSelf } from "../../shared/middlewares/auth.middleware.js";
import { EntityType } from "../../models/user.model.js";
import {
  applyCoupon,
  createPromotion,
  deletePromotion,
  getActiveFlashSales,
  getPromotionById,
  getPromotions,
  updatePromotion,
} from "../../controllers/promotion.controller.js";
import {
  applyCouponForm,
  createPromotionForm,
  promotionIdParam,
  updatePromotionForm,
} from "../../shared/forms/promotion.form.js";

const promotionRouter = Router();

/**
 * @swagger
 * /promotions:
 *   post:
 *     tags: [Promotion]
 *     summary: Créer une promotion (coupon ou vente flash)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, type, scope, discountValue, startDate, endDate]
 *             properties:
 *               nom: { type: string, example: Soldes de rentrée }
 *               description: { type: string }
 *               type: { type: string, enum: [coupon, flash_sale], example: coupon }
 *               scope: { type: string, enum: [product_boutique, cart], example: cart }
 *               discountType: { type: string, enum: [percentage, fixed], default: percentage }
 *               discountValue: { type: number, example: 20, description: "20 = -20% si percentage" }
 *               code: { type: string, example: RENTREE20, description: "Requis si type = coupon" }
 *               startDate: { type: string, format: date-time }
 *               endDate: { type: string, format: date-time }
 *               productBoutiqueIds:
 *                 type: array
 *                 items: { type: string }
 *                 description: "Requis si scope = product_boutique"
 *               minAmount: { type: number, example: 500000, description: "Seuil minimum (scope = cart)" }
 *               maxDiscount: { type: number, example: 100000, description: "Plafond de réduction" }
 *               usageLimit: { type: integer, example: 100 }
 *               actif: { type: boolean, default: true }
 *     responses:
 *       201:
 *         description: Promotion créée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: Requête invalide (dates, pourcentage, code ou cible manquants)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       409:
 *         description: Code promotionnel déjà utilisé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
promotionRouter.post("/", requireAuth, requireRole(EntityType.ADMIN), createPromotionForm, createPromotion);

/**
 * @swagger
 * /promotions:
 *   get:
 *     tags: [Promotion]
 *     summary: Lister les promotions
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [coupon, flash_sale] }
 *       - in: query
 *         name: scope
 *         schema: { type: string, enum: [product_boutique, cart] }
 *       - in: query
 *         name: actif
 *         schema: { type: boolean }
 *       - in: query
 *         name: activeNow
 *         schema: { type: boolean }
 *         description: Ne renvoyer que les promotions actuellement actives
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Liste des promotions
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 */
promotionRouter.get("/", getPromotions);

/**
 * @swagger
 * /promotions/apply:
 *   post:
 *     tags: [Promotion]
 *     summary: Valider un coupon et calculer la réduction sur le panier
 *     description: Ne modifie pas le panier ; renvoie un aperçu (total avant/après, montant remisé).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, code]
 *             properties:
 *               userId: { type: string, example: 665f1a2b3c4d5e6f7a8b9c0d }
 *               code: { type: string, example: RENTREE20 }
 *     responses:
 *       200:
 *         description: Coupon valide, aperçu de la réduction
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: Coupon invalide, panier vide ou non éligible
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       404:
 *         description: Coupon introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
promotionRouter.post("/apply", requireAuth, requireSelf("body", "userId"), applyCouponForm, applyCoupon);

/**
 * @swagger
 * /promotions/flash/active:
 *   get:
 *     tags: [Promotion]
 *     summary: Lister les ventes flash actuellement actives
 *     responses:
 *       200:
 *         description: Ventes flash actives
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 */
promotionRouter.get("/flash/active", getActiveFlashSales);

/**
 * @swagger
 * /promotions/{id}:
 *   get:
 *     tags: [Promotion]
 *     summary: Récupérer une promotion par ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Promotion trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Promotion non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
promotionRouter.get("/:id", promotionIdParam, getPromotionById);

/**
 * @swagger
 * /promotions/{id}:
 *   put:
 *     tags: [Promotion]
 *     summary: Mettre à jour une promotion
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom: { type: string }
 *               description: { type: string }
 *               type: { type: string, enum: [coupon, flash_sale] }
 *               scope: { type: string, enum: [product_boutique, cart] }
 *               discountType: { type: string, enum: [percentage, fixed] }
 *               discountValue: { type: number }
 *               code: { type: string }
 *               startDate: { type: string, format: date-time }
 *               endDate: { type: string, format: date-time }
 *               productBoutiqueIds:
 *                 type: array
 *                 items: { type: string }
 *               minAmount: { type: number }
 *               maxDiscount: { type: number }
 *               usageLimit: { type: integer }
 *               actif: { type: boolean }
 *     responses:
 *       200:
 *         description: Promotion mise à jour
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Promotion non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
promotionRouter.put("/:id", requireAuth, requireRole(EntityType.ADMIN), updatePromotionForm, updatePromotion);

/**
 * @swagger
 * /promotions/{id}:
 *   delete:
 *     tags: [Promotion]
 *     summary: Supprimer une promotion (soft delete)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Promotion supprimée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Promotion non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
promotionRouter.delete("/:id", requireAuth, requireRole(EntityType.ADMIN), promotionIdParam, deletePromotion);

export default promotionRouter;
