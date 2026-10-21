import { Router } from "express";
import { requireAuth, requireRole, requireSelf } from "../../shared/middlewares/auth.middleware.js";
import { EntityType } from "../../models/user.model.js";
import { createFamille, deleteFamille, getFamilleById, getFamilles, reorderFamilles, updateFamille } from "../../controllers/familleController.controller.js";
import { createFamilleForm, updateFamilleForm } from "../../shared/forms/famille.form.js";
import { uploadMedia, validateUploadedFileSize } from "../../shared/helpers/fileUpload.js";

const familleRouter = Router();

/**
 * @swagger
 * /familles:
 *   get:
 *     tags: [Famille]
 *     summary: Lister les familles
 *     parameters:
 *       - in: query
 *         name: actif
 *         schema: { type: boolean }
 *         description: Filtrer par statut actif
 *     responses:
 *       200:
 *         description: Liste des familles
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 */
familleRouter.get("/", getFamilles);

/**
 * @swagger
 * /familles/{id}:
 *   get:
 *     tags: [Famille]
 *     summary: Récupérer une famille par ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: 665f1a2b3c4d5e6f7a8b9c0d
 *     responses:
 *       200:
 *         description: Famille trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Famille non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
familleRouter.get("/:id", getFamilleById);

/**
 * @swagger
 * /familles:
 *   post:
 *     tags: [Famille]
 *     summary: Créer une famille (avec upload d'image)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [nom]
 *             properties:
 *               nom: { type: string, example: Électronique }
 *               description: { type: string }
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Fichier image (jpeg, png, webp, gif — 5MB max)
 *               ordre: { type: integer }
 *               actif: { type: boolean }
 *     responses:
 *       201:
 *         description: Famille créée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       409:
 *         description: Nom déjà utilisé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
familleRouter.post(
  "/",
  requireAuth, requireRole(EntityType.ADMIN),
  uploadMedia.single("image"),
  validateUploadedFileSize,
  createFamilleForm,
  createFamille
);

/**
 * @swagger
 * /familles/{id}:
 *   put:
 *     tags: [Famille]
 *     summary: Mettre à jour une famille (remplacement/suppression d'image)
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
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Nouveau fichier image (remplace l'ancien)
 *               removeImage:
 *                 type: boolean
 *                 description: Mettre à true pour supprimer l'image sans la remplacer
 *               ordre: { type: integer }
 *               actif: { type: boolean }
 *     responses:
 *       200:
 *         description: Famille mise à jour
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Famille non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
familleRouter.put(
  "/:id",
  requireAuth, requireRole(EntityType.ADMIN),
  uploadMedia.single("image"),
  validateUploadedFileSize,
  updateFamilleForm,
  updateFamille
);

/**
 * @swagger
 * /familles/reorder:
 *   patch:
 *     tags: [Famille]
 *     summary: Réorganiser l'ordre des familles
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderedIds]
 *             properties:
 *               orderedIds:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200:
 *         description: Ordre mis à jour
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: orderedIds invalide
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
familleRouter.patch("/reorder", requireAuth, requireRole(EntityType.ADMIN), reorderFamilles);

/**
 * @swagger
 * /familles/{id}:
 *   delete:
 *     tags: [Famille]
 *     summary: Supprimer une famille (soft delete)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Famille supprimée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Famille non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
familleRouter.delete("/:id", requireAuth, requireRole(EntityType.ADMIN), deleteFamille);

export default familleRouter;