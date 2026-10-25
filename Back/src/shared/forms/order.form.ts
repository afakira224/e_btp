import { body, param, type ValidationChain } from "express-validator";
import { PaymentMethod } from "../../models/order.model.js";
import { deliverySelectionFields } from "./delivery.form.js";

// POST /orders/:userId  (checkout depuis le panier)
// { addressId?, deliveries?, deliveryMethod?, telephone?, adresse?, code?, paymentMethod? }
export const createOrderForm: ValidationChain[] = [
  param("userId")
    .isMongoId().withMessage("Identifiant utilisateur invalide."),

  // Adresse enregistrée du carnet d'adresses (recommandé).
  body("addressId")
    .optional()
    .isMongoId().withMessage("Identifiant d'adresse invalide."),

  // Un mode par boutique (deliveries) ou un mode commun (deliveryMethod).
  // Les anciens modes standard / express ne sont plus proposés.
  ...deliverySelectionFields,

  body("code")
    .optional()
    .trim()
    .notEmpty().withMessage("Le code promo ne peut pas être vide.")
    .isLength({ max: 40 }).withMessage("Maximum 40 caractères."),

  // Adresse libre : utilisée uniquement si aucun addressId n'est fourni.
  body("telephone")
    .optional()
    .trim()
    .isLength({ min: 9, max: 12 }).withMessage("Entre 9 et 12 caractères."),

  body("adresse")
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage("Maximum 255 caractères."),

  // À la livraison ou au retrait par défaut ; en ligne, via le prestataire.
  body("paymentMethod")
    .optional()
    .isIn(Object.values(PaymentMethod))
    .withMessage(`Mode de paiement invalide. Valeurs acceptées : ${Object.values(PaymentMethod).join(", ")}.`),
];

// Routes avec un simple :id de commande
export const orderIdParam: ValidationChain[] = [
  param("id")
    .isMongoId().withMessage("Identifiant de commande invalide."),
];
