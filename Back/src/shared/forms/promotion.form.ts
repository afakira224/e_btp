import { body, param, type ValidationChain } from "express-validator";
import { DiscountType, PromotionScope, PromotionType } from "../../models/promotion.model.js";

// Les contrôles inter-champs (code requis pour un coupon, produits requis pour une cible
// product_boutique, endDate > startDate, pourcentage ≤ 100) sont faits dans le contrôleur.

export const createPromotionForm: ValidationChain[] = [
  body("nom")
    .trim()
    .notEmpty().withMessage("Le nom de la promotion est requis.")
    .isLength({ min: 2, max: 100 }).withMessage("Entre 2 et 100 caractères."),

  body("description")
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage("Maximum 1000 caractères."),

  body("type")
    .isIn(Object.values(PromotionType))
    .withMessage(`Type invalide. Valeurs autorisées : ${Object.values(PromotionType).join(", ")}.`),

  body("scope")
    .isIn(Object.values(PromotionScope))
    .withMessage(`Cible invalide. Valeurs autorisées : ${Object.values(PromotionScope).join(", ")}.`),

  body("discountType")
    .optional()
    .isIn(Object.values(DiscountType))
    .withMessage(`Type de réduction invalide. Valeurs autorisées : ${Object.values(DiscountType).join(", ")}.`),

  body("discountValue")
    .notEmpty().withMessage("La valeur de la réduction est requise.")
    .isFloat({ gt: 0 }).withMessage("La réduction doit être un nombre supérieur à 0.")
    .toFloat(),

  body("code")
    .optional()
    .trim()
    .isLength({ min: 3, max: 40 }).withMessage("Le code doit faire entre 3 et 40 caractères."),

  body("startDate")
    .notEmpty().withMessage("La date de début est requise.")
    .isISO8601().withMessage("Date de début invalide (format ISO8601 attendu).")
    .toDate(),

  body("endDate")
    .notEmpty().withMessage("La date de fin est requise.")
    .isISO8601().withMessage("Date de fin invalide (format ISO8601 attendu).")
    .toDate(),

  body("productBoutiqueIds")
    .optional()
    .isArray().withMessage("productBoutiqueIds doit être un tableau."),

  body("productBoutiqueIds.*")
    .optional()
    .isMongoId().withMessage("Identifiant de produit en boutique invalide."),

  body("minAmount")
    .optional()
    .isFloat({ min: 0 }).withMessage("Le montant minimum doit être positif.")
    .toFloat(),

  body("maxDiscount")
    .optional()
    .isFloat({ min: 0 }).withMessage("Le plafond de réduction doit être positif.")
    .toFloat(),

  body("usageLimit")
    .optional()
    .isInt({ min: 1 }).withMessage("La limite d'utilisation doit être un entier ≥ 1.")
    .toInt(),

  body("actif")
    .optional()
    .isBoolean().withMessage("actif doit être un booléen.")
    .toBoolean(),
];

export const updatePromotionForm: ValidationChain[] = [
  param("id")
    .isMongoId().withMessage("Identifiant de promotion invalide."),

  body("nom")
    .optional()
    .trim()
    .notEmpty().withMessage("Le nom ne peut pas être vide.")
    .isLength({ min: 2, max: 100 }).withMessage("Entre 2 et 100 caractères."),

  body("description")
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage("Maximum 1000 caractères."),

  body("type")
    .optional()
    .isIn(Object.values(PromotionType))
    .withMessage(`Type invalide. Valeurs autorisées : ${Object.values(PromotionType).join(", ")}.`),

  body("scope")
    .optional()
    .isIn(Object.values(PromotionScope))
    .withMessage(`Cible invalide. Valeurs autorisées : ${Object.values(PromotionScope).join(", ")}.`),

  body("discountType")
    .optional()
    .isIn(Object.values(DiscountType))
    .withMessage(`Type de réduction invalide. Valeurs autorisées : ${Object.values(DiscountType).join(", ")}.`),

  body("discountValue")
    .optional()
    .isFloat({ gt: 0 }).withMessage("La réduction doit être un nombre supérieur à 0.")
    .toFloat(),

  body("code")
    .optional()
    .trim()
    .isLength({ min: 3, max: 40 }).withMessage("Le code doit faire entre 3 et 40 caractères."),

  body("startDate")
    .optional()
    .isISO8601().withMessage("Date de début invalide (format ISO8601 attendu).")
    .toDate(),

  body("endDate")
    .optional()
    .isISO8601().withMessage("Date de fin invalide (format ISO8601 attendu).")
    .toDate(),

  body("productBoutiqueIds")
    .optional()
    .isArray().withMessage("productBoutiqueIds doit être un tableau."),

  body("productBoutiqueIds.*")
    .optional()
    .isMongoId().withMessage("Identifiant de produit en boutique invalide."),

  body("minAmount")
    .optional()
    .isFloat({ min: 0 }).withMessage("Le montant minimum doit être positif.")
    .toFloat(),

  body("maxDiscount")
    .optional()
    .isFloat({ min: 0 }).withMessage("Le plafond de réduction doit être positif.")
    .toFloat(),

  body("usageLimit")
    .optional()
    .isInt({ min: 1 }).withMessage("La limite d'utilisation doit être un entier ≥ 1.")
    .toInt(),

  body("actif")
    .optional()
    .isBoolean().withMessage("actif doit être un booléen.")
    .toBoolean(),
];

// POST /promotions/apply  { userId, code }
export const applyCouponForm: ValidationChain[] = [
  body("userId")
    .notEmpty().withMessage("L'identifiant utilisateur est requis.")
    .isMongoId().withMessage("Identifiant utilisateur invalide."),

  body("code")
    .trim()
    .notEmpty().withMessage("Le code du coupon est requis."),
];

export const promotionIdParam: ValidationChain[] = [
  param("id")
    .isMongoId().withMessage("Identifiant de promotion invalide."),
];
