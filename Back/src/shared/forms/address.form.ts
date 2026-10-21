import { body, param, query, type ValidationChain } from "express-validator";

// POST /addresses
export const createAddressForm: ValidationChain[] = [
  body("userId")
    .notEmpty().withMessage("L'identifiant utilisateur est requis.")
    .isMongoId().withMessage("Identifiant utilisateur invalide."),

  body("label")
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage("Maximum 50 caractères."),

  body("destinataire")
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage("Maximum 100 caractères."),

  body("telephone")
    .trim()
    .notEmpty().withMessage("Le téléphone est requis.")
    .isLength({ min: 9, max: 12 }).withMessage("Entre 9 et 12 caractères."),

  body("adresse")
    .trim()
    .notEmpty().withMessage("L'adresse est requise.")
    .isLength({ max: 255 }).withMessage("Maximum 255 caractères."),

  body("ville")
    .trim()
    .notEmpty().withMessage("La ville est requise.")
    .isLength({ max: 100 }).withMessage("Maximum 100 caractères."),

  body("commune")
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage("Maximum 100 caractères."),

  body("pays")
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage("Maximum 100 caractères."),

  body("isDefault")
    .optional()
    .isBoolean().withMessage("isDefault doit être un booléen.")
    .toBoolean(),
];

// PUT /addresses/:id
export const updateAddressForm: ValidationChain[] = [
  param("id")
    .isMongoId().withMessage("Identifiant d'adresse invalide."),

  body("label")
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage("Maximum 50 caractères."),

  body("destinataire")
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage("Maximum 100 caractères."),

  body("telephone")
    .optional()
    .trim()
    .isLength({ min: 9, max: 12 }).withMessage("Entre 9 et 12 caractères."),

  body("adresse")
    .optional()
    .trim()
    .notEmpty().withMessage("L'adresse ne peut pas être vide.")
    .isLength({ max: 255 }).withMessage("Maximum 255 caractères."),

  body("ville")
    .optional()
    .trim()
    .notEmpty().withMessage("La ville ne peut pas être vide.")
    .isLength({ max: 100 }).withMessage("Maximum 100 caractères."),

  body("commune")
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage("Maximum 100 caractères."),

  body("pays")
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage("Maximum 100 caractères."),

  body("isDefault")
    .optional()
    .isBoolean().withMessage("isDefault doit être un booléen.")
    .toBoolean(),
];

// GET /addresses?userId=
export const listAddressesForm: ValidationChain[] = [
  query("userId")
    .notEmpty().withMessage("Le paramètre userId est requis.")
    .isMongoId().withMessage("Identifiant utilisateur invalide."),
];

export const addressIdParam: ValidationChain[] = [
  param("id")
    .isMongoId().withMessage("Identifiant d'adresse invalide."),
];
