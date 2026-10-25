import { Router } from "express";
import { requireAuth } from "../../shared/middlewares/auth.middleware.js";
import { restartPayment, settleSandboxPayment } from "../../controllers/payment.controller.js";
import { paymentOrderIdParam, sandboxPaymentForm } from "../../shared/forms/shopOrder.form.js";

const paymentRouter = Router();

/**
 * @swagger
 * /payments/sandbox/{orderId}:
 *   post:
 *     tags: [Paiement]
 *     summary: Prestataire simulé — payer ou faire échouer un paiement (hors production)
 *     description: >
 *       Tient lieu de la notification signée d'un vrai prestataire. `paid` envoie
 *       la commande aux boutiques ; `failed` l'annule, rend le stock et remet
 *       les articles dans le panier.
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [outcome]
 *             properties:
 *               outcome: { type: string, enum: [paid, failed] }
 *     responses:
 *       200:
 *         description: Paiement réglé
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Paiement simulé désactivé (production)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
// Avant `/:orderId` : « sandbox » serait sinon lu comme un identifiant.
paymentRouter.post("/sandbox/:orderId", requireAuth, sandboxPaymentForm, settleSandboxPayment);

/**
 * @swagger
 * /payments/{orderId}:
 *   post:
 *     tags: [Paiement]
 *     summary: Relancer le paiement en ligne d'une commande en attente
 *     description: Renvoie l'adresse où payer (`redirectUrl`), tant que le délai de 30 minutes court.
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ orderId, status, paymentStatus, paymentExpiresAt, redirectUrl }"
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       409:
 *         description: La commande n'attend plus de paiement
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
paymentRouter.post("/:orderId", requireAuth, paymentOrderIdParam, restartPayment);

export default paymentRouter;
