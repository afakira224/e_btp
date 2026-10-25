import { Router } from "express";
import { getComplements, getRecommandations } from "../../controllers/recommandation.controller.js";
import { complementsForm, recommandationsForm } from "../../shared/forms/recommandation.form.js";

const recommandationRouter = Router();

/**
 * @swagger
 * /recommandations:
 *   get:
 *     tags: [Recommandations]
 *     summary: Sélections personnalisées d'une page
 *     description: |
 *       Blocs calculés d'après ce que le client a fait (commandes, panier,
 *       favoris, produits vus) et ce qu'il a dit de son projet. Session
 *       facultative : un visiteur sans compte envoie ses produits vus dans
 *       `vus`. Chaque bloc porte une phrase qui explique sa présence.
 *       `personnalise: false` : rien n'est connu, la page garde ses listes.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: string, enum: [accueil, promotions, nouveautes, meilleures-ventes], default: accueil }
 *       - in: query
 *         name: vus
 *         schema: { type: string }
 *         description: Identifiants d'offres vues, du plus récent au plus ancien, séparés par des virgules (20 au plus)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 24, default: 12 }
 *         description: Produits par bloc
 *     responses:
 *       200:
 *         description: "Profil et blocs : { personnalise, profil: { rayons, etapeActuelle, etapeSuivante, projet }, blocs: [{ cle, titre, raison, produits }] }"
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       422:
 *         description: Paramètres invalides
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
recommandationRouter.get("/", recommandationsForm, getRecommandations);

/**
 * @swagger
 * /recommandations/complements:
 *   get:
 *     tags: [Recommandations]
 *     summary: « Souvent achetés avec » une fiche produit ou un panier
 *     parameters:
 *       - in: query
 *         name: offres
 *         required: true
 *         schema: { type: string }
 *         description: Identifiants d'offres séparés par des virgules (une sur la fiche produit, celles du panier)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 24, default: 8 }
 *     responses:
 *       200:
 *         description: "Un bloc { cle, titre, raison, produits }, ou null"
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseSuccess' }
 *       422:
 *         description: Paramètres invalides
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/BaseError' }
 */
recommandationRouter.get("/complements", complementsForm, getComplements);

export default recommandationRouter;
