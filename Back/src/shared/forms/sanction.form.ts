import { body, param, query, type ValidationChain } from "express-validator";
import { SanctionTargetKind, SanctionType } from "../../models/sanction.model.js";

// POST /sanctions   { type, targetKind, targetId, reason, ticketId?, days? }
export const createSanctionForm: ValidationChain[] = [
  body("type").isIn(Object.values(SanctionType)).withMessage(`Mesure invalide. Valeurs acceptées : ${Object.values(SanctionType).join(", ")}.`),
  body("targetKind")
    .isIn(Object.values(SanctionTargetKind))
    .withMessage(`Cible invalide. Valeurs acceptées : ${Object.values(SanctionTargetKind).join(", ")}.`),
  body("targetId").isMongoId().withMessage("Cible invalide."),
  body("reason").isString().trim().isLength({ min: 10, max: 1000 }).withMessage("Motivez la mesure : 10 à 1 000 caractères."),
  body("ticketId").optional().isMongoId().withMessage("Demande invalide."),
  body("days").optional().isInt({ min: 1 }).withMessage("Durée invalide.").toInt(),
];

export const sanctionIdParam: ValidationChain[] = [param("id").isMongoId().withMessage("Identifiant de mesure invalide.")];

export const liftSanctionForm: ValidationChain[] = [
  ...sanctionIdParam,
  body("reason").optional().isString().trim().isLength({ max: 1000 }).withMessage("Maximum 1 000 caractères."),
];

// GET /sanctions?targetKind=&targetId=&pending=
export const listSanctionsForm: ValidationChain[] = [
  query("targetKind").optional().isIn(Object.values(SanctionTargetKind)).withMessage("Cible invalide."),
  query("targetId").optional().isMongoId().withMessage("Cible invalide."),
  query("pending").optional().isBoolean().withMessage("pending : vrai ou faux."),
];
