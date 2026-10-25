import { Router } from "express";
import { requireAuth, requireRole, requireSelf } from "../../shared/middlewares/auth.middleware.js";
import { EntityType } from "../../models/user.model.js";
import {
  createOrder,
  deleteOrder,
  getOrderById,
  getOrders,
} from "../../controllers/order.controller.js";
import { createOrderForm, orderIdParam } from "../../shared/forms/order.form.js";

const orderRouter = Router();

/**
 * @swagger
 * /orders:
 *   get:
 *     tags: [Order]
 *     summary: Lister les commandes
 *     description: >
 *       Un client ne voit que ses commandes, userId ou non ; l'administration
 *       voit celles de tous, ou d'un client avec userId. Chaque commande porte
 *       ses sous-commandes (`parts`), une par boutique.
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *         description: Filtrer par utilisateur (administration)
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [awaiting_payment, payment_failed, in_progress, completed, partially_completed, cancelled] }
 *         description: Filtrer par statut de la commande
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
 *       Une livraison par boutique : le mode est choisi parmi ceux que tous les
 *       articles de la boutique acceptent (voir POST /cart/{userId}/delivery-quote),
 *       et figé dans `deliveries` avec ses frais. Les frais sont calculés par le
 *       serveur : tout montant envoyé par le client est ignoré.
 *       La commande est découpée en une sous-commande par boutique (`parts`).
 *       `paymentMethod: online` : la commande attend son paiement 30 minutes au
 *       plus, et la réponse porte `payment.redirectUrl`, la page où payer.
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
 *               addressId: { type: string, description: "Adresse du carnet, requise hors retrait (ou adresse libre)" }
 *               deliveryMethod:
 *                 type: string
 *                 enum: [pickup, free, flat_rate]
 *                 description: Mode appliqué à toutes les boutiques du panier
 *               deliveries:
 *                 type: array
 *                 description: Un mode par boutique (prioritaire sur deliveryMethod)
 *                 items:
 *                   type: object
 *                   properties:
 *                     boutiqueId: { type: string }
 *                     method: { type: string, enum: [pickup, free, flat_rate] }
 *               telephone: { type: string, example: "+224620000000" }
 *               adresse: { type: string, example: Conakry, Ratoma }
 *               code: { type: string, example: RENTREE20, description: "Code promo optionnel appliqué à la commande" }
 *               paymentMethod: { type: string, enum: [on_delivery, online], default: on_delivery }
 *     responses:
 *       201:
 *         description: Commande créée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: Panier vide, stock insuffisant, mode de livraison manquant ou non proposé
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

// Le statut d'une commande ne se change plus ici : il se déduit de ses
// sous-commandes, que l'on fait avancer par /shop-orders/{id}/{action}.

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
