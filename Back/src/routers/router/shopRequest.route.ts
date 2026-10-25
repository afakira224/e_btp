import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/middlewares/auth.middleware.js";
import { EntityType } from "../../models/user.model.js";
import {
  approveShopRequest,
  cancelShopRequest,
  createShopRequest,
  getMyShopRequests,
  getShopRequestById,
  getShopRequests,
  rejectShopRequest,
} from "../../controllers/shopRequest.controller.js";
import {
  createShopRequestForm,
  listShopRequestsForm,
  rejectShopRequestForm,
  shopRequestIdParam,
} from "../../shared/forms/shopRequest.form.js";

const shopRequestRouter = Router();

/**
 * @swagger
 * /shop-requests:
 *   post:
 *     tags: [Demandes de boutique]
 *     summary: Demander l'ouverture d'une boutique
 *     description: >
 *       Le compte connecté (client, société ou gérant d'une autre boutique)
 *       dépose une demande, examinée par l'administration. Une seule demande en
 *       attente par compte. Le numéro RCCM n'est exigé que d'une entreprise.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, description, familleIds, sellerType, experience, catalogSize, hasPhysicalStore, adresse, acceptTerms]
 *             properties:
 *               nom: { type: string, example: Quincaillerie Kipé }
 *               description: { type: string, example: "Quincaillerie générale : visserie, outillage à main, serrurerie." }
 *               familleIds:
 *                 type: array
 *                 items: { type: string }
 *                 example: [665f1a2b3c4d5e6f7a8b9c0d]
 *               sellerType: { type: string, enum: [particulier, entreprise] }
 *               rccm: { type: string, example: GN.TCC.2024.B.01234 }
 *               experience: { type: string, enum: [debutant, 1_3_ans, 3_10_ans, plus_10_ans] }
 *               catalogSize: { type: string, enum: [moins_50, 50_200, plus_200] }
 *               hasPhysicalStore: { type: boolean, example: true }
 *               adresse: { type: string, example: "Kipé, Ratoma, Conakry" }
 *               email: { type: string, format: email }
 *               message: { type: string }
 *               acceptTerms: { type: boolean, example: true }
 *     responses:
 *       201:
 *         description: Demande enregistrée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: Domaine d'activité introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       409:
 *         description: Demande déjà en attente, ou nom de boutique déjà pris
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       422:
 *         description: Réponses incomplètes ou mal formées
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *   get:
 *     tags: [Demandes de boutique]
 *     summary: Lister les demandes (administration)
 *     description: >
 *       En attente : les plus anciennes d'abord. Autres statuts : les plus
 *       récemment traitées d'abord. `counts` donne le nombre de demandes par statut.
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, approved, rejected, cancelled] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Recherche sur le nom de la boutique
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: "{ requests, total, page, totalPages, counts }"
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       403:
 *         description: Réservé à l'administration
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
shopRequestRouter.post(
  "/",
  requireAuth, requireRole(EntityType.USER, EntityType.USER_SOCIETE, EntityType.SHOP),
  createShopRequestForm,
  createShopRequest
);
shopRequestRouter.get(
  "/",
  requireAuth, requireRole(EntityType.ADMIN),
  listShopRequestsForm,
  getShopRequests
);

/**
 * @swagger
 * /shop-requests/mine:
 *   get:
 *     tags: [Demandes de boutique]
 *     summary: Mes demandes d'ouverture de boutique
 *     description: Toutes les demandes du compte connecté, la plus récente d'abord.
 *     responses:
 *       200:
 *         description: Liste des demandes
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 */
// Avant `/:id`, qui capturerait sinon « mine » comme un identifiant.
shopRequestRouter.get("/mine", requireAuth, getMyShopRequests);

/**
 * @swagger
 * /shop-requests/{id}:
 *   get:
 *     tags: [Demandes de boutique]
 *     summary: Détail d'une demande (administration ou demandeur)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Demande, avec le demandeur et les domaines choisis
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       403:
 *         description: La demande appartient à un autre compte
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       404:
 *         description: Demande introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
shopRequestRouter.get("/:id", requireAuth, shopRequestIdParam, getShopRequestById);

/**
 * @swagger
 * /shop-requests/{id}/cancel:
 *   patch:
 *     tags: [Demandes de boutique]
 *     summary: Retirer sa demande avant examen
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Demande annulée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: La demande a déjà été traitée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       403:
 *         description: La demande appartient à un autre compte
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
shopRequestRouter.patch("/:id/cancel", requireAuth, shopRequestIdParam, cancelShopRequest);

/**
 * @swagger
 * /shop-requests/{id}/approve:
 *   patch:
 *     tags: [Demandes de boutique]
 *     summary: Approuver une demande et ouvrir la boutique (administration)
 *     description: >
 *       Crée la boutique avec les informations de la demande, fait passer le
 *       compte demandeur au type `shop` (sessions ouvertes comprises) et
 *       prévient le demandeur par email.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Demande approuvée, `shopId` renseigné
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: La demande a déjà été traitée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       409:
 *         description: Une boutique porte déjà ce nom
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
shopRequestRouter.patch(
  "/:id/approve",
  requireAuth, requireRole(EntityType.ADMIN),
  shopRequestIdParam,
  approveShopRequest
);

/**
 * @swagger
 * /shop-requests/{id}/reject:
 *   patch:
 *     tags: [Demandes de boutique]
 *     summary: Refuser une demande, motif à l'appui (administration)
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
 *             required: [reason]
 *             properties:
 *               reason: { type: string, example: "Le numéro RCCM fourni ne correspond à aucune entreprise." }
 *     responses:
 *       200:
 *         description: Demande refusée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: La demande a déjà été traitée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       422:
 *         description: Motif absent ou trop court
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
shopRequestRouter.patch(
  "/:id/reject",
  requireAuth, requireRole(EntityType.ADMIN),
  shopRequestIdParam,
  rejectShopRequestForm,
  rejectShopRequest
);

export default shopRequestRouter;
