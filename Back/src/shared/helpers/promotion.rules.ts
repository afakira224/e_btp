import { DiscountType, PromotionStatus, PromotionType } from "../../models/promotion.model.js";

// ─────────────────────────────────────────────
//  Règles des promotions : types, limites, état, calcul des prix.
//
//  Fonctions pures, partagées par le moteur de prix, le checkout et les
//  écritures. Le front en garde un portage (couche simulée) : mêmes règles,
//  mêmes messages.
// ─────────────────────────────────────────────

const T = PromotionType;
const S = PromotionStatus;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

export const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  [T.PRODUCT_DISCOUNT]: "Remise produit",
  [T.SHOP_DISCOUNT]: "Promotion boutique",
  [T.COUPON]: "Code promo",
  [T.FLASH_SALE]: "Vente flash",
  [T.QUANTITY_TIERS]: "Prix par quantité",
  [T.FREE_SHIPPING]: "Livraison offerte",
};

export const PROMOTION_STATUS_LABELS: Record<PromotionStatus, string> = {
  [S.DRAFT]: "Brouillon",
  [S.SCHEDULED]: "Programmée",
  [S.ACTIVE]: "En cours",
  [S.PAUSED]: "En pause",
  [S.ENDED]: "Terminée",
  [S.STOPPED]: "Arrêtée",
};

/** Types qu'une boutique lance. */
export const SHOP_PROMOTION_TYPES: readonly PromotionType[] = [
  T.PRODUCT_DISCOUNT,
  T.SHOP_DISCOUNT,
  T.COUPON,
  T.FLASH_SALE,
  T.QUANTITY_TIERS,
  T.FREE_SHIPPING,
];

/** Types qui fixent le prix unitaire d'une offre (le plus bas l'emporte, jamais la somme). */
export const PRICE_TYPES: readonly PromotionType[] = [T.PRODUCT_DISCOUNT, T.SHOP_DISCOUNT, T.FLASH_SALE];

export const PROMO_LIMITS = {
  minPercent: 5,
  maxPercent: 70,
  /** Au-delà, la boutique confirme : une erreur de saisie se rattrape avant le lancement. */
  confirmAbove: 50,
  /** Durée maximale, en jours ; le prix par quantité n'a pas de fin. */
  maxDays: {
    [T.PRODUCT_DISCOUNT]: 30,
    [T.SHOP_DISCOUNT]: 30,
    [T.COUPON]: 90,
    [T.FREE_SHIPPING]: 90,
  } as Partial<Record<PromotionType, number>>,
  flashHours: { min: 2, max: 72 },
  flashCooldownDays: 30,
  maxOffers: { [T.PRODUCT_DISCOUNT]: 50, [T.FLASH_SALE]: 10, [T.QUANTITY_TIERS]: 1 } as Partial<Record<PromotionType, number>>,
  maxTiers: 3,
  /** Plafonds par boutique. */
  maxRunning: 20,
  maxFlashPerMonth: 2,
  maxActiveCodes: 5,
  /** Ancienneté exigée pour une vente flash (et un boost). */
  seniorityDays: 30,
  seniorityDeliveredOrders: 5,
  /** Fenêtre du prix de référence. */
  referenceDays: 30,
} as const;

/** Une promotion sans fin (prix par quantité) court jusqu'à cette date. */
export const NO_END = new Date("9999-12-31T00:00:00.000Z");

/** Promotion lue par ces règles : un document ou son équivalent simulé. */
export interface RulePromotion {
  type: PromotionType;
  status?: PromotionStatus | undefined;
  actif?: boolean | undefined;
  boutiqueId?: unknown;
  startDate: Date;
  endDate: Date;
  usageLimit?: number | null | undefined;
  usedCount?: number | undefined;
  flashQuantity?: number | null | undefined;
  flashSold?: number | undefined;
}

const exhausted = (promo: RulePromotion): boolean =>
  (promo.usageLimit != null && (promo.usedCount ?? 0) >= promo.usageLimit) ||
  (promo.flashQuantity != null && (promo.flashSold ?? 0) >= promo.flashQuantity);

/**
 * État à cet instant. Brouillon, pause et arrêt sont des choix : ils
 * tiennent. Le reste suit les dates et les quantités : le planificateur
 * enregistre cet état, mais le prix ne l'attend pas.
 */
export const statusAt = (promo: RulePromotion, now: Date): PromotionStatus => {
  const stored = promo.status ?? S.ACTIVE;
  if (stored === S.DRAFT || stored === S.PAUSED || stored === S.STOPPED) return stored;
  if (promo.actif === false) return S.STOPPED;
  if (now < promo.startDate) return S.SCHEDULED;
  if (now > promo.endDate || exhausted(promo)) return S.ENDED;
  return S.ACTIVE;
};

/** La promotion agit-elle sur les prix en ce moment ? */
export const isLive = (promo: RulePromotion, now: Date): boolean => statusAt(promo, now) === S.ACTIVE;

/** Prix d'une unité sous une remise en pourcentage (ou montant fixe). */
export const discountedPrice = (base: number, discountType: DiscountType | undefined, value: number): number => {
  const price = discountType === DiscountType.FIXED ? base - value : base * (1 - value / 100);
  return Math.max(0, Math.round(price));
};

/** Remise affichée, en pourcentage entier, par rapport au prix de référence. */
export const percentOff = (reference: number, price: number): number =>
  reference > 0 && price < reference ? Math.floor(((reference - price) / reference) * 100) : 0;

/** Le prix barré ne s'affiche qu'à partir de 5 % sous le prix de référence. */
export const shownPercent = (reference: number, price: number): number => {
  const percent = percentOff(reference, price);
  return percent >= PROMO_LIMITS.minPercent ? percent : 0;
};

/** Offre telle que le moteur de prix l'a calculée (champs dénormalisés). */
export interface PricedOffer {
  price: number;
  discountPrice?: number | null | undefined;
  quantityTiers?: readonly { minQuantity: number; percent: number }[] | undefined;
}

/** Palier atteint par une quantité, s'il y en a un. */
export const tierFor = (offer: PricedOffer, quantity: number): { minQuantity: number; percent: number } | null =>
  [...(offer.quantityTiers ?? [])]
    .filter((tier) => quantity >= tier.minQuantity)
    .sort((a, b) => b.percent - a.percent)[0] ?? null;

/**
 * Prix unitaire payé pour une quantité : le plus bas du prix promotionnel
 * et du palier atteint, calculé sur le prix de base. Jamais leur cumul.
 */
export const unitPriceFor = (offer: PricedOffer, quantity: number): number => {
  const promo = offer.discountPrice != null && offer.discountPrice < offer.price ? offer.discountPrice : offer.price;
  const tier = tierFor(offer, quantity);
  return tier ? Math.min(promo, discountedPrice(offer.price, DiscountType.PERCENTAGE, tier.percent)) : promo;
};

// ── Saisie d'une promotion de boutique ──────

export interface ShopPromotionInput {
  type: PromotionType;
  nom: string;
  discountType?: DiscountType | undefined;
  discountValue?: number | undefined;
  startDate: Date;
  endDate?: Date | undefined;
  productBoutiqueIds?: readonly string[] | undefined;
  code?: string | undefined;
  minAmount?: number | undefined;
  maxDiscount?: number | undefined;
  usageLimit?: number | undefined;
  tiers?: readonly { minQuantity: number; discountValue: number }[] | undefined;
  flashQuantity?: number | undefined;
  confirmHighDiscount?: boolean | undefined;
}

/** Ce que la boutique a déjà en cours, pour les plafonds. */
export interface ShopPromotionContext {
  running: number;
  activeCodes: number;
  flashThisMonth: number;
  /** Ancienneté de la boutique et commandes livrées, pour la vente flash. */
  shopAgeDays: number;
  deliveredOrders: number;
}

const percentage = (input: ShopPromotionInput) => (input.discountType ?? DiscountType.PERCENTAGE) === DiscountType.PERCENTAGE;

/** Contrôle d'une promotion avant son lancement. Renvoie le motif du refus, ou null. */
export const checkShopPromotionInput = (input: ShopPromotionInput, context: ShopPromotionContext, now: Date): string | null => {
  if (!SHOP_PROMOTION_TYPES.includes(input.type)) return "Type de promotion inconnu.";
  if (!input.nom?.trim()) return "Donnez un nom à la promotion.";

  const offers = input.productBoutiqueIds ?? [];
  const maxOffers = PROMO_LIMITS.maxOffers[input.type];
  if ([T.PRODUCT_DISCOUNT, T.FLASH_SALE, T.QUANTITY_TIERS].includes(input.type)) {
    if (offers.length === 0) return "Choisissez au moins une offre.";
    if (maxOffers && offers.length > maxOffers) {
      return maxOffers === 1 ? "Un prix par quantité porte sur une seule offre." : `${maxOffers} offres au plus pour ce type de promotion.`;
    }
  }

  // Remise : 5 à 70 % ; au-delà de 50 %, la boutique confirme.
  if (input.type === T.QUANTITY_TIERS) {
    const tiers = input.tiers ?? [];
    if (tiers.length === 0 || tiers.length > PROMO_LIMITS.maxTiers) return "De 1 à 3 paliers.";
    const sorted = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
    for (const [index, tier] of sorted.entries()) {
      if (!Number.isInteger(tier.minQuantity) || tier.minQuantity < 2) return "Un palier commence à 2 unités au moins.";
      if (tier.discountValue < PROMO_LIMITS.minPercent || tier.discountValue > PROMO_LIMITS.maxPercent) {
        return `La remise d'un palier va de ${PROMO_LIMITS.minPercent} à ${PROMO_LIMITS.maxPercent} %.`;
      }
      const previous = sorted[index - 1];
      if (previous && (tier.minQuantity === previous.minQuantity || tier.discountValue <= previous.discountValue)) {
        return "Chaque palier demande plus d'unités et donne plus de remise que le précédent.";
      }
    }
  } else if (input.type !== T.FREE_SHIPPING) {
    const value = input.discountValue ?? 0;
    if (percentage(input)) {
      if (value < PROMO_LIMITS.minPercent || value > PROMO_LIMITS.maxPercent) {
        return `La remise va de ${PROMO_LIMITS.minPercent} à ${PROMO_LIMITS.maxPercent} %.`;
      }
      if (value > PROMO_LIMITS.confirmAbove && !input.confirmHighDiscount) {
        return `Une remise de plus de ${PROMO_LIMITS.confirmAbove} % se confirme : vérifiez-la, puis confirmez.`;
      }
    } else {
      if (input.type !== T.COUPON) return "Une remise d'offre se donne en pourcentage.";
      if (!(value > 0)) return "Indiquez le montant de la remise.";
    }
  }

  // Dates.
  const start = input.startDate;
  if (Number.isNaN(start.getTime())) return "Date de début invalide.";
  if (start.getTime() < now.getTime() - 5 * 60 * 1000) return "La date de début est passée.";
  if (input.type !== T.QUANTITY_TIERS) {
    const end = input.endDate;
    if (!end || Number.isNaN(end.getTime())) return "Indiquez la date de fin.";
    if (end <= start) return "La fin vient après le début.";
    const length = end.getTime() - start.getTime();
    if (input.type === T.FLASH_SALE) {
      if (length < PROMO_LIMITS.flashHours.min * HOUR || length > PROMO_LIMITS.flashHours.max * HOUR) {
        return `Une vente flash dure de ${PROMO_LIMITS.flashHours.min} à ${PROMO_LIMITS.flashHours.max} heures.`;
      }
    } else {
      const maxDays = PROMO_LIMITS.maxDays[input.type] ?? 30;
      if (length > maxDays * DAY) return `Cette promotion dure ${maxDays} jours au plus.`;
    }
  }

  // Spécificités.
  if (input.type === T.COUPON) {
    if (!input.code || !/^[A-Z0-9]{4,20}$/.test(input.code)) return "Le code fait de 4 à 20 lettres ou chiffres.";
    if (context.activeCodes >= PROMO_LIMITS.maxActiveCodes) return `${PROMO_LIMITS.maxActiveCodes} codes actifs au plus par boutique.`;
  }
  if (input.type === T.FREE_SHIPPING && !(input.minAmount && input.minAmount > 0)) {
    return "Indiquez le montant à partir duquel la livraison est offerte.";
  }
  if (input.type === T.FLASH_SALE) {
    if (!input.flashQuantity || !Number.isInteger(input.flashQuantity) || input.flashQuantity < 1) {
      return "Indiquez la quantité vendue au prix flash.";
    }
    if (context.shopAgeDays < PROMO_LIMITS.seniorityDays || context.deliveredOrders < PROMO_LIMITS.seniorityDeliveredOrders) {
      return `La vente flash s'ouvre après ${PROMO_LIMITS.seniorityDays} jours et ${PROMO_LIMITS.seniorityDeliveredOrders} commandes livrées.`;
    }
    if (context.flashThisMonth >= PROMO_LIMITS.maxFlashPerMonth) return `${PROMO_LIMITS.maxFlashPerMonth} ventes flash par mois au plus.`;
  }
  if (input.type !== T.QUANTITY_TIERS && context.running >= PROMO_LIMITS.maxRunning) {
    return `${PROMO_LIMITS.maxRunning} promotions en cours ou programmées au plus.`;
  }
  return null;
};

// ── Actions ─────────────────────────────────

export const PromotionAction = {
  LAUNCH: "launch",
  PAUSE: "pause",
  RESUME: "resume",
  EXTEND: "extend",
  STOP: "stop",
} as const;
export type PromotionAction = (typeof PromotionAction)[keyof typeof PromotionAction];

export const PROMOTION_ACTIONS: readonly PromotionAction[] = Object.values(PromotionAction);

export const isPromotionAction = (value: unknown): value is PromotionAction =>
  typeof value === "string" && (PROMOTION_ACTIONS as readonly string[]).includes(value);

/** Une action est-elle permise sur cette promotion ? Renvoie le motif du refus, ou null. */
export const checkPromotionAction = (
  action: PromotionAction,
  promo: RulePromotion,
  input: { endDate?: Date | undefined },
  now: Date
): string | null => {
  const status = statusAt(promo, now);
  switch (action) {
    case PromotionAction.LAUNCH:
      return status === S.DRAFT ? null : "Seul un brouillon se lance.";
    case PromotionAction.PAUSE:
      return status === S.ACTIVE ? null : "Seule une promotion en cours se met en pause.";
    case PromotionAction.RESUME:
      if (status !== S.PAUSED) return "Seule une promotion en pause reprend.";
      return now > promo.endDate ? "Sa date de fin est passée : dupliquez-la plutôt." : null;
    case PromotionAction.EXTEND: {
      if (status !== S.ACTIVE && status !== S.SCHEDULED && status !== S.PAUSED) return "Cette promotion est terminée.";
      if (promo.type === T.QUANTITY_TIERS) return "Un prix par quantité n'a pas de fin.";
      const end = input.endDate;
      if (!end || Number.isNaN(end.getTime())) return "Indiquez la nouvelle date de fin.";
      if (end <= promo.endDate) return "La nouvelle fin vient après l'actuelle.";
      const length = end.getTime() - promo.startDate.getTime();
      if (promo.type === T.FLASH_SALE) {
        return length > PROMO_LIMITS.flashHours.max * HOUR ? `Une vente flash dure ${PROMO_LIMITS.flashHours.max} heures au plus.` : null;
      }
      const maxDays = PROMO_LIMITS.maxDays[promo.type] ?? 30;
      return length > maxDays * DAY ? `Cette promotion dure ${maxDays} jours au plus.` : null;
    }
    case PromotionAction.STOP:
      return status === S.ENDED || status === S.STOPPED ? "Cette promotion est déjà terminée." : null;
    default:
      return "Action inconnue.";
  }
};

/** Boutons à montrer, selon l'état. */
export const availablePromotionActions = (promo: RulePromotion, now: Date): PromotionAction[] =>
  PROMOTION_ACTIONS.filter((action) => {
    if (action === PromotionAction.EXTEND) {
      const status = statusAt(promo, now);
      return promo.type !== T.QUANTITY_TIERS && (status === S.ACTIVE || status === S.SCHEDULED || status === S.PAUSED);
    }
    return checkPromotionAction(action, promo, {}, now) === null;
  });

/** Onglets de la rubrique Promotions de l'espace boutique. */
export const PROMOTION_TABS = {
  active: [S.ACTIVE, S.PAUSED],
  scheduled: [S.SCHEDULED, S.DRAFT],
  ended: [S.ENDED, S.STOPPED],
} as const satisfies Record<string, readonly PromotionStatus[]>;
export type PromotionTab = keyof typeof PROMOTION_TABS;
