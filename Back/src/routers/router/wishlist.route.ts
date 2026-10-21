import { Router } from "express";
import { requireAuth, requireRole, requireSelf } from "../../shared/middlewares/auth.middleware.js";
import { EntityType } from "../../models/user.model.js";
import {
  addToWishlist,
  clearWishlist,
  getWishlist,
  removeFromWishlist,
} from "../../controllers/wishlist.controller.js";
import {
  addToWishlistForm,
  wishlistItemParams,
  wishlistUserIdParam,
} from "../../shared/forms/wishlist.form.js";

const wishlistRouter = Router();

/**
 * @swagger
 * /wishlist/{userId}:
 *   get:
 *     tags: [Wishlist]
 *     summary: Récupérer la liste de favoris d'un utilisateur
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *         example: 665f1a2b3c4d5e6f7a8b9c0d
 *     responses:
 *       200:
 *         description: Favoris récupérés (vide si aucun favori n'existe encore)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 */
wishlistRouter.get("/:userId", requireAuth, requireSelf(), wishlistUserIdParam, getWishlist);

/**
 * @swagger
 * /wishlist/{userId}/items:
 *   post:
 *     tags: [Wishlist]
 *     summary: Ajouter un produit aux favoris (idempotent)
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productBoutiqueId]
 *             properties:
 *               productBoutiqueId: { type: string, example: 665f1a2b3c4d5e6f7a8b9c0e }
 *     responses:
 *       200:
 *         description: Produit ajouté (ou déjà présent), favoris retournés
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Utilisateur ou produit en boutique introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
wishlistRouter.post("/:userId/items", requireAuth, requireSelf(), addToWishlistForm, addToWishlist);

/**
 * @swagger
 * /wishlist/{userId}/items/{productBoutiqueId}:
 *   delete:
 *     tags: [Wishlist]
 *     summary: Retirer un produit des favoris
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: productBoutiqueId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Produit retiré, favoris retournés
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Favoris ou article introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
wishlistRouter.delete("/:userId/items/:productBoutiqueId", requireAuth, requireSelf(), wishlistItemParams, removeFromWishlist);

/**
 * @swagger
 * /wishlist/{userId}:
 *   delete:
 *     tags: [Wishlist]
 *     summary: Vider la liste de favoris
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Favoris vidés
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Favoris introuvables
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
wishlistRouter.delete("/:userId", requireAuth, requireSelf(), wishlistUserIdParam, clearWishlist);

export default wishlistRouter;
