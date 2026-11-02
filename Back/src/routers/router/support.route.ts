import { Router } from "express";
import { requireAuth } from "../../shared/middlewares/auth.middleware.js";
import { mailLimiter } from "../../shared/middlewares/rateLimit.middleware.js";
import { uploadAttachments, validateUploadedFileSize } from "../../shared/helpers/fileUpload.js";
import {
  contactSupport,
  createSupportTicket,
  getSupportTicket,
  listSupportTickets,
  performSupportAction,
  postSupportMessage,
} from "../../controllers/support.controller.js";
import {
  contactForm,
  createTicketForm,
  listTicketsForm,
  postMessageForm,
  ticketActionForm,
  ticketIdParam,
} from "../../shared/forms/support.form.js";

// Support : demandes, messages et actions. Les droits fins (qui est partie à
// quelle demande) sont vérifiés par le service, pas par un rôle de compte.
const supportRouter = Router();

/**
 * @swagger
 * /support/contact:
 *   post:
 *     summary: « Nous contacter » — un visiteur sans compte écrit à l'équipe (réponse par email)
 *     tags: [Support]
 */
supportRouter.post("/contact", mailLimiter, contactForm, contactSupport);

/**
 * @swagger
 * /support/tickets:
 *   post:
 *     summary: Ouvrir une demande (problème de commande, signalement, question, contestation) — multipart, 5 pièces jointes au plus
 *     tags: [Support]
 *   get:
 *     summary: Mes demandes (scope=mine), celles d'une boutique (scope=shop&boutiqueId=), la file de l'administration (scope=admin)
 *     tags: [Support]
 */
supportRouter.post(
  "/tickets",
  requireAuth,
  uploadAttachments.array("attachments", 5),
  validateUploadedFileSize,
  createTicketForm,
  createSupportTicket
);
supportRouter.get("/tickets", requireAuth, listTicketsForm, listSupportTickets);

/**
 * @swagger
 * /support/tickets/{id}:
 *   get:
 *     summary: Une demande et ses messages ; son dossier (demandes et mesures liées) pour l'administration
 *     tags: [Support]
 */
supportRouter.get("/tickets/:id", requireAuth, ticketIdParam, getSupportTicket);

/**
 * @swagger
 * /support/tickets/{id}/messages:
 *   post:
 *     summary: Écrire dans une demande — multipart ; internal=true pour une note de l'administration
 *     tags: [Support]
 */
supportRouter.post(
  "/tickets/:id/messages",
  requireAuth,
  uploadAttachments.array("attachments", 5),
  validateUploadedFileSize,
  postMessageForm,
  postSupportMessage
);

/**
 * @swagger
 * /support/tickets/{id}/{action}:
 *   patch:
 *     summary: propose, accept, escalate, resolve, appeal, close, reopen, assign, rate
 *     tags: [Support]
 */
supportRouter.patch("/tickets/:id/:action", requireAuth, ticketActionForm, performSupportAction);

export default supportRouter;
