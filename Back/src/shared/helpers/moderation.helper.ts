import type { IShop } from "../../models/boutique.model.js";

/** La boutique n'accepte pas de nouvelle commande en ce moment (suspendue par la modération). */
export const isShopSuspended = (shop: Pick<IShop, "suspendedUntil">, now = new Date()): boolean =>
  !!shop.suspendedUntil && shop.suspendedUntil.getTime() > now.getTime();
