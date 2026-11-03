import type { OfferPricing, ProductBoutique } from "../../../entities/product";
import { categorieOf, familleOf } from "../../../entities/product";
import { discountedPrice, isLive, PRICE_TYPES, PROMO_LIMITS, shownPercent, tierFor, unitPriceFor } from "./marketingRules";
import { NO_END, type MockMarketing, type MockPromotion } from "./marketingSeed";
import type { MockDb } from "./mockDb";

// ─────────────────────────────────────────────
//  Moteur de prix simulé — portage de Back/src/shared/services/pricing.service.ts.
//  Ici, le prix est calculé à chaque lecture (le back le recopie sur l'offre
//  à chaque changement) : le résultat est le même, le DTO aussi.
// ─────────────────────────────────────────────

const DAY = 24 * 3600 * 1000;

/** Une promotion simulée telle que les règles la lisent (dates en Date). */
export const ruleOf = (promo: MockPromotion) => ({
  ...promo,
  startDate: new Date(promo.startDate),
  endDate: new Date(promo.endDate),
});

export const livePromo = (promo: MockPromotion, now: Date): boolean => isLive(ruleOf(promo), now);

/** Prix de référence : le plus bas prix pratiqué sur les 30 derniers jours, prix courant compris. */
export const referencePriceOf = (marketing: MockMarketing, offerId: string, price: number, now: Date): number => {
  const since = now.getTime() - PROMO_LIMITS.referenceDays * DAY;
  return (marketing.priceHistory[offerId] ?? [])
    .filter((row) => row.to === null || new Date(row.to).getTime() >= since)
    .reduce((lowest, row) => Math.min(lowest, row.price), price);
};

/** Enregistre un prix pratiqué à partir de maintenant (le seller.ts l'appelle à chaque changement). */
export const recordPrice = (marketing: MockMarketing, offerId: string, previous: number | null, price: number, now: Date): void => {
  const rows = marketing.priceHistory[offerId] ?? [];
  if (rows.length === 0 && previous !== null) rows.push({ price: previous, from: new Date(0).toISOString(), to: null });
  for (const row of rows) if (row.to === null) row.to = now.toISOString();
  rows.push({ price, from: now.toISOString(), to: null });
  marketing.priceHistory[offerId] = rows;
};

/** Une promotion vise-t-elle cette offre ? Jamais l'offre d'une autre boutique. */
export const targetsOffer = (promo: MockPromotion, offer: ProductBoutique): boolean => {
  if (promo.boutiqueId && promo.boutiqueId !== offer.boutique?.id) return false;
  if (promo.type === "shop_discount") {
    if (promo.target?.excludedOfferIds.includes(offer.id)) return false;
    const families = promo.target?.familleIds ?? [];
    const categories = promo.target?.categoryIds ?? [];
    if (families.length === 0 && categories.length === 0) return true;
    return families.includes(familleOf(offer)?.id ?? "") || categories.includes(categorieOf(offer)?.id ?? "");
  }
  return promo.productBoutiqueIds.includes(offer.id);
};

export interface MockOfferPricing {
  discountPrice: number | null;
  pricing: OfferPricing;
  promotion: MockPromotion | null;
  tiersPromotion: MockPromotion | null;
}

/** Le plus bas des remises en cours (jamais leur somme) ; prix barré = prix de référence. */
export const computePricing = (
  offer: ProductBoutique,
  promotions: readonly MockPromotion[],
  reference: number,
  now: Date,
  excluded?: ReadonlySet<string>
): MockOfferPricing => {
  const applicable = promotions.filter((promo) => livePromo(promo, now) && !excluded?.has(promo.id) && targetsOffer(promo, offer));
  let best: { promo: MockPromotion; price: number } | null = null;
  for (const promo of applicable.filter((candidate) => PRICE_TYPES.includes(candidate.type))) {
    const price = discountedPrice(offer.price, promo.discountType, promo.discountValue);
    if (price >= offer.price) continue;
    if (!best || price < best.price || (price === best.price && promo.endDate < best.promo.endDate)) best = { promo, price };
  }
  const tiersPromotion =
    applicable
      .filter((candidate) => candidate.type === "quantity_tiers" && candidate.tiers.length > 0)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
  const quantityTiers = (tiersPromotion?.tiers ?? [])
    .map((tier) => ({ minQuantity: tier.minQuantity, percent: tier.discountValue }))
    .sort((a, b) => a.minQuantity - b.minQuantity);

  const discountPrice = best?.price ?? null;
  const priced = { price: offer.price, discountPrice, quantityTiers };
  const unit = unitPriceFor(priced, 1);
  const percent = best ? shownPercent(reference, best.price) : 0;
  // Comme toOfferPricingDto : une offre en rupture ne s'affiche plus « en promotion ».
  const shown = percent > 0 && offer.stock > 0;
  const pricing: OfferPricing = {
    basePrice: offer.price,
    price: unit,
    ...(shown ? { referencePrice: reference, percent } : {}),
    ...(best
      ? {
          endsAt: best.promo.endDate,
          promotion: {
            id: best.promo.id,
            type: best.promo.type,
            label: best.promo.nom,
            flash: best.promo.type === "flash_sale",
            ...(best.promo.campaignId ? { campaignId: best.promo.campaignId } : {}),
          },
        }
      : {}),
    tiers: quantityTiers.map((tier) => ({ ...tier, unitPrice: Math.min(unit, discountedPrice(offer.price, "percentage", tier.percent)) })),
  };
  return { discountPrice, pricing, promotion: best?.promo ?? null, tiersPromotion };
};

/** Le catalogue, prix des promotions appliqués (et produits phares de chaque vitrine). */
export const withPricing = (db: MockDb, offers: ProductBoutique[], now = new Date()): ProductBoutique[] => {
  const promotions = db.marketing.promotions.filter((promo) => livePromo(promo, now));
  return offers.map((offer) => {
    const { discountPrice: _manual, ...rest } = offer;
    const { discountPrice, pricing } = computePricing(offer, promotions, referencePriceOf(db.marketing, offer.id, offer.price, now), now);
    const rank = offer.boutique ? (db.marketing.featured[offer.boutique.id] ?? []).indexOf(offer.id) : -1;
    return {
      ...rest,
      ...(discountPrice != null && discountPrice < offer.price ? { discountPrice } : {}),
      pricing,
      ...(rank >= 0 ? { featuredRank: rank + 1 } : {}),
    };
  });
};

// ── Meilleures ventes ───────────────────────

/** Unités vendues et livrées sur 30 jours, par offre (historique de démonstration compris). */
export const salesCounts = (db: MockDb, now = new Date()): Map<string, number> => {
  const since = now.getTime() - 30 * DAY;
  const counts = new Map(Object.entries(db.marketing.salesSeed));
  for (const part of db.shopOrders) {
    if (part.status !== "delivered" && part.status !== "completed") continue;
    const delivered = part.statusHistory.find((step) => step.status === "delivered")?.changedAt;
    if (!delivered || new Date(delivered).getTime() < since) continue;
    for (const item of part.items) counts.set(item.productBoutiqueId, (counts.get(item.productBoutiqueId) ?? 0) + item.quantity);
  }
  return counts;
};

// ── Checkout ────────────────────────────────

export interface PricedLine {
  unitPrice: number;
  basePrice: number;
  promotionId: string | null;
  promotionLabel?: string | undefined;
  flashPromotionId?: string | undefined;
  promoted: boolean;
}

/** Prix frais de chaque ligne ; une vente flash ne sert que tant que sa quantité suffit. */
export const priceLines = (db: MockDb, lines: readonly { offer: ProductBoutique; quantity: number }[], now = new Date()): PricedLine[] => {
  const promotions = db.marketing.promotions.filter((promo) => livePromo(promo, now));
  const flashUsed = new Map<string, number>();
  return lines.map(({ offer, quantity }) => {
    const reference = referencePriceOf(db.marketing, offer.id, offer.price, now);
    const excluded = new Set<string>();
    let result = computePricing(offer, promotions, reference, now);
    while (result.promotion?.type === "flash_sale" && result.promotion.flashQuantity != null) {
      const id = result.promotion.id;
      const left = result.promotion.flashQuantity - result.promotion.flashSold - (flashUsed.get(id) ?? 0);
      if (left >= quantity) {
        flashUsed.set(id, (flashUsed.get(id) ?? 0) + quantity);
        break;
      }
      excluded.add(id);
      result = computePricing(offer, promotions, reference, now, excluded);
    }
    const priced = { price: offer.price, discountPrice: result.discountPrice, quantityTiers: result.pricing.tiers };
    const unitPrice = unitPriceFor(priced, quantity);
    const tier = tierFor(priced, quantity);
    const byTier = !!tier && !!result.tiersPromotion && discountedPrice(offer.price, "percentage", tier.percent) <= (result.discountPrice ?? offer.price);
    const source = byTier ? result.tiersPromotion : result.promotion;
    return {
      unitPrice,
      basePrice: offer.price,
      promotionId: source?.id ?? null,
      promotionLabel: source?.nom,
      flashPromotionId: !byTier && result.promotion?.type === "flash_sale" ? result.promotion.id : undefined,
      promoted: unitPrice < offer.price,
    };
  });
};

/** Livraison offerte en cours, par boutique : le seuil le plus bas. */
export const freeShippingRules = (db: MockDb, shopIds: readonly string[], now = new Date()) => {
  const rules = new Map<string, { minAmount: number; label: string }>();
  for (const promo of db.marketing.promotions) {
    if (promo.type !== "free_shipping" || !promo.boutiqueId || !shopIds.includes(promo.boutiqueId) || !livePromo(promo, now)) continue;
    const current = rules.get(promo.boutiqueId);
    if (!current || promo.minAmount < current.minAmount) rules.set(promo.boutiqueId, { minAmount: promo.minAmount, label: promo.nom });
  }
  return rules;
};

export interface CouponLine {
  offerId: string;
  boutiqueId: string;
  price: number;
  quantity: number;
  promoted: boolean;
}

/** Même calcul que evaluateCoupon du back, messages compris. */
export const evaluateCoupon = (promo: MockPromotion, lines: readonly CouponLine[], now = new Date()): { discount: number; boutiqueId: string | null; error?: string } => {
  const boutiqueId = promo.boutiqueId;
  if (promo.type !== "coupon" || !livePromo(promo, now)) return { discount: 0, boutiqueId, error: "Ce coupon n'est pas valide (inactif, expiré ou épuisé)." };
  let eligible = lines;
  if (boutiqueId) {
    eligible = lines.filter((line) => line.boutiqueId === boutiqueId);
    if (eligible.length === 0) return { discount: 0, boutiqueId, error: "Ce code ne vaut que chez la boutique qui l'a créé : ajoutez un de ses articles." };
    if (!promo.stackable) eligible = eligible.filter((line) => !line.promoted);
  } else if (promo.scope === "product_boutique") {
    eligible = lines.filter((line) => promo.productBoutiqueIds.includes(line.offerId));
  }
  const base = eligible.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const threshold = boutiqueId ? base : lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  if (promo.minAmount && threshold < promo.minAmount) {
    return { discount: 0, boutiqueId, error: `Montant minimum non atteint pour ce coupon (requis : ${promo.minAmount}).` };
  }
  let discount = promo.discountType === "fixed" ? promo.discountValue : (base * promo.discountValue) / 100;
  if (promo.maxDiscount != null) discount = Math.min(discount, promo.maxDiscount);
  discount = Math.max(0, Math.round(Math.min(discount, base)));
  if (discount <= 0) return { discount: 0, boutiqueId, error: "Aucun article de la commande n'est éligible à ce coupon." };
  return { discount, boutiqueId };
};

export const isEndless = (promo: Pick<MockPromotion, "endDate">): boolean => promo.endDate >= NO_END;
