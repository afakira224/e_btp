// ─────────────────────────────────────────────
//  PROMOTION DE BOUTIQUE - RESPONSE DTO
//  Lue par sa boutique (et l'administration) : état calculé, actions
//  permises, offres visées, ventes faites sous la promotion.
// ─────────────────────────────────────────────
import type { IPromotion } from "../../models/promotion.model.js";
import {
  availablePromotionActions,
  NO_END,
  PROMOTION_STATUS_LABELS,
  PROMOTION_TYPE_LABELS,
  statusAt,
  type PromotionAction,
} from "../helpers/promotion.rules.js";
import type { PromotionStats } from "../services/promotion.service.js";

export interface PromotionOfferDto {
  id: string;
  name: string;
  price: number;
  image?: string | undefined;
}

export interface ShopPromotionDto {
  id: string;
  boutiqueId: string;
  type: string;
  typeLabel: string;
  nom: string;
  description?: string | undefined;
  status: string;
  statusLabel: string;
  discountType: string;
  discountValue: number;
  startDate: Date;
  /** null : un prix par quantité n'a pas de fin. */
  endDate: Date | null;
  productBoutiqueIds: string[];
  offers: PromotionOfferDto[];
  target?: { familleIds: string[]; categoryIds: string[]; excludedOfferIds: string[] } | undefined;
  code?: string | null | undefined;
  minAmount?: number | undefined;
  maxDiscount?: number | null | undefined;
  usageLimit?: number | null | undefined;
  usedCount: number;
  perCustomerLimit?: number | null | undefined;
  stackable: boolean;
  tiers: { minQuantity: number; discountValue: number }[];
  flashQuantity?: number | null | undefined;
  flashSold: number;
  campaignId?: string | null | undefined;
  stopReason?: string | null | undefined;
  availableActions: PromotionAction[];
  stats?: PromotionStats | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export const toShopPromotionDto = (
  promo: IPromotion,
  now = new Date(),
  extra: { offers?: PromotionOfferDto[] | undefined; stats?: PromotionStats | undefined } = {}
): ShopPromotionDto => {
  const status = statusAt(promo, now);
  return {
    id: String(promo._id),
    boutiqueId: String(promo.boutiqueId),
    type: promo.type,
    typeLabel: PROMOTION_TYPE_LABELS[promo.type] ?? promo.type,
    nom: promo.nom,
    ...(promo.description ? { description: promo.description } : {}),
    status,
    statusLabel: PROMOTION_STATUS_LABELS[status],
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    startDate: promo.startDate,
    endDate: promo.endDate.getTime() >= NO_END.getTime() ? null : promo.endDate,
    productBoutiqueIds: promo.productBoutiqueIds.map(String),
    offers: extra.offers ?? [],
    ...(promo.target
      ? {
          target: {
            familleIds: promo.target.familleIds.map(String),
            categoryIds: promo.target.categoryIds.map(String),
            excludedOfferIds: promo.target.excludedOfferIds.map(String),
          },
        }
      : {}),
    code: promo.code,
    minAmount: promo.minAmount,
    maxDiscount: promo.maxDiscount,
    usageLimit: promo.usageLimit,
    usedCount: promo.usedCount,
    perCustomerLimit: promo.perCustomerLimit,
    stackable: promo.stackable,
    tiers: promo.tiers.map((tier) => ({ minQuantity: tier.minQuantity, discountValue: tier.discountValue })),
    flashQuantity: promo.flashQuantity,
    flashSold: promo.flashSold,
    campaignId: promo.campaignId ? String(promo.campaignId) : null,
    stopReason: promo.stopReason,
    availableActions: availablePromotionActions(promo, now),
    ...(extra.stats ? { stats: extra.stats } : {}),
    createdAt: promo.createdAt,
    updatedAt: promo.updatedAt,
  };
};
