import { body, param, type ValidationChain } from "express-validator";
import { BoostGoal, BoostKind, BoostRelation } from "../../models/boost.model.js";
import { DiscountType } from "../../models/promotion.model.js";
import { SHOP_PROMOTION_TYPES } from "../helpers/promotion.rules.js";

// ─────────────────────────────────────────────
//  Formulaires : promotions de boutique, campagnes, boosts, crédits.
//  Les règles métier (remise, durée, plafonds) sont dans promotion.rules.ts ;
//  ici, la forme des champs.
// ─────────────────────────────────────────────

const mongoIds = (field: string, max: number, label: string): ValidationChain[] => [
  body(field).optional().isArray({ max }).withMessage(`${label} : ${max} au plus.`),
  body(`${field}.*`).optional().isMongoId().withMessage(`${label} : identifiant invalide.`),
];

export const shopIdParam: ValidationChain[] = [param("id").isMongoId().withMessage("Boutique invalide.")];

// POST /shops/:id/promotions · PUT /shops/:id/promotions/:promotionId
export const shopPromotionForm: ValidationChain[] = [
  ...shopIdParam,
  body("type").isIn(SHOP_PROMOTION_TYPES).withMessage(`Type invalide. Valeurs acceptées : ${SHOP_PROMOTION_TYPES.join(", ")}.`),
  body("nom").isString().trim().isLength({ min: 2, max: 80 }).withMessage("Le nom fait de 2 à 80 caractères."),
  body("description").optional().isString().trim().isLength({ max: 300 }).withMessage("300 caractères au plus."),
  body("discountType").optional().isIn(Object.values(DiscountType)).withMessage("Type de remise invalide."),
  body("discountValue").optional().isFloat({ min: 0 }).withMessage("Remise invalide.").toFloat(),
  body("startDate").optional({ values: "falsy" }).isISO8601().withMessage("Date de début invalide."),
  body("endDate").optional({ values: "falsy" }).isISO8601().withMessage("Date de fin invalide."),
  ...mongoIds("productBoutiqueIds", 50, "Offres"),
  ...mongoIds("familleIds", 20, "Familles"),
  ...mongoIds("categoryIds", 50, "Catégories"),
  ...mongoIds("excludedOfferIds", 200, "Offres exclues"),
  body("code").optional().isString().trim().toUpperCase().matches(/^[A-Z0-9]{4,20}$/).withMessage("Le code fait de 4 à 20 lettres ou chiffres."),
  body("minAmount").optional().isInt({ min: 0 }).withMessage("Montant minimum invalide.").toInt(),
  body("maxDiscount").optional().isInt({ min: 1 }).withMessage("Plafond invalide.").toInt(),
  body("usageLimit").optional().isInt({ min: 1 }).withMessage("Nombre d'utilisations invalide.").toInt(),
  body("perCustomerLimit").optional().isInt({ min: 1, max: 10 }).withMessage("Utilisations par client : 1 à 10.").toInt(),
  body("stackable").optional().isBoolean().withMessage("Cumulable : vrai ou faux.").toBoolean(),
  body("tiers").optional().isArray({ max: 3 }).withMessage("3 paliers au plus."),
  body("tiers.*.minQuantity").optional().isInt({ min: 2 }).withMessage("Un palier commence à 2 unités au moins.").toInt(),
  body("tiers.*.discountValue").optional().isFloat({ min: 1, max: 70 }).withMessage("Remise d'un palier : 1 à 70 %.").toFloat(),
  body("flashQuantity").optional().isInt({ min: 1 }).withMessage("Quantité flash invalide.").toInt(),
  body("confirmHighDiscount").optional().isBoolean().toBoolean(),
  body("launch").optional().isIn(["now", "schedule", "draft"]).withMessage("Lancement : now, schedule ou draft."),
];

export const shopPromotionUpdateForm: ValidationChain[] = [
  param("promotionId").isMongoId().withMessage("Promotion invalide."),
  ...shopPromotionForm,
];

// PATCH /promotions/:id/:action
export const promotionActionForm: ValidationChain[] = [
  param("id").isMongoId().withMessage("Promotion invalide."),
  body("endDate").optional().isISO8601().withMessage("Date de fin invalide."),
  body("now").optional().isBoolean().toBoolean(),
];

// PATCH /product-boutiques/:id/featured
export const featuredForm: ValidationChain[] = [
  param("id").isMongoId().withMessage("Produit invalide."),
  body("rank")
    .custom((value) => value === null || (Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 6))
    .withMessage("Rang de 1 à 6, ou null pour retirer le produit."),
];

// POST /campaigns · PUT /campaigns/:id
export const campaignForm: ValidationChain[] = [
  body("nom").isString().trim().isLength({ min: 2, max: 80 }).withMessage("Le nom fait de 2 à 80 caractères."),
  body("slug").optional().isString().trim().isLength({ max: 60 }),
  body("description").optional().isString().trim().isLength({ max: 500 }),
  body("startDate").isISO8601().withMessage("Date de début invalide."),
  body("endDate").isISO8601().withMessage("Date de fin invalide."),
  body("minDiscount").isFloat({ min: 5, max: 70 }).withMessage("Remise minimale : 5 à 70 %.").toFloat(),
  ...mongoIds("familleIds", 20, "Familles"),
  body("image").optional({ values: "null" }).isString(),
];

export const campaignUpdateForm: ValidationChain[] = [
  param("id").isMongoId().withMessage("Campagne invalide."),
  body("nom").optional().isString().trim().isLength({ min: 2, max: 80 }),
  body("description").optional().isString().trim().isLength({ max: 500 }),
  body("startDate").optional().isISO8601(),
  body("endDate").optional().isISO8601(),
  body("minDiscount").optional().isFloat({ min: 5, max: 70 }).toFloat(),
  body("actif").optional().isBoolean().toBoolean(),
];

export const campaignEntryForm: ValidationChain[] = [
  param("id").isMongoId().withMessage("Campagne invalide."),
  body("boutiqueId").isMongoId().withMessage("Boutique invalide."),
  body("productBoutiqueIds").isArray({ min: 1, max: 50 }).withMessage("Choisissez de 1 à 50 offres."),
  body("productBoutiqueIds.*").isMongoId().withMessage("Offre invalide."),
  body("discountValue").isFloat({ min: 5, max: 70 }).withMessage("Remise : 5 à 70 %.").toFloat(),
  body("confirmHighDiscount").optional().isBoolean().toBoolean(),
];

// POST /shops/:id/boosts · POST /shops/:id/boosts/estimate
export const boostForm: ValidationChain[] = [
  ...shopIdParam,
  body("kind").isIn(Object.values(BoostKind)).withMessage("Choisissez un boost de promotion ou de produit."),
  body("promotionId").optional({ values: "falsy" }).isMongoId().withMessage("Promotion invalide."),
  ...mongoIds("productBoutiqueIds", 10, "Produits"),
  body("goal").optional().isIn(Object.values(BoostGoal)).withMessage("Objectif : visits ou views."),
  body("audience").optional().isObject().withMessage("Audience invalide."),
  body("audience.mode").optional().isIn(["auto", "custom"]).withMessage("Audience : auto ou custom."),
  body("audience.communes").optional().isArray({ max: 20 }),
  body("audience.villes").optional().isArray({ max: 20 }),
  body("audience.customerTypes").optional().isArray({ max: 2 }),
  body("audience.interestFamilleIds").optional().isArray({ max: 20 }),
  body("audience.interestFamilleIds.*").optional().isMongoId(),
  body("audience.relation").optional().isIn(Object.values(BoostRelation)),
  body("dailyBudget").isInt({ min: 1 }).withMessage("Budget par jour invalide.").toInt(),
  body("days").isInt({ min: 1, max: 30 }).withMessage("Un boost dure de 1 à 30 jours.").toInt(),
];

export const boostIdParam: ValidationChain[] = [param("id").isMongoId().withMessage("Boost invalide.")];

export const rechargeForm: ValidationChain[] = [
  ...shopIdParam,
  body("amount").isInt({ min: 1000, max: 10_000_000 }).withMessage("Recharge de 1 000 à 10 000 000 GNF.").toInt(),
];

export const sandboxCreditsForm: ValidationChain[] = [
  ...shopIdParam,
  param("purchaseId").isMongoId().withMessage("Recharge invalide."),
  body("outcome").isIn(["paid", "failed"]).withMessage("Issue : paid ou failed."),
];

export const boostSettingsForm: ValidationChain[] = [
  body("costPerVisit").optional().isInt({ min: 1 }).toInt(),
  body("costPerThousandViews").optional().isInt({ min: 1 }).toInt(),
  body("monthlyCredits").optional().isInt({ min: 0 }).toInt(),
  body("minVisitsPerDay").optional().isInt({ min: 1, max: 1000 }).toInt(),
];
