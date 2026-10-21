import { Router } from "express";
import { requireAuth, requireRole, requireSelf } from "../../shared/middlewares/auth.middleware.js";
import { EntityType } from "../../models/user.model.js";
import {
  createCategorie,
  deleteCategorie,
  getCategorieById,
  getCategories,
  reorderCategories,
  updateCategorie,
} from "../../controllers/categorie.controller.js";
import { createCategorieForm, updateCategorieForm } from "../../shared/forms/categorie.form.js";
import { uploadMedia, validateUploadedFileSize } from "../../shared/helpers/fileUpload.js";

const categorieRouter = Router();

/**
 * @swagger
 * /categories:
 *   get:
 *     tags: [Categorie]
 *     summary: Lister les catégories
 *     parameters:
 *       - in: query
 *         name: familleId
 *         schema: { type: string }
 *         description: Filtrer par famille
 *       - in: query
 *         name: actif
 *         schema: { type: boolean }
 *         description: Filtrer par statut actif
 *     responses:
 *       200:
 *         description: Liste des catégories
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 */
categorieRouter.get("/", getCategories);

/**
 * @swagger
 * /categories/{id}:
 *   get:
 *     tags: [Categorie]
 *     summary: Récupérer une catégorie par ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: 665f1a2b3c4d5e6f7a8b9c0d
 *     responses:
 *       200:
 *         description: Catégorie trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Catégorie non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
categorieRouter.get("/:id", getCategorieById);

/**
 * @swagger
 * /categories:
 *   post:
 *     tags: [Categorie]
 *     summary: Créer une catégorie (avec upload d'image)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [familleId, nom]
 *             properties:
 *               familleId: { type: string, example: 665f1a2b3c4d5e6f7a8b9c0d }
 *               nom: { type: string, example: Smartphones }
 *               description: { type: string }
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Fichier image (jpeg, png, webp, gif — 5MB max)
 *               ordre: { type: integer }
 *               actif: { type: boolean }
 *     responses:
 *       201:
 *         description: Catégorie créée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Famille introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       409:
 *         description: Nom déjà utilisé dans cette famille
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
categorieRouter.post(
  "/",
  requireAuth, requireRole(EntityType.ADMIN),
  uploadMedia.single("image"),
  validateUploadedFileSize,
  createCategorieForm,
  createCategorie
);

/**
 * @swagger
 * /categories/{id}:
 *   put:
 *     tags: [Categorie]
 *     summary: Mettre à jour une catégorie (remplacement/suppression d'image)
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
 *               familleId: { type: string }
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
 *         description: Catégorie mise à jour
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Catégorie non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
categorieRouter.put(
  "/:id",
  requireAuth, requireRole(EntityType.ADMIN),
  uploadMedia.single("image"),
  validateUploadedFileSize,
  updateCategorieForm,
  updateCategorie
);

/**
 * @swagger
 * /categories/reorder:
 *   patch:
 *     tags: [Categorie]
 *     summary: Réorganiser l'ordre des catégories
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
categorieRouter.patch("/reorder", requireAuth, requireRole(EntityType.ADMIN), reorderCategories);

/**
 * @swagger
 * /categories/{id}:
 *   delete:
 *     tags: [Categorie]
 *     summary: Supprimer une catégorie (soft delete)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Catégorie supprimée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Catégorie non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
categorieRouter.delete("/:id", requireAuth, requireRole(EntityType.ADMIN), deleteCategorie);

export default categorieRouter;