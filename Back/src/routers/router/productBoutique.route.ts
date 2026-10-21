import { Router } from "express";
import { requireAuth, requireRole, requireSelf } from "../../shared/middlewares/auth.middleware.js";
import { EntityType } from "../../models/user.model.js";
import {
  createProductBoutique,
  deleteProductBoutique,
  getProductBoutiqueById,
  getProductBoutiques,
  getRecentlyViewed,
  getSuggestions,
  searchProductBoutiques,
  updateProductBoutique,
} from "../../controllers/productBoutique.controller.js";
import { createProductBoutiqueForm, updateProductBoutiqueForm } from "../../shared/forms/product.form.js";
import { uploadMedia, validateUploadedFileSize } from "../../shared/helpers/fileUpload.js";

const productBoutiqueRouter = Router();

/**
 * @swagger
 * /product-boutiques:
 *   get:
 *     tags: [ProductBoutique]
 *     summary: Lister les produits référencés dans les boutiques
 *     parameters:
 *       - in: query
 *         name: boutiqueId
 *         schema: { type: string }
 *         description: Filtrer par boutique
 *       - in: query
 *         name: productId
 *         schema: { type: string }
 *         description: Filtrer par produit
 *       - in: query
 *         name: isFeatured
 *         schema: { type: boolean }
 *         description: Filtrer les produits mis en avant
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Liste des produits en boutique
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 */
productBoutiqueRouter.get("/", getProductBoutiques);

/**
 * @swagger
 * /product-boutiques/recently-viewed/{userId}:
 *   get:
 *     tags: [ProductBoutique]
 *     summary: Produits récemment vus par un utilisateur
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *         example: 665f1a2b3c4d5e6f7a8b9c0d
 *     responses:
 *       200:
 *         description: Liste des produits récemment consultés (plus récent en tête)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 */
productBoutiqueRouter.get("/recently-viewed/:userId", requireAuth, requireSelf(), getRecentlyViewed);

/**
 * @swagger
 * /product-boutiques/search:
 *   get:
 *     tags: [ProductBoutique]
 *     summary: Recherche & filtres avancés
 *     description: >
 *       Recherche texte (nom/description produit) + filtres (boutique, taxonomie, prix,
 *       note, stock, mis en avant, promo, tags), tri et pagination. Renvoie aussi la
 *       fourchette de prix (priceRange) pour un curseur côté front.
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Recherche texte dans le nom et la description du produit
 *       - in: query
 *         name: boutiqueId
 *         schema: { type: string }
 *       - in: query
 *         name: familleId
 *         schema: { type: string }
 *       - in: query
 *         name: categoryId
 *         schema: { type: string }
 *       - in: query
 *         name: sousCategoryId
 *         schema: { type: string }
 *       - in: query
 *         name: minPrice
 *         schema: { type: number }
 *       - in: query
 *         name: maxPrice
 *         schema: { type: number }
 *       - in: query
 *         name: minRating
 *         schema: { type: number }
 *       - in: query
 *         name: inStock
 *         schema: { type: boolean }
 *         description: true = uniquement les produits en stock
 *       - in: query
 *         name: isFeatured
 *         schema: { type: boolean }
 *       - in: query
 *         name: discounted
 *         schema: { type: boolean }
 *         description: true = uniquement les produits en promotion
 *       - in: query
 *         name: tags
 *         schema: { type: string }
 *         description: Tags séparés par des virgules (correspondance sur l'un d'eux)
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [newest, price_asc, price_desc, rating, popular], default: newest }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Résultats de recherche (items, total, pagination, priceRange)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 */
productBoutiqueRouter.get("/search", searchProductBoutiques);

/**
 * @swagger
 * /product-boutiques/{id}:
 *   get:
 *     tags: [ProductBoutique]
 *     summary: Récupérer un produit en boutique par ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: 665f1a2b3c4d5e6f7a8b9c0d
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *         description: Si fourni, enregistre la consultation dans l'historique "récemment vus"
 *     responses:
 *       200:
 *         description: Produit en boutique trouvé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Produit en boutique non trouvé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
productBoutiqueRouter.get("/:id", getProductBoutiqueById);

/**
 * @swagger
 * /product-boutiques/{id}/suggestions:
 *   get:
 *     tags: [ProductBoutique]
 *     summary: Suggestions de produits similaires
 *     description: Produits partageant la sous-catégorie, la catégorie ou la famille (par pertinence décroissante).
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *         description: Nombre maximum de suggestions (max 50)
 *     responses:
 *       200:
 *         description: Liste des produits suggérés
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Produit en boutique non trouvé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
productBoutiqueRouter.get("/:id/suggestions", getSuggestions);

/**
 * @swagger
 * /product-boutiques:
 *   post:
 *     tags: [ProductBoutique]
 *     summary: Référencer un produit dans une boutique (avec upload d'images, prix, stock, etc.)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [boutiqueId, productId, images, price, stock]
 *             properties:
 *               boutiqueId: { type: string, example: 665f1a2b3c4d5e6f7a8b9c0d }
 *               productId: { type: string, example: 665f1a2b3c4d5e6f7a8b9c0e }
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *                 description: Fichiers image (jpeg, png, webp, gif — 5MB max chacun, 10 max)
 *               price: { type: number, example: 250000 }
 *               discountPrice: { type: number, example: 199000 }
 *               stock: { type: integer, example: 25 }
 *               isFeatured: { type: boolean, default: false }
 *               tags:
 *                 type: array
 *                 items: { type: string }
 *               rating: { type: number, example: 4.5 }
 *               reviewsCount: { type: integer, example: 12 }
 *               delivery:
 *                 type: string
 *                 description: >
 *                   JSON. Absent ou {"useShopSettings":true} : l'offre suit la livraison de sa
 *                   boutique. {"useShopSettings":false,"modes":["pickup","flat_rate"],"flatRateFee":40000} :
 *                   configuration propre au produit, non écrasée par la boutique.
 *                 example: '{"useShopSettings":true}'
 *     responses:
 *       201:
 *         description: Produit ajouté à la boutique
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: Livraison incohérente (aucun mode, tarif manquant ou nul, retrait sans adresse)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       403:
 *         description: La boutique n'appartient pas au vendeur connecté
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       404:
 *         description: Boutique ou produit introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       409:
 *         description: Produit déjà référencé dans cette boutique
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
productBoutiqueRouter.post(
  "/",
  requireAuth, requireRole(EntityType.ADMIN, EntityType.SHOP),
  uploadMedia.array("images", 10),
  validateUploadedFileSize,
  createProductBoutiqueForm,
  createProductBoutique
);

/**
 * @swagger
 * /product-boutiques/{id}:
 *   put:
 *     tags: [ProductBoutique]
 *     summary: Mettre à jour un produit en boutique (ajout d'images et/ou suppression d'images existantes)
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
 *               boutiqueId: { type: string }
 *               productId: { type: string }
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *                 description: Nouveaux fichiers image à ajouter
 *               imagesToRemove:
 *                 type: string
 *                 description: >
 *                   Tableau JSON stringifié des URLs d'images à retirer,
 *                   ex. '["/uploads/images/2026-07-16/xxx.jpg"]'
 *               price: { type: number }
 *               discountPrice: { type: number }
 *               stock: { type: integer }
 *               isFeatured: { type: boolean }
 *               tags:
 *                 type: array
 *                 items: { type: string }
 *               rating: { type: number }
 *               reviewsCount: { type: integer }
 *               delivery:
 *                 type: string
 *                 description: >
 *                   JSON. {"useShopSettings":true} rend l'offre à la livraison de sa boutique ;
 *                   {"useShopSettings":false,"modes":[...],"flatRateFee":...} la personnalise.
 *                   Absent : la livraison ne change pas.
 *     responses:
 *       200:
 *         description: Produit en boutique mis à jour
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: Livraison incohérente (aucun mode, tarif manquant ou nul, retrait sans adresse)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       403:
 *         description: L'offre (ou la boutique d'arrivée) n'appartient pas au vendeur connecté
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       404:
 *         description: Produit en boutique non trouvé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
productBoutiqueRouter.put(
  "/:id",
  requireAuth, requireRole(EntityType.ADMIN, EntityType.SHOP),
  uploadMedia.array("images", 10),
  validateUploadedFileSize,
  updateProductBoutiqueForm,
  updateProductBoutique
);

/**
 * @swagger
 * /product-boutiques/{id}:
 *   delete:
 *     tags: [ProductBoutique]
 *     summary: Retirer un produit d'une boutique (soft delete)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Produit en boutique supprimé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Produit en boutique non trouvé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
productBoutiqueRouter.delete("/:id", requireAuth, requireRole(EntityType.ADMIN), deleteProductBoutique);

export default productBoutiqueRouter;