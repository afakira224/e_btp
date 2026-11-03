import type { Request, Response } from "express";
import { validationResult } from "express-validator";
import BaseResponse from "../BaseResponse/BaseResponse.js";
import logger from "../logger/logger.js";
import { HttpError } from "../middlewares/error.middleware.js";

/** Réponse d'erreur : une HttpError garde son code, le reste devient une 500 journalisée. */
export const sendError = (res: Response, error: unknown, context: string) => {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json(new BaseResponse(false, error.message, error.statusCode, null));
  }
  logger.error(`${context} : ${(error as Error).message}`);
  const response = BaseResponse.ServerError((error as Error).message);
  return res.status(response.statusCode).json(response);
};

/** Erreurs du formulaire, en 422 ; null quand tout est valide. */
export const invalid = (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return null;
  return res.status(422).json(BaseResponse.BadRequest(errors.array().map((e) => e.msg).join(" | ")));
};

export const pageOf = (req: Request, max = 50) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1")) || 1);
  const limit = Math.max(1, Math.min(max, parseInt(String(req.query.limit ?? "20")) || 20));
  return { page, limit };
};
