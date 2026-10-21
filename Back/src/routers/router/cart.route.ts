import { Router } from "express";
import { requireAuth, requireRole, requireSelf } from "../../shared/middlewares/auth.middleware.js";
import { EntityType } from "../../models/user.model.js";
import {
  addToCart,
  clearCart,
  getCart,
  removeFromCart,
  updateCartItem,
} from "../../controllers/cart.controller.js";
import {
  addToCartForm,
  cartItemParams,
  updateCartItemForm,
  userIdParam,
} from "../../shared/forms/cart.form.js";

const cartRouter = Router();

/**
 * @swagger
 * /cart/{userId}:
 *   get:
 *     tags: [Cart]
 *     summary: Récupérer le panier d'un utilisateur
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *         example: 665f1a2b3c4d5e6f7a8b9c0d
 *     responses:
 *       200:
 *         description: Panier récupéré (vide si aucun panier n'existe encore)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 */
cartRouter.get("/:userId", requireAuth, requireSelf(), userIdParam, getCart);

/**
 * @swagger
 * /cart/{userId}/items:
 *   post:
 *     tags: [Cart]
 *     summary: Ajouter un article au panier (ou incrémenter sa quantité)
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
 *               quantity: { type: integer, minimum: 1, default: 1, example: 2 }
 *     responses:
 *       200:
 *         description: Article ajouté, panier retourné
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: Stock insuffisant ou requête invalide
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       404:
 *         description: Utilisateur ou produit en boutique introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
cartRouter.post("/:userId/items", requireAuth, requireSelf(), addToCartForm, addToCart);

/**
 * @swagger
 * /cart/{userId}/items/{productBoutiqueId}:
 *   put:
 *     tags: [Cart]
 *     summary: Modifier la quantité d'un article (0 pour le retirer)
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: productBoutiqueId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [quantity]
 *             properties:
 *               quantity: { type: integer, minimum: 0, example: 3 }
 *     responses:
 *       200:
 *         description: Panier mis à jour
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: Stock insuffisant ou requête invalide
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       404:
 *         description: Panier ou article introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
cartRouter.put("/:userId/items/:productBoutiqueId", requireAuth, requireSelf(), updateCartItemForm, updateCartItem);

/**
 * @swagger
 * /cart/{userId}/items/{productBoutiqueId}:
 *   delete:
 *     tags: [Cart]
 *     summary: Retirer un article du panier
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
 *         description: Article retiré, panier retourné
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Panier ou article introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
cartRouter.delete("/:userId/items/:productBoutiqueId", requireAuth, requireSelf(), cartItemParams, removeFromCart);

/**
 * @swagger
 * /cart/{userId}:
 *   delete:
 *     tags: [Cart]
 *     summary: Vider le panier
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Panier vidé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Panier introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
cartRouter.delete("/:userId", requireAuth, requireSelf(), userIdParam, clearCart);

export default cartRouter;
