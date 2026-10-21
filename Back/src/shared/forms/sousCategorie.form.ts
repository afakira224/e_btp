import { body, type ValidationChain } from "express-validator";

// { categorieId, nom, description, image, ordre, actif }
export const createSousCategorieForm: ValidationChain[] = [
  body("categorieId")
    .notEmpty().withMessage("L'identifiant de la catégorie est requis.")
    .isMongoId().withMessage("Identifiant de catégorie invalide."),

  body("nom")
    .trim()
    .notEmpty().withMessage("Le nom de la sous-catégorie est requis.")
    .isLength({ min: 2, max: 100 }).withMessage("Entre 2 et 100 caractères."),

  body("description")
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage("Maximum 1000 caractères."),

  body("image")
    .optional()
    // .isURL().withMessage("L'image doit être une URL valide.")
    ,

  body("ordre")
    .optional()
    .isInt().withMessage("L'ordre doit être un nombre entier.")
    .toInt(),

  body("actif")
    .optional()
    .isBoolean().withMessage("actif doit être un booléen.")
    .toBoolean(),
];

// { categorieId?, nom?, description?, image?, ordre?, actif? }
export const updateSousCategorieForm: ValidationChain[] = [
  body("categorieId")
    .optional()
    .isMongoId().withMessage("Identifiant de catégorie invalide."),

  body("nom")
    .optional()
    .trim()
    .notEmpty().withMessage("Le nom de la sous-catégorie ne peut pas être vide.")
    .isLength({ min: 2, max: 100 }).withMessage("Entre 2 et 100 caractères."),

  body("description")
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage("Maximum 1000 caractères."),

  body("image")
    .optional()
    // .isURL().withMessage("L'image doit être une URL valide.")
    ,

  body("ordre")
    .optional()
    .isInt().withMessage("L'ordre doit être un nombre entier.")
    .toInt(),

  body("actif")
    .optional()
    .isBoolean().withMessage("actif doit être un booléen.")
    .toBoolean(),
];