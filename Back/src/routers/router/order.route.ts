import { Router } from "express";
import { requireAuth, requireRole, requireSelf } from "../../shared/middlewares/auth.middleware.js";
import { EntityType } from "../../models/user.model.js";
import {
  createOrder,
  deleteOrder,
  getOrderById,
  getOrders,
  updateOrderStatus,
} from "../../controllers/order.controller.js";
import {
  createOrderForm,
  orderIdParam,
  updateOrderStatusForm,
} from "../../shared/forms/order.form.js";

const orderRouter = Router();

/**
 * @swagger
 * /orders:
 *   get:
 *     tags: [Order]
 *     summary: Lister les commandes
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *         description: Filtrer par utilisateur
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, confirmed, shipped, delivered, cancelled] }
 *         description: Filtrer par statut
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Liste des commandes
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 */
orderRouter.get("/", requireAuth, requireSelf("query", "userId"), getOrders);

/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     tags: [Order]
 *     summary: Récupérer une commande par ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: 665f1a2b3c4d5e6f7a8b9c0d
 *     responses:
 *       200:
 *         description: Commande trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Commande non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
orderRouter.get("/:id", requireAuth, orderIdParam, getOrderById);

/**
 * @swagger
 * /orders/{userId}:
 *   post:
 *     tags: [Order]
 *     summary: Passer une commande à partir du panier (checkout)
 *     description: >
 *       Crée une commande depuis le panier de l'utilisateur : vérifie le stock,
 *       décrémente le stock des produits, fige les prix, puis vide le panier.
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               telephone: { type: string, example: "+224620000000" }
 *               adresse: { type: string, example: Conakry, Ratoma }
 *               code: { type: string, example: RENTREE20, description: "Code promo optionnel appliqué à la commande" }
 *     responses:
 *       201:
 *         description: Commande créée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: Panier vide ou stock insuffisant
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       404:
 *         description: Utilisateur introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
orderRouter.post("/:userId", requireAuth, requireSelf(), createOrderForm, createOrder);

/**
 * @swagger
 * /orders/{id}/status:
 *   patch:
 *     tags: [Order]
 *     summary: Mettre à jour le statut d'une commande
 *     description: Passer une commande à "cancelled" restitue automatiquement le stock.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, shipped, delivered, cancelled]
 *                 example: confirmed
 *     responses:
 *       200:
 *         description: Statut mis à jour
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: Statut invalide ou identique
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       404:
 *         description: Commande non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
orderRouter.patch("/:id/status", requireAuth, requireRole(EntityType.ADMIN, EntityType.SHOP), updateOrderStatusForm, updateOrderStatus);

/**
 * @swagger
 * /orders/{id}:
 *   delete:
 *     tags: [Order]
 *     summary: Supprimer une commande (soft delete)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Commande supprimée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Commande non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
orderRouter.delete("/:id", requireAuth, requireRole(EntityType.ADMIN), orderIdParam, deleteOrder);

export default orderRouter;
