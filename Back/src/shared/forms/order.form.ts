import { body, param, type ValidationChain } from "express-validator";
import { DeliveryMethod, OrderStatus } from "../../models/order.model.js";

// POST /orders/:userId  (checkout depuis le panier)
// { addressId?, deliveryMethod?, telephone?, adresse?, code? }
export const createOrderForm: ValidationChain[] = [
  param("userId")
    .isMongoId().withMessage("Identifiant utilisateur invalide."),

  // Adresse enregistrée du carnet d'adresses (recommandé).
  body("addressId")
    .optional()
    .isMongoId().withMessage("Identifiant d'adresse invalide."),

  body("deliveryMethod")
    .optional()
    .isIn(Object.values(DeliveryMethod))
    .withMessage(`Mode de livraison invalide. Valeurs autorisées : ${Object.values(DeliveryMethod).join(", ")}.`),

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
];

// PATCH /orders/:id/status  { status, note? }
export const updateOrderStatusForm: ValidationChain[] = [
  param("id")
    .isMongoId().withMessage("Identifiant de commande invalide."),

  body("status")
    .notEmpty().withMessage("Le statut est requis.")
    .isIn(Object.values(OrderStatus))
    .withMessage(`Statut invalide. Valeurs autorisées : ${Object.values(OrderStatus).join(", ")}.`),

  // Commentaire libre conservé dans l'historique (motif d'annulation, n° de suivi…).
  body("note")
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage("Maximum 500 caractères."),
];

// Routes avec un simple :id de commande
export const orderIdParam: ValidationChain[] = [
  param("id")
    .isMongoId().withMessage("Identifiant de commande invalide."),
];
