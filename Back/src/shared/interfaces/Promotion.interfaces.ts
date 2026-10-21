// ─────────────────────────────────────────────
//  PROMOTION - RESPONSE DTO
// ─────────────────────────────────────────────

import { Types } from "mongoose";
import {
  type IPromotion,
  type PromotionType,
  PromotionScope,
  DiscountType,
} from "../../models/promotion.model.js";

// Élément « remisable » : suffit à calculer une réduction (panier, ligne de commande…).
export interface DiscountableItem {
  productBoutiqueId: Types.ObjectId | string;
  price: number;
  quantity: number;
}

// Calcule le montant de la réduction d'une promotion pour un ensemble de lignes.
// base = total des lignes (scope panier) ou des lignes ciblées (scope product_boutique).
export const computePromotionDiscount = (
  promo: IPromotion,
  items: DiscountableItem[]
): number => {
  let base = 0;
  if (promo.scope === PromotionScope.CART) {
    base = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  } else {
    const ids = new Set(promo.productBoutiqueIds.map((id) => id.toString()));
    base = items
      .filter((i) => ids.has(i.productBoutiqueId.toString()))
      .reduce((sum, i) => sum + i.price * i.quantity, 0);
  }

  let discount =
    promo.discountType === DiscountType.PERCENTAGE
      ? (base * promo.discountValue) / 100
      : promo.discountValue;

  if (promo.maxDiscount != null) discount = Math.min(discount, promo.maxDiscount);
  discount = Math.min(discount, base);

  return Math.max(0, Math.round(discount));
};

// Une promotion est active si elle est marquée actif, dans sa fenêtre de dates,
// et n'a pas atteint sa limite d'utilisation.
export const isPromotionActive = (promo: IPromotion, now: Date = new Date()): boolean => {
  if (!promo.actif) return false;
  if (now < promo.startDate || now > promo.endDate) return false;
  if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) return false;
  return true;
};

export interface PromotionResponseDto {
  id: string;
  nom: string;
  description?: string | undefined;
  type: PromotionType;
  scope: PromotionScope;
  discountType: DiscountType;
  discountValue: number;
  code?: string | null | undefined;
  startDate: Date;
  endDate: Date;
  productBoutiqueIds: string[];
  minAmount?: number | undefined;
  maxDiscount?: number | null | undefined;
  usageLimit?: number | null | undefined;
  usedCount: number;
  actif: boolean;
  isActive: boolean; // calculé (fenêtre de dates + limite d'usage)
  createdAt: Date;
  updatedAt: Date;
}

export const toPromotionResponseDto = (
  promo: IPromotion,
  now: Date = new Date()
): PromotionResponseDto => ({
  id: promo._id.toString(),
  nom: promo.nom,
  description: promo.description,
  type: promo.type,
  scope: promo.scope,
  discountType: promo.discountType,
  discountValue: promo.discountValue,
  code: promo.code,
  startDate: promo.startDate,
  endDate: promo.endDate,
  productBoutiqueIds: promo.productBoutiqueIds.map((id) => id.toString()),
  minAmount: promo.minAmount,
  maxDiscount: promo.maxDiscount,
  usageLimit: promo.usageLimit,
  usedCount: promo.usedCount,
  actif: promo.actif,
  isActive: isPromotionActive(promo, now),
  createdAt: promo.createdAt,
  updatedAt: promo.updatedAt,
});
