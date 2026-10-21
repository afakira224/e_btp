import { body, type ValidationChain } from "express-validator";

// ─────────────────────────────────────────────
//  CREATE SHOP
//  { ownerId, nom, description?, logo?, telephone?, email?, adresse? }
// ─────────────────────────────────────────────
export const createShopForm: ValidationChain[] = [
  body("ownerId")
    .notEmpty().withMessage("L'identifiant du propriétaire est requis.")
    .isMongoId().withMessage("Identifiant propriétaire invalide."),

  body("nom")
    .trim()
    .notEmpty().withMessage("Le nom de la boutique est requis.")
    .isLength({ min: 2, max: 100 }).withMessage("Entre 2 et 100 caractères."),

  body("description")
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage("Maximum 1000 caractères."),

  body("logo")
    .optional()
    .isURL().withMessage("Le logo doit être une URL valide."),

  body("telephone")
    .optional()
    .trim()
    .isLength({ min: 9, max: 12 }).withMessage("Entre 9 et 12 caractères."),

  body("email")
    .optional()
    .trim()
    .isEmail().withMessage("Email invalide.")
    .normalizeEmail(),

  body("adresse")
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage("Maximum 255 caractères."),
];

// ─────────────────────────────────────────────
//  UPDATE SHOP
//  { nom?, description?, logo?, telephone?, email?, adresse? }
// ─────────────────────────────────────────────
export const updateShopForm: ValidationChain[] = [
  body("nom")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage("Entre 2 et 100 caractères."),

  body("description")
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage("Maximum 1000 caractères."),

  body("logo")
    .optional()
    .isURL().withMessage("Le logo doit être une URL valide."),

  body("telephone")
    .optional()
    .trim()
    .isLength({ min: 9, max: 12 }).withMessage("Entre 9 et 12 caractères."),

  body("email")
    .optional()
    .trim()
    .isEmail().withMessage("Email invalide.")
    .normalizeEmail(),

  body("adresse")
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage("Maximum 255 caractères."),
];