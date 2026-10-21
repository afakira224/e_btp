import { Router } from "express";
import { requireAuth, requireRole, requireSelf } from "../../shared/middlewares/auth.middleware.js";
import { EntityType } from "../../models/user.model.js";
import { createShopForm, updateShopForm } from "../../shared/forms/boutique.form.js";
import { createShop, deleteShop, getShopById, getShops, updateShop } from "../../controllers/shop.controller.js";
import { uploadMedia, validateUploadedFileSize } from "../../shared/helpers/fileUpload.js";

const boutiqueRouter = Router();

/**
 * @swagger
 * /shops:
 *   post:
 *     tags: [Boutique]
 *     summary: Créer une boutique (avec upload du logo)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [ownerId, nom]
 *             properties:
 *               ownerId: { type: string, example: 665f1a2b3c4d5e6f7a8b9c0d }
 *               nom: { type: string, example: Boutique Diallo }
 *               description: { type: string }
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: Fichier logo (jpeg, png, webp, gif — 5MB max)
 *               telephone: { type: string, example: "+224620000000" }
 *               email: { type: string, format: email }
 *               adresse: { type: string, example: Conakry, Ratoma }
 *     responses:
 *       201:
 *         description: Boutique créée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       409:
 *         description: Boutique avec ce nom déjà existante
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
boutiqueRouter.post(
  "/",
  requireAuth, requireRole(EntityType.ADMIN, EntityType.SHOP),
  uploadMedia.single("logo"),
  validateUploadedFileSize,
  createShopForm,
  createShop
);

/**
 * @swagger
 * /shops:
 *   get:
 *     tags: [Boutique]
 *     summary: Lister les boutiques
 *     parameters:
 *       - in: query
 *         name: ownerId
 *         schema: { type: string }
 *         description: Filtrer par propriétaire
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Recherche par nom
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Liste des boutiques
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 */
boutiqueRouter.get("/", getShops);

/**
 * @swagger
 * /shops/{id}:
 *   get:
 *     tags: [Boutique]
 *     summary: Récupérer une boutique par ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: 665f1a2b3c4d5e6f7a8b9c0d
 *     responses:
 *       200:
 *         description: Boutique retournée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Boutique introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
boutiqueRouter.get("/:id", getShopById);

/**
 * @swagger
 * /shops/{id}:
 *   put:
 *     tags: [Boutique]
 *     summary: Mettre à jour une boutique (remplacement/suppression du logo)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               nom: { type: string }
 *               description: { type: string }
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: Nouveau fichier logo (remplace l'ancien)
 *               removeLogo:
 *                 type: boolean
 *                 description: Mettre à true pour supprimer le logo sans le remplacer
 *               telephone: { type: string }
 *               email: { type: string, format: email }
 *               adresse: { type: string }
 *     responses:
 *       200:
 *         description: Boutique mise à jour
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Boutique introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
boutiqueRouter.put(
  "/:id",
  requireAuth, requireRole(EntityType.ADMIN, EntityType.SHOP),
  uploadMedia.single("logo"),
  validateUploadedFileSize,
  updateShopForm,
  updateShop
);

/**
 * @swagger
 * /shops/{id}:
 *   delete:
 *     tags: [Boutique]
 *     summary: Supprimer une boutique (soft delete)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Boutique supprimée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Boutique introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
boutiqueRouter.delete("/:id", requireAuth, requireRole(EntityType.ADMIN), deleteShop);

export default boutiqueRouter;