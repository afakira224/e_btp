import type { NextFunction, Request, Response } from "express";
import { EntityType } from "../../models/user.model.js";
import type { SessionUser } from "../config/session.config.js";
import BaseResponse from "../BaseResponse/BaseResponse.js";
import logger from "../logger/logger.js";

// ─────────────────────────────────────────────
//  Identité portée par la session serveur.
// ─────────────────────────────────────────────
export type AuthUser = SessionUser;

// Enrichit Request : req.user est renseigné par requireAuth.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// ─────────────────────────────────────────────
//  requireAuth
//  Lit l'identité dans la session et renseigne req.user.
//  Aucune donnée ne vient du client : le cookie ne porte qu'un identifiant
//  de session signé, l'identité reste en base.
// ─────────────────────────────────────────────
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const sessionUser = req.session?.user;

  if (!sessionUser?.id) {
    const response = BaseResponse.UnAuthorized("Session absente ou expirée, veuillez vous connecter.");
    res.status(response.statusCode).json(response);
    return;
  }

  req.user = { id: String(sessionUser.id), entityType: sessionUser.entityType };
  next();
};

// ─────────────────────────────────────────────
//  requireRole
//  Restreint l'accès à certains types d'entités (admin, boutique…).
//  À placer après requireAuth.
// ─────────────────────────────────────────────
export const requireRole =
  (...roles: EntityType[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      const response = BaseResponse.UnAuthorized("Authentification requise.");
      res.status(response.statusCode).json(response);
      return;
    }

    if (!roles.includes(req.user.entityType)) {
      logger.warn(
        `Accès refusé : ${req.user.id} (${req.user.entityType}) sur une route réservée à ${roles.join(", ")}`
      );
      const response = BaseResponse.Forbidden();
      res.status(response.statusCode).json(response);
      return;
    }

    next();
  };

// ─────────────────────────────────────────────
//  requireSelf
//  Vérifie que l'identifiant utilisateur visé par la requête est bien celui
//  du titulaire de la session. Empêche de lire ou modifier les données
//  d'autrui (panier, commandes, adresses…). Les administrateurs sont exemptés.
// ─────────────────────────────────────────────
export const requireSelf =
  (source: "params" | "body" | "query" = "params", field = "userId") =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      const response = BaseResponse.UnAuthorized("Authentification requise.");
      res.status(response.statusCode).json(response);
      return;
    }

    // Un administrateur peut agir pour le compte de n'importe quel utilisateur.
    if (req.user.entityType === EntityType.ADMIN) {
      next();
      return;
    }

    const target = (req[source] as Record<string, unknown> | undefined)?.[field];

    if (target !== undefined && String(target) !== req.user.id) {
      logger.warn(`Accès refusé : ${req.user.id} a tenté d'accéder aux données de ${String(target)}`);
      const response = BaseResponse.Forbidden("Vous ne pouvez accéder qu'à vos propres données.");
      res.status(response.statusCode).json(response);
      return;
    }

    next();
  };
