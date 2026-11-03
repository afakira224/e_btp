import { Router } from "express";
import { EntityType } from "../../models/user.model.js";
import { requireAuth, requireRole } from "../../shared/middlewares/auth.middleware.js";
import {
  boostActionHandler,
  getBoostHandler,
  getBoostSettingsHandler,
  listAllBoosts,
  sponsoredHandler,
  updateBoostSettingsHandler,
} from "../../controllers/boost.controller.js";
import { boostIdParam, boostSettingsForm } from "../../shared/forms/marketing.form.js";

export const boostRouter = Router();
const adminOnly = [requireAuth, requireRole(EntityType.ADMIN)];
const manager = [requireAuth, requireRole(EntityType.SHOP, EntityType.ADMIN)];

/**
 * @swagger
 * /boosts:
 *   get:
 *     summary: Tous les boosts (status=) — administration
 *     tags: [Boosts]
 * /boosts/settings:
 *   get:
 *     summary: Prix de la visite et des 1 000 affichages, crédits offerts chaque mois
 *     tags: [Boosts]
 *   put:
 *     summary: Modifier ces réglages — administration
 *     tags: [Boosts]
 * /boosts/{id}/{action}:
 *   patch:
 *     summary: Mettre en pause, reprendre ou arrêter un boost (le budget non dépensé est rendu)
 *     tags: [Boosts]
 */
boostRouter.get("/", ...adminOnly, listAllBoosts);
boostRouter.get("/settings", requireAuth, getBoostSettingsHandler);
boostRouter.put("/settings", ...adminOnly, boostSettingsForm, updateBoostSettingsHandler);
boostRouter.get("/:id", ...manager, boostIdParam, getBoostHandler);
boostRouter.patch("/:id/:action", ...manager, boostIdParam, boostActionHandler);

/**
 * @swagger
 * /sponsored:
 *   get:
 *     summary: Produits sponsorisés d'une page (slot=home|search|category|similar|promotions), choisis pour ce visiteur
 *     tags: [Boosts]
 */
export const sponsoredRouter = Router();
sponsoredRouter.get("/", sponsoredHandler);
