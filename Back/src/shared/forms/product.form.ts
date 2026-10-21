import { body, type ValidationChain } from "express-validator";
import { productDeliveryFields } from "./delivery.form.js";

// ─────────────────────────────────────────────
//  PRODUCT
//  Les images sont envoyées en multipart/form-data (champ "images"), gérées par multer + fileUpload.ts.
//  Elles ne font donc plus partie du body JSON validé ici.
// ─────────────────────────────────────────────

// { name, description, urlVideo?, familleId, categoryId, sousCategoryId } + fichiers "images"
export const createProductForm: ValidationChain[] = [
  body("name")
    .trim()
    .notEmpty().withMessage("Le nom du produit est requis.")
    .isLength({ min: 2, max: 150 }).withMessage("Entre 2 et 150 caractères."),

  body("description")
    .trim()
    .notEmpty().withMessage("La description du produit est requise.")
    .isLength({ max: 2000 }).withMessage("Maximum 2000 caractères."),


  body("familleId")
    .notEmpty().withMessage("L'identifiant de la famille est requis.")
    .isMongoId().withMessage("Identifiant de famille invalide."),

  body("categoryId")
    .notEmpty().withMessage("L'identifiant de la catégorie est requis.")
    .isMongoId().withMessage("Identifiant de catégorie invalide."),

  body("sousCategoryId")
    .notEmpty().withMessage("L'identifiant de la sous-catégorie est requis.")
    .isMongoId().withMessage("Identifiant de sous-catégorie invalide."),
];

// { name?, description?, urlVideo?, familleId?, categoryId?, sousCategoryId?, imagesToRemove? } + fichiers "images"
export const updateProductForm: ValidationChain[] = [
  body("name")
    .optional()
    .trim()
    .notEmpty().withMessage("Le nom du produit ne peut pas être vide.")
    .isLength({ min: 2, max: 150 }).withMessage("Entre 2 et 150 caractères."),

  body("description")
    .optional()
    .trim()
    .notEmpty().withMessage("La description ne peut pas être vide.")
    .isLength({ max: 2000 }).withMessage("Maximum 2000 caractères."),


  body("familleId")
    .optional()
    .isMongoId().withMessage("Identifiant de famille invalide."),

  body("categoryId")
    .optional()
    .isMongoId().withMessage("Identifiant de catégorie invalide."),

  body("sousCategoryId")
    .optional()
    .isMongoId().withMessage("Identifiant de sous-catégorie invalide."),

  // Tableau d'URLs (ex: "/uploads/images/2026-07-16/xxx.jpg") des images à retirer du produit.
  // Peut être envoyé en JSON stringifié (multipart/form-data) ou en tableau natif (JSON classique).
  body("imagesToRemove")
    .optional(),
];

// ─────────────────────────────────────────────
//  PRODUCT BOUTIQUE
// ─────────────────────────────────────────────

// { boutiqueId, productId, price, discountPrice?, stock, isFeatured?, tags?, rating?, reviewsCount?, delivery? }
// Les images sont envoyées en multipart/form-data (champ "images"), gérées par multer + fileUpload.ts.
export const createProductBoutiqueForm: ValidationChain[] = [
  body("boutiqueId")
    .notEmpty().withMessage("L'identifiant de la boutique est requis.")
    .isMongoId().withMessage("Identifiant de boutique invalide."),

  body("productId")
    .notEmpty().withMessage("L'identifiant du produit est requis.")
    .isMongoId().withMessage("Identifiant de produit invalide."),

  body("price")
    .notEmpty().withMessage("Le prix est requis.")
    .isFloat({ min: 0 }).withMessage("Le prix doit être un nombre positif.")
    .toFloat(),

  body("discountPrice")
    .optional()
    .isFloat({ min: 0 }).withMessage("Le prix remisé doit être un nombre positif.")
    .toFloat(),

  body("stock")
    .notEmpty().withMessage("Le stock est requis.")
    .isInt({ min: 0 }).withMessage("Le stock doit être un nombre entier positif.")
    .toInt(),

  body("isFeatured")
    .optional()
    .isBoolean().withMessage("isFeatured doit être un booléen.")
    .toBoolean(),

  body("tags")
    .optional()
    .isArray().withMessage("tags doit être un tableau."),

  body("tags.*")
    .optional()
    .isString().withMessage("Chaque tag doit être une chaîne de caractères."),

  body("rating")
    .optional()
    .isFloat({ min: 0, max: 5 }).withMessage("La note doit être comprise entre 0 et 5.")
    .toFloat(),

  body("reviewsCount")
    .optional()
    .isInt({ min: 0 }).withMessage("reviewsCount doit être un nombre entier positif.")
    .toInt(),

  // Absent : l'offre suit la livraison de sa boutique (création) ou garde la sienne (mise à jour).
  ...productDeliveryFields,
];

// { boutiqueId?, productId?, price?, discountPrice?, stock?, isFeatured?, tags?, rating?, reviewsCount?, imagesToRemove?, delivery? }
// Nouveaux fichiers "images" ajoutés + "imagesToRemove" (JSON stringifié) pour retirer des images existantes.
export const updateProductBoutiqueForm: ValidationChain[] = [
  body("boutiqueId")
    .optional()
    .isMongoId().withMessage("Identifiant de boutique invalide."),

  body("productId")
    .optional()
    .isMongoId().withMessage("Identifiant de produit invalide."),

  body("imagesToRemove")
    .optional(),

  body("price")
    .optional()
    .isFloat({ min: 0 }).withMessage("Le prix doit être un nombre positif.")
    .toFloat(),

  body("discountPrice")
    .optional()
    .isFloat({ min: 0 }).withMessage("Le prix remisé doit être un nombre positif.")
    .toFloat(),

  body("stock")
    .optional()
    .isInt({ min: 0 }).withMessage("Le stock doit être un nombre entier positif.")
    .toInt(),

  body("isFeatured")
    .optional()
    .isBoolean().withMessage("isFeatured doit être un booléen.")
    .toBoolean(),

  body("tags")
    .optional()
    .isArray().withMessage("tags doit être un tableau."),

  body("tags.*")
    .optional()
    .isString().withMessage("Chaque tag doit être une chaîne de caractères."),

  body("rating")
    .optional()
    .isFloat({ min: 0, max: 5 }).withMessage("La note doit être comprise entre 0 et 5.")
    .toFloat(),

  body("reviewsCount")
    .optional()
    .isInt({ min: 0 }).withMessage("reviewsCount doit être un nombre entier positif.")
    .toInt(),

  // Absent : l'offre suit la livraison de sa boutique (création) ou garde la sienne (mise à jour).
  ...productDeliveryFields,
];