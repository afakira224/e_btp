import { body, param, query, type ValidationChain } from "express-validator";
import { SupportParty, SupportTicketType } from "../../models/supportTicket.model.js";
import { OPENABLE_TYPES, RESOLVE_OUTCOMES, SUPPORT_ACTIONS, SUPPORT_TABS } from "../helpers/support.workflow.js";

const TABS = [...new Set(Object.values(SUPPORT_TABS).flatMap((tabs) => Object.keys(tabs))), "urgent", "reports"];

// POST /support/tickets   multipart : { type, reason, description, subject?, targetId?, shopId? } + pièces jointes
export const createTicketForm: ValidationChain[] = [
  body("type").isIn(OPENABLE_TYPES).withMessage(`Type invalide. Valeurs acceptées : ${OPENABLE_TYPES.join(", ")}.`),
  body("reason").isString().trim().notEmpty().withMessage("Le motif est requis."),
  body("description")
    .isString()
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage("Décrivez la situation : 10 à 2 000 caractères."),
  body("subject").optional().isString().trim().isLength({ max: 120 }).withMessage("Objet limité à 120 caractères."),
  body("targetId").optional().isMongoId().withMessage("Cible invalide."),
  body("shopId").optional().isMongoId().withMessage("Boutique invalide."),
];

// POST /support/contact   { name, email, subject?, message, reason? } — visiteur sans compte
export const contactForm: ValidationChain[] = [
  body("name").isString().trim().isLength({ min: 2, max: 80 }).withMessage("Votre nom : 2 à 80 caractères."),
  body("email").isEmail().withMessage("Email invalide.").normalizeEmail(),
  body("message").isString().trim().isLength({ min: 10, max: 2000 }).withMessage("Votre message : 10 à 2 000 caractères."),
  body("subject").optional().isString().trim().isLength({ max: 120 }).withMessage("Objet limité à 120 caractères."),
  body("reason")
    .optional()
    .isIn(["account", "payment", "usage", "shop_opening", "other"])
    .withMessage("Motif invalide."),
];

// GET /support/tickets?scope=&boutiqueId=&tab=&type=&search=&page=&limit=
export const listTicketsForm: ValidationChain[] = [
  query("scope").optional().isIn(["mine", "shop", "admin"]).withMessage("Portée invalide : mine, shop ou admin."),
  query("boutiqueId").optional().isMongoId().withMessage("Boutique invalide."),
  query("tab").optional().isIn(TABS).withMessage(`Onglet invalide. Valeurs acceptées : ${TABS.join(", ")}.`),
  query("type").optional().isIn(Object.values(SupportTicketType)).withMessage("Type invalide."),
  query("search").optional().trim().isLength({ max: 60 }).withMessage("Recherche limitée à 60 caractères."),
  query("page").optional().isInt({ min: 1 }).withMessage("La page doit être un entier positif."),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("La limite doit être comprise entre 1 et 100."),
];

export const ticketIdParam: ValidationChain[] = [param("id").isMongoId().withMessage("Identifiant de demande invalide.")];

// POST /support/tickets/:id/messages   multipart : { body, internal?, waitFor? } + pièces jointes
export const postMessageForm: ValidationChain[] = [
  ...ticketIdParam,
  body("body").isString().trim().isLength({ min: 1, max: 2000 }).withMessage("Message : 1 à 2 000 caractères."),
  body("internal").optional().isBoolean().withMessage("Note interne : vrai ou faux.").toBoolean(),
  body("waitFor")
    .optional({ values: "falsy" })
    .isIn([SupportParty.REQUESTER, SupportParty.SHOP])
    .withMessage("Réponse attendue de : requester ou shop."),
];

// PATCH /support/tickets/:id/:action   { kind?, details?, outcome?, note?, reason?, rating?, comment?, assignee? }
export const ticketActionForm: ValidationChain[] = [
  ...ticketIdParam,
  param("action").isIn(SUPPORT_ACTIONS).withMessage(`Action inconnue. Valeurs acceptées : ${SUPPORT_ACTIONS.join(", ")}.`),
  body("kind").optional().isString().trim().isLength({ max: 30 }),
  body("details").optional().isString().trim().isLength({ max: 1000 }).withMessage("Maximum 1 000 caractères."),
  body("outcome").optional().isIn(RESOLVE_OUTCOMES).withMessage(`Décision invalide. Valeurs acceptées : ${RESOLVE_OUTCOMES.join(", ")}.`),
  body("note").optional().isString().trim().isLength({ max: 1000 }).withMessage("Maximum 1 000 caractères."),
  body("reason").optional().isString().trim().isLength({ max: 1000 }).withMessage("Maximum 1 000 caractères."),
  body("rating").optional().isInt({ min: 1, max: 5 }).withMessage("La note va de 1 à 5.").toInt(),
  body("comment").optional().isString().trim().isLength({ max: 500 }).withMessage("Maximum 500 caractères."),
  body("assignee").optional().isMongoId().withMessage("Administrateur invalide."),
];
