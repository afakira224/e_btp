import rateLimit, { type Options } from "express-rate-limit";
import BaseResponse from "../BaseResponse/BaseResponse.js";
import logger from "../logger/logger.js";

// Réponse commune à tous les limiteurs, au format BaseResponse.
const handler: Options["handler"] = (req, res) => {
  logger.warn(`Trop de requêtes depuis ${req.ip} sur ${req.method} ${req.originalUrl}`);
  const response = new BaseResponse(
    false,
    "Trop de requêtes. Veuillez réessayer plus tard.",
    429,
    null
  );
  res.status(429).json(response);
};

const base = {
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
  handler,
  // Les tests ne doivent jamais être limités.
  skip: () => process.env.NODE_ENV === "test",
};

// ─────────────────────────────────────────────
//  Limiteur global : protège l'API d'un usage abusif.
// ─────────────────────────────────────────────
export const globalLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 1000,
});

// ─────────────────────────────────────────────
//  Limiteur d'authentification : freine le bourrage d'identifiants
//  sur /login et /register.
// ─────────────────────────────────────────────
export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true, // seules les tentatives échouées sont comptées
});

// ─────────────────────────────────────────────
//  Limiteur d'envoi d'emails : évite d'utiliser l'API comme relais de spam
//  (mot de passe oublié, renvoi de vérification).
// ─────────────────────────────────────────────
export const mailLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000, // 1 heure
  limit: 5,
});
