import { Router } from "express";
import { requireAuth, requireRole, requireSelf } from "../../shared/middlewares/auth.middleware.js";
import { EntityType } from "../../models/user.model.js";
import {
  createReview,
  deleteReview,
  getReviewById,
  getReviews,
  getReviewSummary,
  updateReview,
} from "../../controllers/review.controller.js";
import {
  createReviewForm,
  productBoutiqueIdParam,
  reviewIdParam,
  updateReviewForm,
} from "../../shared/forms/review.form.js";

const reviewRouter = Router();

/**
 * @swagger
 * /reviews:
 *   post:
 *     tags: [Review]
 *     summary: Publier un avis sur un produit en boutique
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, productBoutiqueId, rating]
 *             properties:
 *               userId: { type: string, example: 665f1a2b3c4d5e6f7a8b9c0d }
 *               productBoutiqueId: { type: string, example: 665f1a2b3c4d5e6f7a8b9c0e }
 *               rating: { type: integer, minimum: 1, maximum: 5, example: 4 }
 *               comment: { type: string, example: Très bon produit, livraison rapide. }
 *     responses:
 *       201:
 *         description: Avis publié
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Utilisateur ou produit en boutique introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       409:
 *         description: Avis déjà existant pour ce produit
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
reviewRouter.post("/", requireAuth, requireSelf("body", "userId"), createReviewForm, createReview);

/**
 * @swagger
 * /reviews:
 *   get:
 *     tags: [Review]
 *     summary: Lister les avis
 *     parameters:
 *       - in: query
 *         name: productBoutiqueId
 *         schema: { type: string }
 *         description: Filtrer par produit en boutique
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *         description: Filtrer par auteur
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Liste des avis
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 */
reviewRouter.get("/", getReviews);

/**
 * @swagger
 * /reviews/summary/{productBoutiqueId}:
 *   get:
 *     tags: [Review]
 *     summary: Résumé des notes d'un produit (moyenne, total, répartition)
 *     parameters:
 *       - in: path
 *         name: productBoutiqueId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Résumé des avis
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 */
reviewRouter.get("/summary/:productBoutiqueId", productBoutiqueIdParam, getReviewSummary);

/**
 * @swagger
 * /reviews/{id}:
 *   get:
 *     tags: [Review]
 *     summary: Récupérer un avis par ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Avis trouvé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Avis non trouvé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
reviewRouter.get("/:id", reviewIdParam, getReviewById);

/**
 * @swagger
 * /reviews/{id}:
 *   put:
 *     tags: [Review]
 *     summary: Modifier son avis
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
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string }
 *     responses:
 *       200:
 *         description: Avis mis à jour
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Avis non trouvé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
reviewRouter.put("/:id", requireAuth, updateReviewForm, updateReview);

/**
 * @swagger
 * /reviews/{id}:
 *   delete:
 *     tags: [Review]
 *     summary: Supprimer un avis (soft delete)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Avis supprimé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Avis non trouvé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
reviewRouter.delete("/:id", requireAuth, reviewIdParam, deleteReview);

export default reviewRouter;
