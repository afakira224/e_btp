import { Router } from "express";
import { requireAuth, requireRole, requireSelf } from "../../shared/middlewares/auth.middleware.js";
import { EntityType } from "../../models/user.model.js";
import {
  createSousCategorie,
  deleteSousCategorie,
  getSousCategorieById,
  getSousCategories,
  reorderSousCategories,
  updateSousCategorie,
} from "../../controllers/sousCategorie.controller.js";
import { createSousCategorieForm, updateSousCategorieForm } from "../../shared/forms/sousCategorie.form.js";
import { uploadMedia, validateUploadedFileSize } from "../../shared/helpers/fileUpload.js";

const sousCategorieRouter = Router();

/**
 * @swagger
 * /sous-categories:
 *   get:
 *     tags: [SousCategorie]
 *     summary: Lister les sous-catégories
 *     parameters:
 *       - in: query
 *         name: categorieId
 *         schema: { type: string }
 *         description: Filtrer par catégorie
 *       - in: query
 *         name: actif
 *         schema: { type: boolean }
 *         description: Filtrer par statut actif
 *     responses:
 *       200:
 *         description: Liste des sous-catégories
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 */
sousCategorieRouter.get("/", getSousCategories);

/**
 * @swagger
 * /sous-categories/{id}:
 *   get:
 *     tags: [SousCategorie]
 *     summary: Récupérer une sous-catégorie par ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: 665f1a2b3c4d5e6f7a8b9c0d
 *     responses:
 *       200:
 *         description: Sous-catégorie trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Sous-catégorie non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
sousCategorieRouter.get("/:id", getSousCategorieById);

/**
 * @swagger
 * /sous-categories:
 *   post:
 *     tags: [SousCategorie]
 *     summary: Créer une sous-catégorie (avec upload d'image)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [categorieId, nom]
 *             properties:
 *               categorieId: { type: string, example: 665f1a2b3c4d5e6f7a8b9c0d }
 *               nom: { type: string, example: Écouteurs sans fil }
 *               description: { type: string }
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Fichier image (jpeg, png, webp, gif — 5MB max)
 *               ordre: { type: integer }
 *               actif: { type: boolean }
 *     responses:
 *       201:
 *         description: Sous-catégorie créée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Catégorie introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       409:
 *         description: Nom déjà utilisé dans cette catégorie
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
sousCategorieRouter.post(
  "/",
  requireAuth, requireRole(EntityType.ADMIN),
  uploadMedia.single("image"),
  validateUploadedFileSize,
  createSousCategorieForm,
  createSousCategorie
);

/**
 * @swagger
 * /sous-categories/{id}:
 *   put:
 *     tags: [SousCategorie]
 *     summary: Mettre à jour une sous-catégorie (remplacement/suppression d'image)
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
 *               categorieId: { type: string }
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
 *         description: Sous-catégorie mise à jour
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Sous-catégorie non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
sousCategorieRouter.put(
  "/:id",
  requireAuth, requireRole(EntityType.ADMIN),
  uploadMedia.single("image"),
  validateUploadedFileSize,
  updateSousCategorieForm,
  updateSousCategorie
);

/**
 * @swagger
 * /sous-categories/reorder:
 *   patch:
 *     tags: [SousCategorie]
 *     summary: Réorganiser l'ordre des sous-catégories
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
sousCategorieRouter.patch("/reorder", requireAuth, requireRole(EntityType.ADMIN), reorderSousCategories);

/**
 * @swagger
 * /sous-categories/{id}:
 *   delete:
 *     tags: [SousCategorie]
 *     summary: Supprimer une sous-catégorie (soft delete)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Sous-catégorie supprimée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Sous-catégorie non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
sousCategorieRouter.delete("/:id", requireAuth, requireRole(EntityType.ADMIN), deleteSousCategorie);

export default sousCategorieRouter;