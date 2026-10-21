import { body, param, type ValidationChain } from "express-validator";

// POST /reviews  { userId, productBoutiqueId, rating, comment? }
export const createReviewForm: ValidationChain[] = [
  body("userId")
    .notEmpty().withMessage("L'identifiant utilisateur est requis.")
    .isMongoId().withMessage("Identifiant utilisateur invalide."),

  body("productBoutiqueId")
    .notEmpty().withMessage("L'identifiant du produit en boutique est requis.")
    .isMongoId().withMessage("Identifiant de produit en boutique invalide."),

  body("rating")
    .notEmpty().withMessage("La note est requise.")
    .isInt({ min: 1, max: 5 }).withMessage("La note doit être un entier entre 1 et 5.")
    .toInt(),

  body("comment")
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage("Maximum 2000 caractères."),
];

// PUT /reviews/:id  { rating?, comment? }
export const updateReviewForm: ValidationChain[] = [
  param("id")
    .isMongoId().withMessage("Identifiant d'avis invalide."),

  body("rating")
    .optional()
    .isInt({ min: 1, max: 5 }).withMessage("La note doit être un entier entre 1 et 5.")
    .toInt(),

  body("comment")
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage("Maximum 2000 caractères."),
];

export const reviewIdParam: ValidationChain[] = [
  param("id")
    .isMongoId().withMessage("Identifiant d'avis invalide."),
];

export const productBoutiqueIdParam: ValidationChain[] = [
  param("productBoutiqueId")
    .isMongoId().withMessage("Identifiant de produit en boutique invalide."),
];
