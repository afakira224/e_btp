import { body, param, type ValidationChain } from "express-validator";

// Vérifie que :userId est un ObjectId valide (utilisé par toutes les routes du panier)
export const userIdParam: ValidationChain[] = [
  param("userId")
    .isMongoId().withMessage("Identifiant utilisateur invalide."),
];

// POST /cart/:userId/items  { productBoutiqueId, quantity? }
export const addToCartForm: ValidationChain[] = [
  param("userId")
    .isMongoId().withMessage("Identifiant utilisateur invalide."),

  body("productBoutiqueId")
    .notEmpty().withMessage("L'identifiant du produit en boutique est requis.")
    .isMongoId().withMessage("Identifiant de produit en boutique invalide."),

  body("quantity")
    .optional()
    .isInt({ min: 1 }).withMessage("La quantité doit être un entier supérieur ou égal à 1.")
    .toInt(),
];

// PUT /cart/:userId/items/:productBoutiqueId  { quantity }
export const updateCartItemForm: ValidationChain[] = [
  param("userId")
    .isMongoId().withMessage("Identifiant utilisateur invalide."),

  param("productBoutiqueId")
    .isMongoId().withMessage("Identifiant de produit en boutique invalide."),

  body("quantity")
    .notEmpty().withMessage("La quantité est requise.")
    .isInt({ min: 0 }).withMessage("La quantité doit être un entier positif (0 pour retirer l'article).")
    .toInt(),
];

// DELETE /cart/:userId/items/:productBoutiqueId
export const cartItemParams: ValidationChain[] = [
  param("userId")
    .isMongoId().withMessage("Identifiant utilisateur invalide."),

  param("productBoutiqueId")
    .isMongoId().withMessage("Identifiant de produit en boutique invalide."),
];
