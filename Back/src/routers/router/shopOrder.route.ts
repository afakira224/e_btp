import { Router } from "express";
import { requireAuth, requireRole } from "../../shared/middlewares/auth.middleware.js";
import { EntityType } from "../../models/user.model.js";
import { uploadMedia, validateUploadedFileSize } from "../../shared/helpers/fileUpload.js";
import {
  getShopOrderById,
  listShopOrders,
  performShopOrderAction,
} from "../../controllers/shopOrder.controller.js";
import {
  listShopOrdersForm,
  shopOrderActionForm,
  shopOrderIdParam,
} from "../../shared/forms/shopOrder.form.js";

const shopOrderRouter = Router();

/**
 * @swagger
 * /shop-orders:
 *   get:
 *     tags: [Sous-commandes]
 *     summary: Commandes d'une boutique (gérant) ou de toutes (administration)
 *     description: >
 *       Une sous-commande = la part d'une commande qui revient à une boutique.
 *       Un gérant passe obligatoirement `boutiqueId`, et la boutique doit être
 *       la sienne. `group` filtre par onglet ; `counts` donne le nombre de
 *       sous-commandes de chaque onglet. Les commandes en ligne pas encore
 *       payées n'apparaissent pas.
 *     parameters:
 *       - in: query
 *         name: boutiqueId
 *         schema: { type: string }
 *       - in: query
 *         name: group
 *         schema: { type: string, enum: [todo, preparing, delivering, delivered, issues, done] }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Recherche sur la référence
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: "{ shopOrders, total, page, totalPages, counts }"
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       403:
 *         description: La boutique n'est pas celle du gérant
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
shopOrderRouter.get(
  "/",
  requireAuth, requireRole(EntityType.SHOP, EntityType.ADMIN),
  listShopOrdersForm,
  listShopOrders
);

/**
 * @swagger
 * /shop-orders/{id}:
 *   get:
 *     tags: [Sous-commandes]
 *     summary: Une sous-commande (client, gérant de la boutique ou administration)
 *     description: >
 *       Le client voit son code de remise ; la boutique voit les coordonnées du
 *       client, jamais le code. `availableActions` liste ce que le lecteur peut
 *       faire maintenant.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Sous-commande
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       403:
 *         description: Ni le client, ni la boutique, ni l'administration
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
shopOrderRouter.get("/:id", requireAuth, shopOrderIdParam, getShopOrderById);

/**
 * @swagger
 * /shop-orders/{id}/{action}:
 *   patch:
 *     tags: [Sous-commandes]
 *     summary: Faire avancer une sous-commande
 *     description: |
 *       | Action | Qui | Depuis | Champs |
 *       | --- | --- | --- | --- |
 *       | confirm | boutique | à confirmer | |
 *       | refuse | boutique | à confirmer, en préparation | reason (out_of_stock, wrong_price, area_not_served, other), note |
 *       | ship / ready | boutique | en préparation (livraison / retrait) | |
 *       | deliver | boutique | en livraison, prête au retrait | code (6 chiffres, donné par le client) |
 *       | delivery-failed | boutique | en livraison | reason (customer_absent, address_not_found, parcel_refused, other) |
 *       | retry / abandon | boutique | livraison échouée | |
 *       | cancel | client | à confirmer, en préparation | reason (changed_mind, ordering_error, too_slow, other) facultatif |
 *       | admin-cancel | administration | avant livraison | note |
 *       | return | client | livrée, 7 jours au plus | reason (not_as_described, damaged, incomplete, not_received), note, photos (multipart, exigées si damaged) |
 *       | accept-return / reject-return | boutique | retour demandé | note (exigée pour refuser) |
 *       | resolve-dispute | administration | litige | resolution (refund_full, refund_partial, rejected), note, refundAmount |
 *       | confirm-refund | boutique, administration | retournée, remboursement en attente | |
 *
 *       Une fin négative rend le stock (sauf rupture : l'offre passe à 0) et
 *       rembourse ce qui a été payé en ligne.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: action
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string }
 *               note: { type: string }
 *               code: { type: string, example: "048213" }
 *               resolution: { type: string, enum: [refund_full, refund_partial, rejected] }
 *               refundAmount: { type: integer }
 *     responses:
 *       200:
 *         description: Sous-commande à jour
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       400:
 *         description: Action impossible à ce statut, motif ou code manquant
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 *       403:
 *         description: Action réservée à un autre acteur
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
shopOrderRouter.patch(
  "/:id/:action",
  requireAuth,
  uploadMedia.array("photos", 3),
  validateUploadedFileSize,
  shopOrderActionForm,
  performShopOrderAction
);

export default shopOrderRouter;
