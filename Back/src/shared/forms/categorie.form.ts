import { body, type ValidationChain } from "express-validator";
import { Etape } from "../../models/projet.model.js";

// { familleId, nom, description, image, ordre, actif }
export const createCategorieForm: ValidationChain[] = [
  body("familleId")
    .notEmpty().withMessage("L'identifiant de la famille est requis.")
    .isMongoId().withMessage("Identifiant de famille invalide."),

  body("nom")
    .trim()
    .notEmpty().withMessage("Le nom de la catégorie est requis.")
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

  body("etape")
    .optional()
    .isIn(Object.values(Etape)).withMessage(`Étape invalide. Valeurs acceptées : ${Object.values(Etape).join(", ")}.`),

  body("actif")
    .optional()
    .isBoolean().withMessage("actif doit être un booléen.")
    .toBoolean(),
];

// { familleId?, nom?, description?, image?, ordre?, actif? }
export const updateCategorieForm: ValidationChain[] = [
  body("familleId")
    .optional()
    .isMongoId().withMessage("Identifiant de famille invalide."),

  body("nom")
    .optional()
    .trim()
    .notEmpty().withMessage("Le nom de la catégorie ne peut pas être vide.")
    .isLength({ min: 2, max: 100 }).withMessage("Entre 2 et 100 caractères."),

  body("description")
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage("Maximum 1000 caractères."),

  body("image")
    .optional()
    // .withMessage("L'image doit être une URL valide.")
    ,

  body("ordre")
    .optional()
    .isInt().withMessage("L'ordre doit être un nombre entier.")
    .toInt(),

  body("etape")
    .optional()
    .isIn(Object.values(Etape)).withMessage(`Étape invalide. Valeurs acceptées : ${Object.values(Etape).join(", ")}.`),

  body("actif")
    .optional()
    .isBoolean().withMessage("actif doit être un booléen.")
    .toBoolean(),
];