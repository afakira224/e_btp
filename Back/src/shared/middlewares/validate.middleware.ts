import type { NextFunction, Request, Response } from "express";
import { validationResult } from "express-validator";
import BaseResponse from "../BaseResponse/BaseResponse.js";

// ─────────────────────────────────────────────
//  validate
//  À placer juste après les ValidationChain d'une route : interrompt la
//  requête en 422 si une règle a échoué, sans que le contrôleur ait à le faire.
// ─────────────────────────────────────────────
export const validate = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const message = errors
      .array()
      .map((e) => e.msg)
      .join(" | ");
    const response = BaseResponse.BadRequest(message);
    res.status(422).json(response);
    return;
  }

  next();
};
