import { Router } from "express";
import { EntityType } from "../../models/user.model.js";
import { requireAuth, requireRole } from "../../shared/middlewares/auth.middleware.js";
import {
  createSanction,
  liftSanctionHandler,
  listSanctions,
  mySanctions,
  requestLiftHandler,
} from "../../controllers/sanction.controller.js";
import {
  createSanctionForm,
  liftSanctionForm,
  listSanctionsForm,
  sanctionIdParam,
} from "../../shared/forms/sanction.form.js";

const sanctionRouter = Router();
const adminOnly = [requireAuth, requireRole(EntityType.ADMIN)];

/**
 * @swagger
 * /sanctions:
 *   post:
 *     summary: Appliquer une mesure (hide, warning, suspension, block) — administration
 *     tags: [Sanctions]
 *   get:
 *     summary: Historique des mesures d'une cible, ou celles à revoir (pending=true) — administration
 *     tags: [Sanctions]
 */
sanctionRouter.post("/", ...adminOnly, createSanctionForm, createSanction);
sanctionRouter.get("/", ...adminOnly, listSanctionsForm, listSanctions);

/**
 * @swagger
 * /sanctions/mine:
 *   get:
 *     summary: Les mesures qui visent le compte connecté (ou ses boutiques et annonces)
 *     tags: [Sanctions]
 */
sanctionRouter.get("/mine", requireAuth, mySanctions);

/**
 * @swagger
 * /sanctions/{id}/lift:
 *   patch:
 *     summary: Lever une mesure — administration
 *     tags: [Sanctions]
 * /sanctions/{id}/request-lift:
 *   patch:
 *     summary: Annonce corrigée, remise en ligne demandée — boutique visée
 *     tags: [Sanctions]
 */
sanctionRouter.patch("/:id/lift", ...adminOnly, liftSanctionForm, liftSanctionHandler);
sanctionRouter.patch("/:id/request-lift", requireAuth, sanctionIdParam, requestLiftHandler);

export default sanctionRouter;
