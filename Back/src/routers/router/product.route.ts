import { Router } from "express";
import { requireAuth, requireRole, requireSelf } from "../../shared/middlewares/auth.middleware.js";
import { EntityType } from "../../models/user.model.js";
import {
  createProduct,
  deleteProduct,
  getProductById,
  getProducts,
  updateProduct,
} from "../../controllers/product.controller.js";
import { createProductForm, updateProductForm } from "../../shared/forms/product.form.js";
import { uploadMedia, validateUploadedFileSize } from "../../shared/helpers/fileUpload.js";

const productRouter = Router();

/**
 * @swagger
 * /products:
 *   get:
 *     tags: [Product]
 *     summary: Lister les produits
 *     parameters:
 *       - in: query
 *         name: familleId
 *         schema: { type: string }
 *         description: Filtrer par famille
 *       - in: query
 *         name: categoryId
 *         schema: { type: string }
 *         description: Filtrer par catégorie
 *       - in: query
 *         name: sousCategoryId
 *         schema: { type: string }
 *         description: Filtrer par sous-catégorie
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
 *         description: Liste des produits
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 */
productRouter.get("/", getProducts);

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     tags: [Product]
 *     summary: Récupérer un produit par ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: 665f1a2b3c4d5e6f7a8b9c0d
 *     responses:
 *       200:
 *         description: Produit trouvé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Produit non trouvé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
productRouter.get("/:id", getProductById);

/**
 * @swagger
 * /products:
 *   post:
 *     tags: [Product]
 *     summary: Créer un produit (avec upload d'images)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name, description, familleId, categoryId, sousCategoryId, images]
 *             properties:
 *               name: { type: string, example: Casque audio Bluetooth }
 *               description: { type: string }
 *               urlVideo: { type: string, format: uri }
 *               familleId: { type: string, example: 665f1a2b3c4d5e6f7a8b9c0d }
 *               categoryId: { type: string }
 *               sousCategoryId: { type: string }
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *                 description: Fichiers image (jpeg, png, webp, gif — 5MB max chacun)
 *     responses:
 *       201:
 *         description: Produit créé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: Aucune image fournie ou requête invalide
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       404:
 *         description: Famille, catégorie ou sous-catégorie introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
productRouter.post(
  "/",
  requireAuth, requireRole(EntityType.ADMIN),
  uploadMedia.array("images", 10),
  validateUploadedFileSize,
  createProductForm,
  createProduct
);

/**
 * @swagger
 * /products/{id}:
 *   put:
 *     tags: [Product]
 *     summary: Mettre à jour un produit (ajout de nouvelles images et/ou suppression d'images existantes)
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
 *               name: { type: string }
 *               description: { type: string }
 *               urlVideo: { type: string, format: uri }
 *               familleId: { type: string }
 *               categoryId: { type: string }
 *               sousCategoryId: { type: string }
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *                 description: Nouveaux fichiers image à ajouter au produit
 *               imagesToRemove:
 *                 type: string
 *                 description: >
 *                   Tableau JSON stringifié des URLs d'images à retirer,
 *                   ex. '["/uploads/images/2026-07-16/xxx.jpg"]'
 *     responses:
 *       200:
 *         description: Produit mis à jour
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Produit non trouvé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
productRouter.put(
  "/:id",
  requireAuth, requireRole(EntityType.ADMIN),
  uploadMedia.array("images", 10),
  validateUploadedFileSize,
  updateProductForm,
  updateProduct
);

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     tags: [Product]
 *     summary: Supprimer un produit (soft delete)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Produit supprimé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Produit non trouvé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
productRouter.delete("/:id", requireAuth, requireRole(EntityType.ADMIN), deleteProduct);

export default productRouter;