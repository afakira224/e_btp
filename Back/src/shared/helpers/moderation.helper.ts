import type { IShop } from "../../models/boutique.model.js";

/** La boutique n'accepte pas de nouvelle commande en ce moment (suspendue par la modération). */
export const isShopSuspended = (shop: Pick<IShop, "suspendedUntil">, now = new Date()): boolean =>
  !!shop.suspendedUntil && shop.suspendedUntil.getTime() > now.getTime();

/** Les promotions de la boutique sont suspendues par la modération (plus de promotion ni de boost). */
export const arePromotionsBlocked = (shop: Pick<IShop, "promotionsBlockedUntil">, now = new Date()): boolean =>
  !!shop.promotionsBlockedUntil && shop.promotionsBlockedUntil.getTime() > now.getTime();
