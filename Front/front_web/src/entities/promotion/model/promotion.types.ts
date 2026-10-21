// ─────────────────────────────────────────────
//  Promotions — miroir du DTO de retour du back
//  (Back/src/shared/interfaces/Promotion.interfaces.ts) : `id` et non
//  `_id`, horodatages en chaînes une fois sérialisés.
// ─────────────────────────────────────────────

export const PromotionType = {
  COUPON: "coupon",
  FLASH_SALE: "flash_sale",
} as const;

export type PromotionType = (typeof PromotionType)[keyof typeof PromotionType];

export const PromotionScope = {
  PRODUCT_BOUTIQUE: "product_boutique",
  CART: "cart",
} as const;

export type PromotionScope = (typeof PromotionScope)[keyof typeof PromotionScope];

export const DiscountType = {
  PERCENTAGE: "percentage",
  FIXED: "fixed",
} as const;

export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType];

export interface Promotion {
  id: string;
  nom: string;
  description?: string | undefined;
  type: PromotionType;
  scope: PromotionScope;
  discountType: DiscountType;
  discountValue: number;
  code?: string | null | undefined;
  startDate: string;
  endDate: string;
  productBoutiqueIds: string[];
  minAmount?: number | undefined;
  maxDiscount?: number | null | undefined;
  actif: boolean;
  /** Calculé par le back : fenêtre de dates et limite d'usage. */
  isActive?: boolean | undefined;
}

/**
 * Remise lisible : « 20 % » ou « 5 000 GNF ». Espace fine insécable avant
 * « % » : en typographie française il ne se sépare jamais de son nombre.
 */
export const formatDiscount = (
  promotion: Pick<Promotion, "discountType" | "discountValue">,
  formatAmount: (amount: number) => string
): string =>
  promotion.discountType === DiscountType.PERCENTAGE
    ? `${promotion.discountValue} %`
    : formatAmount(promotion.discountValue);

/** Une promotion ne compte que si elle est active ET dans sa fenêtre. */
export const isRunning = (promotion: Promotion, now = new Date()): boolean =>
  promotion.actif &&
  new Date(promotion.startDate) <= now &&
  new Date(promotion.endDate) > now;

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** La fenêtre est close : le compte à rebours ne doit plus rien afficher. */
  expired: boolean;
}

export const countdownTo = (endDate: string, now = Date.now()): Countdown => {
  const remaining = new Date(endDate).getTime() - now;

  if (remaining <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }

  const seconds = Math.floor(remaining / 1000);

  return {
    days: Math.floor(seconds / 86_400),
    hours: Math.floor((seconds % 86_400) / 3_600),
    minutes: Math.floor((seconds % 3_600) / 60),
    seconds: seconds % 60,
    expired: false,
  };
};
