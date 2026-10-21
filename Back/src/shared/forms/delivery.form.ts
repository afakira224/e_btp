import { body, param, type ValidationChain } from "express-validator";
import { DELIVERY_MODES } from "../../models/delivery.model.js";

// ─────────────────────────────────────────────
//  LIVRAISON
//  Ces règles vérifient la forme des données. La cohérence d'une
//  configuration (au moins un mode, tarif requis pour le prix fixe, adresse
//  requise pour le retrait) dépend de la boutique : elle est contrôlée par
//  validateDeliverySettings (shared/helpers/delivery.helper.ts).
// ─────────────────────────────────────────────

const MODES_MESSAGE = `Mode de livraison invalide. Valeurs autorisées : ${DELIVERY_MODES.join(", ")}.`;
const FEE_MESSAGE = "Le tarif de livraison doit être un nombre entier positif de GNF.";

// Un objet envoyé en multipart/form-data arrive en JSON stringifié.
const parseJsonObject = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const isPlainObject = (value: unknown): boolean =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// PUT /shops/:id/delivery  { modes, flatRateFee? }
export const shopDeliveryForm: ValidationChain[] = [
  param("id")
    .isMongoId().withMessage("Identifiant de boutique invalide."),

  body("modes")
    .isArray().withMessage("modes doit être la liste des modes de livraison activés."),

  body("modes.*")
    .isIn(DELIVERY_MODES).withMessage(MODES_MESSAGE),

  body("flatRateFee")
    .optional({ values: "null" })
    .isInt({ min: 0 }).withMessage(FEE_MESSAGE)
    .toInt(),
];

// GET /shops/:id/delivery
export const shopIdParam: ValidationChain[] = [
  param("id")
    .isMongoId().withMessage("Identifiant de boutique invalide."),
];

// Champ `delivery` des formulaires d'offre (POST / PUT /product-boutiques) :
//   { useShopSettings: true }                                  → héritage de la boutique
//   { useShopSettings: false, modes: [...], flatRateFee? }     → configuration propre
export const productDeliveryFields: ValidationChain[] = [
  body("delivery")
    .optional()
    .customSanitizer(parseJsonObject)
    .custom(isPlainObject).withMessage("delivery doit être un objet { useShopSettings, modes?, flatRateFee? }."),

  body("delivery.useShopSettings")
    .optional()
    .isBoolean().withMessage("delivery.useShopSettings doit être un booléen.")
    .toBoolean(),

  body("delivery.modes")
    .optional()
    .isArray().withMessage("delivery.modes doit être une liste de modes de livraison."),

  body("delivery.modes.*")
    .isIn(DELIVERY_MODES).withMessage(MODES_MESSAGE),

  body("delivery.flatRateFee")
    .optional({ values: "null" })
    .isInt({ min: 0 }).withMessage(FEE_MESSAGE)
    .toInt(),
];

// Choix du client au checkout et pour le devis :
//   deliveries: [{ boutiqueId, method }]   un mode par boutique
//   deliveryMethod                          un mode pour toutes les boutiques
// Aucun montant n'est accepté : les frais sont toujours calculés par le serveur.
export const deliverySelectionFields: ValidationChain[] = [
  body("deliveryMethod")
    .optional()
    .isIn(DELIVERY_MODES).withMessage(MODES_MESSAGE),

  body("deliveries")
    .optional()
    .isArray().withMessage("deliveries doit être une liste { boutiqueId, method }."),

  body("deliveries.*.boutiqueId")
    .isMongoId().withMessage("Identifiant de boutique invalide dans deliveries."),

  body("deliveries.*.method")
    .isIn(DELIVERY_MODES).withMessage(MODES_MESSAGE),
];

// POST /cart/:userId/delivery-quote  { deliveries?, deliveryMethod? }
export const deliveryQuoteForm: ValidationChain[] = [
  param("userId")
    .isMongoId().withMessage("Identifiant utilisateur invalide."),

  ...deliverySelectionFields,
];
