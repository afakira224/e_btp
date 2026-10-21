import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import multer from "multer";
import BaseResponse from "../BaseResponse/BaseResponse.js";
import logger from "../logger/logger.js";

// ─────────────────────────────────────────────
//  Erreur métier explicite, levée par les contrôleurs.
//  Le gestionnaire global la traduit en réponse HTTP.
// ─────────────────────────────────────────────
export class HttpError extends Error {
  constructor(
    public override readonly message: string,
    public readonly statusCode = 500
  ) {
    super(message);
    this.name = "HttpError";
  }
}

// ─────────────────────────────────────────────
//  asyncHandler
//  Enveloppe un contrôleur asynchrone pour que toute promesse rejetée
//  parte vers le gestionnaire d'erreurs global au lieu d'être perdue.
// ─────────────────────────────────────────────
export const asyncHandler =
  <T extends Request = Request>(
    handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>
  ) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req as T, res, next)).catch(next);
  };

// ─────────────────────────────────────────────
//  notFoundHandler
//  Dernière route déclarée : toute URL inconnue renvoie un 404 au format
//  BaseResponse, plutôt que la page HTML par défaut d'Express.
// ─────────────────────────────────────────────
export const notFoundHandler = (req: Request, res: Response): void => {
  const response = BaseResponse.NotFound(`Route introuvable : ${req.method} ${req.originalUrl}`);
  res.status(response.statusCode).json(response);
};

// Traduit les erreurs techniques connues en réponse HTTP lisible.
const translate = (error: unknown): { statusCode: number; message: string } => {
  if (error instanceof HttpError) {
    return { statusCode: error.statusCode, message: error.message };
  }

  // Champ unique déjà utilisé (code promo, email…).
  if (typeof error === "object" && error !== null && (error as { code?: number }).code === 11000) {
    const fields = Object.keys((error as { keyValue?: Record<string, unknown> }).keyValue ?? {});
    const detail = fields.length ? ` (${fields.join(", ")})` : "";
    return { statusCode: 409, message: `Cette ressource existe déjà${detail}.` };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const details = Object.values(error.errors)
      .map((e) => e.message)
      .join(" | ");
    return { statusCode: 400, message: details || "Données invalides." };
  }

  // Identifiant Mongo mal formé passé à findById.
  if (error instanceof mongoose.Error.CastError) {
    return { statusCode: 400, message: `Identifiant invalide : ${String(error.value)}` };
  }

  if (error instanceof multer.MulterError) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "Le fichier dépasse la taille maximale autorisée."
        : `Erreur d'envoi de fichier : ${error.message}`;
    return { statusCode: 400, message };
  }

  return { statusCode: 500, message: (error as Error)?.message ?? "Erreur interne du serveur" };
};

// ─────────────────────────────────────────────
//  errorHandler
//  Gestionnaire d'erreurs global (4 arguments : signature imposée par Express).
//  À déclarer en dernier, après toutes les routes.
// ─────────────────────────────────────────────
export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const { statusCode, message } = translate(error);

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} — ${message}`);
    if (error instanceof Error && error.stack) logger.error(error.stack);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} — ${statusCode} ${message}`);
  }

  // Ne jamais exposer le détail d'une erreur interne en production.
  const exposed =
    statusCode >= 500 && process.env.NODE_ENV === "production"
      ? "Erreur interne du serveur"
      : message;

  const response = new BaseResponse(false, exposed, statusCode, null);
  res.status(statusCode).json(response);
};
