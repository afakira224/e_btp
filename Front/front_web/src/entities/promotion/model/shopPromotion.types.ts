// ─────────────────────────────────────────────
//  Promotions de boutique — miroir de ShopPromotionDto
//  (Back/src/shared/interfaces/ShopPromotion.interfaces.ts) et des règles
//  de Back/src/shared/helpers/promotion.rules.ts que l'écran affiche.
//  La boutique planifie et lance seule ses promotions : aucune validation.
// ─────────────────────────────────────────────

export const ShopPromotionType = {
  PRODUCT_DISCOUNT: "product_discount",
  SHOP_DISCOUNT: "shop_discount",
  COUPON: "coupon",
  FLASH_SALE: "flash_sale",
  QUANTITY_TIERS: "quantity_tiers",
  FREE_SHIPPING: "free_shipping",
} as const;
export type ShopPromotionType = (typeof ShopPromotionType)[keyof typeof ShopPromotionType];

export const SHOP_PROMOTION_TYPES: readonly ShopPromotionType[] = Object.values(ShopPromotionType);

export const SHOP_PROMOTION_TYPE_LABELS: Record<ShopPromotionType, string> = {
  product_discount: "Remise produit",
  shop_discount: "Promotion boutique",
  coupon: "Code promo",
  flash_sale: "Vente flash",
  quantity_tiers: "Prix par quantité",
  free_shipping: "Livraison offerte",
};

/** Ce que chaque type fait, en une ligne, pour le choix du type. */
export const SHOP_PROMOTION_TYPE_HINTS: Record<ShopPromotionType, string> = {
  product_discount: "Un prix barré sur 1 à 50 de vos offres, de 1 à 30 jours.",
  shop_discount: "Une remise sur toute la boutique, ou une famille ou une catégorie.",
  coupon: "Un code à donner à vos clients, valable sur vos articles seulement.",
  flash_sale: "Une forte remise de 2 à 72 heures, sur une quantité limitée.",
  quantity_tiers: "Moins cher par unité à partir d'une quantité : l'achat de chantier.",
  free_shipping: "Les frais de livraison offerts à partir d'un montant.",
};

export const ShopPromotionStatus = {
  DRAFT: "draft",
  SCHEDULED: "scheduled",
  ACTIVE: "active",
  PAUSED: "paused",
  ENDED: "ended",
  STOPPED: "stopped",
} as const;
export type ShopPromotionStatus = (typeof ShopPromotionStatus)[keyof typeof ShopPromotionStatus];

export const SHOP_PROMOTION_STATUS_LABELS: Record<ShopPromotionStatus, string> = {
  draft: "Brouillon",
  scheduled: "Programmée",
  active: "En cours",
  paused: "En pause",
  ended: "Terminée",
  stopped: "Arrêtée",
};

export const SHOP_PROMOTION_STATUS_TONES: Record<ShopPromotionStatus, "neutral" | "progress" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  scheduled: "progress",
  active: "success",
  paused: "warning",
  ended: "neutral",
  stopped: "danger",
};

export type PromotionAction = "launch" | "pause" | "resume" | "extend" | "stop";

export const PROMOTION_TABS = { active: "En cours", scheduled: "Programmées", ended: "Terminées" } as const;
export type PromotionTab = keyof typeof PROMOTION_TABS;

/** Limites que l'écran annonce ; le serveur les applique. */
export const PROMO_LIMITS = {
  minPercent: 5,
  maxPercent: 70,
  confirmAbove: 50,
  maxDays: { product_discount: 30, shop_discount: 30, coupon: 90, free_shipping: 90 } as Partial<Record<ShopPromotionType, number>>,
  flashHours: { min: 2, max: 72 },
  maxOffers: { product_discount: 50, flash_sale: 10, quantity_tiers: 1 } as Partial<Record<ShopPromotionType, number>>,
  maxTiers: 3,
} as const;

export interface PromotionOffer {
  id: string;
  name: string;
  price: number;
  image?: string | undefined;
}

export interface PromotionStats {
  orders: number;
  units: number;
  revenue: number;
  discount: number;
}

export interface ShopPromotion {
  id: string;
  boutiqueId: string;
  type: ShopPromotionType;
  typeLabel: string;
  nom: string;
  description?: string | undefined;
  status: ShopPromotionStatus;
  statusLabel: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  startDate: string;
  /** null : un prix par quantité n'a pas de fin. */
  endDate: string | null;
  productBoutiqueIds: string[];
  offers: PromotionOffer[];
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
  createdAt: string;
  updatedAt: string;
}

/** Corps envoyé pour créer ou modifier une promotion. */
export interface ShopPromotionInput {
  type: ShopPromotionType;
  nom: string;
  description?: string | undefined;
  discountType?: "percentage" | "fixed" | undefined;
  discountValue?: number | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  productBoutiqueIds?: string[] | undefined;
  familleIds?: string[] | undefined;
  categoryIds?: string[] | undefined;
  excludedOfferIds?: string[] | undefined;
  code?: string | undefined;
  minAmount?: number | undefined;
  maxDiscount?: number | undefined;
  usageLimit?: number | undefined;
  perCustomerLimit?: number | undefined;
  stackable?: boolean | undefined;
  tiers?: { minQuantity: number; discountValue: number }[] | undefined;
  flashQuantity?: number | undefined;
  confirmHighDiscount?: boolean | undefined;
  launch?: "now" | "schedule" | "draft" | undefined;
}

/** Ce que la promotion fait, en clair : « −15 % », « Code VOLTA10 : −10 % dès 500 000 GNF »… */
export const promotionSummary = (promo: Pick<ShopPromotion, "type" | "discountType" | "discountValue" | "code" | "minAmount" | "tiers" | "flashQuantity">, formatAmount: (amount: number) => string): string => {
  const value = promo.discountType === "fixed" ? formatAmount(promo.discountValue) : `${promo.discountValue} %`;
  switch (promo.type) {
    case "coupon":
      return `Code ${promo.code ?? ""} : −${value}${promo.minAmount ? ` dès ${formatAmount(promo.minAmount)}` : ""}`;
    case "quantity_tiers":
      return promo.tiers.map((tier) => `−${tier.discountValue} % dès ${tier.minQuantity}`).join(", ");
    case "free_shipping":
      return `Livraison offerte dès ${formatAmount(promo.minAmount ?? 0)}`;
    case "flash_sale":
      return `−${value}${promo.flashQuantity ? ` sur ${promo.flashQuantity} unités` : ""}`;
    default:
      return `−${value}`;
  }
};

// ── Campagnes de la plateforme ──────────────
export interface Campaign {
  id: string;
  slug: string;
  nom: string;
  description?: string | undefined;
  startDate: string;
  endDate: string;
  minDiscount: number;
  familleIds: string[];
  image?: string | null | undefined;
  actif: boolean;
  state: "upcoming" | "running" | "ended";
  offerCount?: number | undefined;
}

export const CAMPAIGN_STATE_LABELS: Record<Campaign["state"], string> = {
  upcoming: "À venir",
  running: "En cours",
  ended: "Terminée",
};
