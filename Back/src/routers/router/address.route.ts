import { Router } from "express";
import { requireAuth, requireRole, requireSelf } from "../../shared/middlewares/auth.middleware.js";
import { EntityType } from "../../models/user.model.js";
import {
  createAddress,
  deleteAddress,
  getAddressById,
  getAddresses,
  setDefaultAddress,
  updateAddress,
} from "../../controllers/address.controller.js";
import {
  addressIdParam,
  createAddressForm,
  listAddressesForm,
  updateAddressForm,
} from "../../shared/forms/address.form.js";

const addressRouter = Router();

/**
 * @swagger
 * /addresses:
 *   post:
 *     tags: [Address]
 *     summary: Ajouter une adresse de livraison
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, telephone, adresse, ville]
 *             properties:
 *               userId: { type: string, example: 665f1a2b3c4d5e6f7a8b9c0d }
 *               label: { type: string, example: Maison }
 *               destinataire: { type: string, example: Mamadou Diallo }
 *               telephone: { type: string, example: "+224620000000" }
 *               adresse: { type: string, example: Rue KA-020, immeuble Bleu }
 *               ville: { type: string, example: Conakry }
 *               commune: { type: string, example: Ratoma }
 *               pays: { type: string, example: Guinée }
 *               isDefault: { type: boolean, default: false }
 *     responses:
 *       201:
 *         description: Adresse créée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Utilisateur introuvable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
addressRouter.post("/", requireAuth, requireSelf("body", "userId"), createAddressForm, createAddress);

/**
 * @swagger
 * /addresses:
 *   get:
 *     tags: [Address]
 *     summary: Lister les adresses d'un utilisateur
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *         description: Identifiant de l'utilisateur
 *     responses:
 *       200:
 *         description: Liste des adresses (adresse par défaut en tête)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 */
addressRouter.get("/", requireAuth, requireSelf("query", "userId"), listAddressesForm, getAddresses);

/**
 * @swagger
 * /addresses/{id}:
 *   get:
 *     tags: [Address]
 *     summary: Récupérer une adresse par ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Adresse trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Adresse non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
addressRouter.get("/:id", requireAuth, addressIdParam, getAddressById);

/**
 * @swagger
 * /addresses/{id}:
 *   put:
 *     tags: [Address]
 *     summary: Mettre à jour une adresse
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               label: { type: string }
 *               destinataire: { type: string }
 *               telephone: { type: string }
 *               adresse: { type: string }
 *               ville: { type: string }
 *               commune: { type: string }
 *               pays: { type: string }
 *               isDefault: { type: boolean }
 *     responses:
 *       200:
 *         description: Adresse mise à jour
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Adresse non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
addressRouter.put("/:id", requireAuth, updateAddressForm, updateAddress);

/**
 * @swagger
 * /addresses/{id}/default:
 *   patch:
 *     tags: [Address]
 *     summary: Définir une adresse comme adresse par défaut
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Adresse définie par défaut
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Adresse non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
addressRouter.patch("/:id/default", requireAuth, addressIdParam, setDefaultAddress);

/**
 * @swagger
 * /addresses/{id}:
 *   delete:
 *     tags: [Address]
 *     summary: Supprimer une adresse (soft delete)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Adresse supprimée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       404:
 *         description: Adresse non trouvée
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
addressRouter.delete("/:id", requireAuth, addressIdParam, deleteAddress);

export default addressRouter;
