import type { Request, Response } from "express";
import { Types } from "mongoose";
import { validationResult } from "express-validator";
import { Sanction, type SanctionTargetKind, type SanctionType } from "../models/sanction.model.js";
import BaseResponse from "../shared/BaseResponse/BaseResponse.js";
import logger from "../shared/logger/logger.js";
import { HttpError } from "../shared/middlewares/error.middleware.js";
import { toSanctionDto } from "../shared/interfaces/Support.interfaces.js";
import { applySanction, liftSanction, requestLift } from "../shared/services/sanction.service.js";

// ─────────────────────────────────────────────
//  Sanctions.
//
//   POST  /sanctions                    admin : masquer, avertir, suspendre, bloquer
//   GET   /sanctions?targetKind=&targetId=&pending=   admin : historique d'une cible, mesures à revoir
//   GET   /sanctions/mine               les mesures qui me visent (moi ou mes boutiques)
//   PATCH /sanctions/:id/lift           admin : lever une mesure
//   PATCH /sanctions/:id/request-lift   boutique : annonce corrigée, remise en ligne demandée
// ─────────────────────────────────────────────

const sendError = (res: Response, error: unknown, context: string) => {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json(new BaseResponse(false, error.message, error.statusCode, null));
  }
  logger.error(`${context} : ${(error as Error).message}`);
  const response = BaseResponse.ServerError((error as Error).message);
  return res.status(response.statusCode).json(response);
};

const invalid = (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return null;
  return res.status(422).json(BaseResponse.BadRequest(errors.array().map((e) => e.msg).join(" | ")));
};

export const createSanction = async (req: Request, res: Response) => {
  try {
    if (invalid(req, res)) return;
    const { type, targetKind, targetId, reason, ticketId, days } = req.body as Record<string, unknown>;
    const sanction = await applySanction({
      type: type as SanctionType,
      targetKind: targetKind as SanctionTargetKind,
      targetId: String(targetId),
      reason: String(reason ?? ""),
      ticketId: typeof ticketId === "string" ? ticketId : undefined,
      days: typeof days === "number" ? days : undefined,
      createdBy: req.user?.id ?? null,
    });
    const response = BaseResponse.Created(toSanctionDto(sanction), "Mesure appliquée.");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur application d'une sanction");
  }
};

export const listSanctions = async (req: Request, res: Response) => {
  try {
    if (invalid(req, res)) return;
    const { targetKind, targetId, pending } = req.query as Record<string, string | undefined>;
    const filter: Record<string, unknown> = {};
    if (targetKind) filter["target.kind"] = targetKind;
    if (targetId) filter["target.id"] = new Types.ObjectId(targetId);
    // À revoir : un masquage provisoire à confirmer, une remise en ligne demandée.
    if (pending === "true") {
      filter.liftedAt = null;
      filter.$or = [{ provisional: true }, { liftRequestedAt: { $ne: null } }];
    }
    const sanctions = await Sanction.find(filter).sort({ createdAt: -1 }).limit(100);
    const now = new Date();
    const response = BaseResponse.WithSuccess(sanctions.map((sanction) => toSanctionDto(sanction, now)), "Mesures récupérées.");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur liste des sanctions");
  }
};

export const mySanctions = async (req: Request, res: Response) => {
  try {
    const sanctions = await Sanction.find({ notifiedUserId: new Types.ObjectId(req.user!.id) }).sort({ createdAt: -1 });
    const now = new Date();
    const response = BaseResponse.WithSuccess(sanctions.map((sanction) => toSanctionDto(sanction, now)), "Mesures récupérées.");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur lecture de mes sanctions");
  }
};

export const liftSanctionHandler = async (req: Request, res: Response) => {
  try {
    if (invalid(req, res)) return;
    const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
    const sanction = await liftSanction(String(req.params.id), req.user?.id ?? null, reason);
    const response = BaseResponse.WithSuccess(toSanctionDto(sanction), "Mesure levée.");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur levée d'une sanction");
  }
};

export const requestLiftHandler = async (req: Request, res: Response) => {
  try {
    if (invalid(req, res)) return;
    const sanction = await requestLift(String(req.params.id), req.user!.id);
    const response = BaseResponse.WithSuccess(toSanctionDto(sanction), "Demande de remise en ligne transmise.");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    return sendError(res, error, "Erreur demande de remise en ligne");
  }
};
