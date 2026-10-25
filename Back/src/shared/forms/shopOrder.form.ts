import { body, param, query, type ValidationChain } from "express-validator";
import { ShopOrderStatus } from "../../models/shopOrder.model.js";
import { MANUAL_ACTIONS, SHOP_ORDER_GROUP_KEYS } from "../helpers/shopOrder.workflow.js";

// GET /shop-orders?boutiqueId=&group=&status=&search=&page=&limit=
export const listShopOrdersForm: ValidationChain[] = [
  query("boutiqueId").optional().isMongoId().withMessage("Identifiant de boutique invalide."),
  query("group")
    .optional()
    .isIn(SHOP_ORDER_GROUP_KEYS)
    .withMessage(`Groupe invalide. Valeurs acceptées : ${SHOP_ORDER_GROUP_KEYS.join(", ")}.`),
  query("status")
    .optional()
    .isIn(Object.values(ShopOrderStatus))
    .withMessage(`Statut invalide. Valeurs acceptées : ${Object.values(ShopOrderStatus).join(", ")}.`),
  query("search").optional().trim().isLength({ max: 60 }).withMessage("Recherche limitée à 60 caractères."),
  query("page").optional().isInt({ min: 1 }).withMessage("La page doit être un entier positif."),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("La limite doit être comprise entre 1 et 100."),
];

export const shopOrderIdParam: ValidationChain[] = [
  param("id").isMongoId().withMessage("Identifiant de commande invalide."),
];

// PATCH /shop-orders/:id/:action   { reason?, note?, code?, resolution?, refundAmount? } (+ photos pour un retour)
// Le statut de départ, l'acteur et les champs exigés par chaque action sont
// vérifiés par le contrôleur (shopOrder.workflow) : ici, seulement la forme.
export const shopOrderActionForm: ValidationChain[] = [
  ...shopOrderIdParam,
  param("action")
    .isIn(MANUAL_ACTIONS)
    .withMessage(`Action inconnue. Valeurs acceptées : ${MANUAL_ACTIONS.join(", ")}.`),
  body("reason").optional().isString().trim().isLength({ max: 50 }).withMessage("Motif invalide."),
  body("note").optional().isString().trim().isLength({ max: 500 }).withMessage("Maximum 500 caractères."),
  body("code")
    .optional()
    .trim()
    .matches(/^\d{6}$/)
    .withMessage("Le code de remise compte 6 chiffres."),
  body("resolution")
    .optional()
    .isIn(["refund_full", "refund_partial", "rejected"])
    .withMessage("Décision invalide. Valeurs acceptées : refund_full, refund_partial, rejected."),
  body("refundAmount")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Le montant remboursé doit être un entier positif de GNF.")
    .toInt(),
];

// POST /payments/sandbox/:orderId   { outcome }
export const sandboxPaymentForm: ValidationChain[] = [
  param("orderId").isMongoId().withMessage("Identifiant de commande invalide."),
  body("outcome").isIn(["paid", "failed"]).withMessage("Issue invalide. Valeurs acceptées : paid, failed."),
];

export const paymentOrderIdParam: ValidationChain[] = [
  param("orderId").isMongoId().withMessage("Identifiant de commande invalide."),
];
