import { body, type ValidationChain } from "express-validator";

// { nom, description, image, ordre, actif }
export const createFamilleForm: ValidationChain[] = [
  body("nom")
    .trim()
    .notEmpty().withMessage("Le nom de la famille est requis.")
    .isLength({ min: 2, max: 100 }).withMessage("Entre 2 et 100 caractères."),

  body("description")
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage("Maximum 1000 caractères."),

  body("image")
    .optional()
    .isURL().withMessage("L'image doit être une URL valide."),

  body("ordre")
    .optional()
    .isInt().withMessage("L'ordre doit être un nombre entier.")
    .toInt(),

  body("actif")
    .optional()
    .isBoolean().withMessage("actif doit être un booléen.")
    .toBoolean(),
];

// { nom?, description?, image?, ordre?, actif? }
export const updateFamilleForm: ValidationChain[] = [
  body("nom")
    .optional()
    .trim()
    .notEmpty().withMessage("Le nom de la famille ne peut pas être vide.")
    .isLength({ min: 2, max: 100 }).withMessage("Entre 2 et 100 caractères."),

  body("description")
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage("Maximum 1000 caractères."),

  body("image")
    .optional()
    .isURL().withMessage("L'image doit être une URL valide."),

  body("ordre")
    .optional()
    .isInt().withMessage("L'ordre doit être un nombre entier.")
    .toInt(),

  body("actif")
    .optional()
    .isBoolean().withMessage("actif doit être un booléen.")
    .toBoolean(),
];