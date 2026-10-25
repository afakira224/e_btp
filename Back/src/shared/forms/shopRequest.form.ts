import { body, param, query, type ValidationChain } from "express-validator";
import {
  CatalogSize,
  SellerExperience,
  SellerType,
  ShopRequestStatus,
} from "../../models/shopRequest.model.js";

const values = (enumeration: Record<string, string>) => Object.values(enumeration);

// ─────────────────────────────────────────────
//  POST /shop-requests  →  CreateShopRequestDto
//  Le questionnaire d'ouverture : la boutique (nom, présentation, domaines),
//  le vendeur (statut, registre, ancienneté, taille du catalogue) et le lieu
//  de retrait. Le compte demandeur est celui de la session, jamais le corps.
// ─────────────────────────────────────────────
export const createShopRequestForm: ValidationChain[] = [
  body("nom")
    .trim()
    .notEmpty().withMessage("Le nom de la boutique est requis.")
    .isLength({ min: 2, max: 100 }).withMessage("Le nom de la boutique doit compter entre 2 et 100 caractères."),

  body("description")
    .trim()
    .notEmpty().withMessage("La présentation de la boutique est requise.")
    .isLength({ min: 20, max: 1000 }).withMessage("La présentation doit compter entre 20 et 1000 caractères."),

  body("familleIds")
    .isArray({ min: 1, max: 20 }).withMessage("Choisissez au moins un domaine d'activité."),

  body("familleIds.*")
    .isMongoId().withMessage("Domaine d'activité invalide."),

  body("sellerType")
    .notEmpty().withMessage("Précisez si vous vendez en tant que particulier ou entreprise.")
    .isIn(values(SellerType)).withMessage(`Statut invalide. Valeurs acceptées : ${values(SellerType).join(", ")}.`),

  // Le registre du commerce n'est exigé que d'une entreprise.
  body("rccm")
    .if(body("sellerType").equals(SellerType.ENTREPRISE))
    .trim()
    .notEmpty().withMessage("Le numéro RCCM est requis pour une entreprise.")
    .isLength({ min: 5, max: 50 }).withMessage("Le numéro RCCM doit compter entre 5 et 50 caractères."),

  body("experience")
    .notEmpty().withMessage("Indiquez l'ancienneté de votre activité.")
    .isIn(values(SellerExperience)).withMessage(`Ancienneté invalide. Valeurs acceptées : ${values(SellerExperience).join(", ")}.`),

  body("catalogSize")
    .notEmpty().withMessage("Indiquez le nombre de produits que vous comptez vendre.")
    .isIn(values(CatalogSize)).withMessage(`Taille de catalogue invalide. Valeurs acceptées : ${values(CatalogSize).join(", ")}.`),

  body("hasPhysicalStore")
    .isBoolean().withMessage("Indiquez si vous disposez d'un point de vente.")
    .toBoolean(),

  body("adresse")
    .trim()
    .notEmpty().withMessage("L'adresse de la boutique est requise.")
    .isLength({ min: 5, max: 255 }).withMessage("L'adresse doit compter entre 5 et 255 caractères."),

  body("email")
    .optional({ values: "falsy" })
    .trim()
    .isEmail().withMessage("Email de la boutique invalide.")
    .normalizeEmail(),

  body("message")
    .optional({ values: "null" })
    .trim()
    .isLength({ max: 1000 }).withMessage("Le message ne peut dépasser 1000 caractères."),

  body("acceptTerms")
    .custom((value) => value === true || value === "true")
    .withMessage("Vous devez accepter les conditions de vente de la plateforme."),
];

// ─────────────────────────────────────────────
//  PATCH /shop-requests/:id/reject  →  { reason }
//  Un refus sans motif ne permet pas au demandeur de corriger sa demande.
// ─────────────────────────────────────────────
export const rejectShopRequestForm: ValidationChain[] = [
  body("reason")
    .trim()
    .notEmpty().withMessage("Le motif du refus est requis.")
    .isLength({ min: 10, max: 500 }).withMessage("Le motif doit compter entre 10 et 500 caractères."),
];

// ─────────────────────────────────────────────
//  GET /shop-requests?status=&search=&page=&limit=
// ─────────────────────────────────────────────
export const listShopRequestsForm: ValidationChain[] = [
  query("status")
    .optional()
    .isIn(values(ShopRequestStatus)).withMessage(`Statut invalide. Valeurs acceptées : ${values(ShopRequestStatus).join(", ")}.`),

  query("search")
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage("Recherche limitée à 100 caractères."),

  query("page")
    .optional()
    .isInt({ min: 1 }).withMessage("La page doit être un entier positif."),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage("La limite doit être comprise entre 1 et 100."),
];

export const shopRequestIdParam: ValidationChain[] = [
  param("id").isMongoId().withMessage("Identifiant de demande invalide."),
];
