import { EntityType } from "../../models/user.model.js";
import type { IShop } from "../../models/boutique.model.js";
import type { AuthUser } from "../middlewares/auth.middleware.js";

// ─────────────────────────────────────────────
//  Qui peut gérer une boutique ?
//  Un administrateur, ou le compte boutique qui en est propriétaire.
//  requireRole ne vérifie que le type de compte : sans ce contrôle, n'importe
//  quel vendeur pourrait modifier la boutique d'un concurrent.
//  Fermé par défaut : sans identité, la réponse est non.
// ─────────────────────────────────────────────
export const canManageShop = (
  user: AuthUser | undefined,
  shop: Pick<IShop, "ownerId">
): boolean => {
  if (!user) return false;
  if (user.entityType === EntityType.ADMIN) return true;
  return user.entityType === EntityType.SHOP && shop.ownerId.toString() === user.id;
};

export const SHOP_FORBIDDEN_MESSAGE = "Vous ne pouvez gérer que vos propres boutiques.";
