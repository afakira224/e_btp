import { body, param, type ValidationChain } from "express-validator";

// Routes n'utilisant que :userId
export const wishlistUserIdParam: ValidationChain[] = [
  param("userId")
    .isMongoId().withMessage("Identifiant utilisateur invalide."),
];

// POST /wishlist/:userId/items  { productBoutiqueId }
export const addToWishlistForm: ValidationChain[] = [
  param("userId")
    .isMongoId().withMessage("Identifiant utilisateur invalide."),

  body("productBoutiqueId")
    .notEmpty().withMessage("L'identifiant du produit en boutique est requis.")
    .isMongoId().withMessage("Identifiant de produit en boutique invalide."),
];

// DELETE /wishlist/:userId/items/:productBoutiqueId
export const wishlistItemParams: ValidationChain[] = [
  param("userId")
    .isMongoId().withMessage("Identifiant utilisateur invalide."),

  param("productBoutiqueId")
    .isMongoId().withMessage("Identifiant de produit en boutique invalide."),
];
