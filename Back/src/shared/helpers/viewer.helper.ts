import { createHash } from "crypto";
import type { Request } from "express";
import type { Viewer } from "../services/boost.service.js";

/**
 * Qui regarde : le compte connecté, sinon une empreinte anonyme (adresse et
 * navigateur, hachés). Sert au plafond d'affichages et aux visites payées
 * des boosts ; rien n'est gardé au-delà de quelques jours.
 */
export const viewerOf = (req: Request): Viewer => {
  const userId = req.session?.user?.id ? String(req.session.user.id) : undefined;
  if (userId) return { key: `user:${userId}`, userId };
  const raw = `${req.ip ?? ""}|${req.get?.("user-agent") ?? ""}`;
  return { key: `anon:${createHash("sha256").update(raw).digest("hex").slice(0, 32)}` };
};
