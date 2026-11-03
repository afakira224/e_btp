import mongoose, { type ClientSession, Types } from "mongoose";
import { Order, OrderStatus } from "../../models/order.model.js";
import { PriceHistory } from "../../models/priceHistory.model.js";
import {
  Product,
  productBoutique,
  type IOfferPromo,
  type IProduct,
  type IProductBoutique,
  type IQuantityTier,
} from "../../models/product.model.js";
import { Promotion, PromotionStatus, PromotionType, type IPromotion } from "../../models/promotion.model.js";
import { ShopOrder, ShopOrderStatus } from "../../models/shopOrder.model.js";
import logger from "../logger/logger.js";
import {
  discountedPrice,
  isLive,
  PRICE_TYPES,
  PROMO_LIMITS,
  shownPercent,
  tierFor,
  unitPriceFor,
} from "../helpers/promotion.rules.js";

// ─────────────────────────────────────────────
//  Moteur de prix.
//
//  Le prix promotionnel d'une offre est calculé ici, et seulement ici :
//  au checkout, frais, depuis les promotions en vigueur ; ailleurs, lu sur
//  l'offre, où il est recopié (discountPrice, promo, quantityTiers) à chaque
//  changement d'une promotion ou du prix, et à chaque passage de date
//  (planificateur). La boutique ne l'écrit jamais elle-même.
// ─────────────────────────────────────────────

const DAY = 24 * 3600 * 1000;
const T = PromotionType;
const S = PromotionStatus;

const opts = (session?: ClientSession | null) => (session ? { session } : {});

// ── Historique et prix de référence ─────────

/** Enregistre le prix pratiqué à partir de maintenant (création de l'offre, changement de prix). */
export const recordPrice = async (offerId: Types.ObjectId | string, price: number, now: Date, session?: ClientSession | null): Promise<void> => {
  const id = new Types.ObjectId(String(offerId));
  await PriceHistory.updateMany({ productBoutiqueId: id, to: null }, { $set: { to: now } }, opts(session));
  await PriceHistory.create([{ productBoutiqueId: id, price, from: now, to: null }], opts(session));
};

/**
 * Prix de référence de chaque offre : le plus bas prix pratiqué, hors
 * promotion, sur les 30 derniers jours, prix courant compris. Une offre sans
 * historique (antérieure à celui-ci) prend son prix courant.
 */
export const referencePrices = async (
  offers: readonly Pick<IProductBoutique, "_id" | "price">[],
  now: Date,
  session?: ClientSession | null
): Promise<Map<string, number>> => {
  const references = new Map(offers.map((offer) => [String(offer._id), offer.price]));
  if (offers.length === 0) return references;
  const since = new Date(now.getTime() - PROMO_LIMITS.referenceDays * DAY);
  const rows = await PriceHistory.find({
    productBoutiqueId: { $in: offers.map((offer) => offer._id) },
    $or: [{ to: null }, { to: { $gte: since } }],
  }).session(session ?? null);
  for (const row of rows) {
    const key = String(row.productBoutiqueId);
    const current = references.get(key);
    if (current !== undefined && row.price < current) references.set(key, row.price);
  }
  return references;
};

// ── Promotions en vigueur ───────────────────

/** Promotions qui peuvent fixer le prix de ces offres (prix et paliers), en vigueur à `now`. */
export const promotionsFor = async (
  offers: readonly Pick<IProductBoutique, "_id" | "boutiqueId">[],
  now: Date,
  session?: ClientSession | null
): Promise<IPromotion[]> => {
  if (offers.length === 0) return [];
  const shopIds = [...new Set(offers.map((offer) => String(offer.boutiqueId)))].map((id) => new Types.ObjectId(id));
  const candidates = await Promotion.find({
    type: { $in: [...PRICE_TYPES, T.QUANTITY_TIERS] },
    actif: true,
    status: { $nin: [S.DRAFT, S.PAUSED, S.STOPPED] },
    startDate: { $lte: now },
    endDate: { $gte: now },
    $or: [{ productBoutiqueIds: { $in: offers.map((offer) => offer._id) } }, { type: T.SHOP_DISCOUNT, boutiqueId: { $in: shopIds } }],
  }).session(session ?? null);
  return candidates.filter((promo) => isLive(promo, now));
};

/** Une promotion vise-t-elle cette offre ? Une promotion de boutique ne vise jamais l'offre d'une autre. */
export const targetsOffer = (
  promo: Pick<IPromotion, "type" | "boutiqueId" | "productBoutiqueIds" | "target">,
  offer: Pick<IProductBoutique, "_id" | "boutiqueId">,
  product?: Pick<IProduct, "familleId" | "categoryId"> | null
): boolean => {
  if (promo.boutiqueId && String(promo.boutiqueId) !== String(offer.boutiqueId)) return false;
  if (promo.type === T.SHOP_DISCOUNT) {
    const target = promo.target;
    if (target?.excludedOfferIds?.some((id) => String(id) === String(offer._id))) return false;
    const families = target?.familleIds ?? [];
    const categories = target?.categoryIds ?? [];
    if (families.length === 0 && categories.length === 0) return true;
    if (!product) return false;
    return (
      families.some((id) => String(id) === String(product.familleId)) || categories.some((id) => String(id) === String(product.categoryId))
    );
  }
  return promo.productBoutiqueIds.some((id) => String(id) === String(offer._id));
};

export interface OfferPricing {
  discountPrice: number | null;
  promo: IOfferPromo | null;
  quantityTiers: IQuantityTier[];
  /** Promotion qui donne le prix promotionnel (pour une vente flash : sa quantité). */
  promotion: IPromotion | null;
  /** Promotion des paliers, s'il y en a. */
  tiersPromotion: IPromotion | null;
}

/**
 * Prix d'une offre sous les promotions données : le plus bas des remises en
 * cours (jamais leur somme), le prix barré venant du prix de référence.
 */
export const computePricing = (input: {
  offer: Pick<IProductBoutique, "_id" | "price" | "boutiqueId">;
  product?: Pick<IProduct, "familleId" | "categoryId"> | null | undefined;
  promotions: readonly IPromotion[];
  reference: number;
  now: Date;
  /** Promotions écartées (vente flash épuisée pour cette ligne). */
  excluded?: ReadonlySet<string> | undefined;
}): OfferPricing => {
  const { offer, product, promotions, reference, now, excluded } = input;
  const applicable = promotions.filter(
    (promo) => isLive(promo, now) && !excluded?.has(String(promo._id)) && targetsOffer(promo, offer, product)
  );

  let best: { promo: IPromotion; price: number } | null = null;
  for (const promo of applicable.filter((candidate) => PRICE_TYPES.includes(candidate.type))) {
    const price = discountedPrice(offer.price, promo.discountType, promo.discountValue);
    if (price >= offer.price) continue;
    if (!best || price < best.price || (price === best.price && promo.endDate < best.promo.endDate)) best = { promo, price };
  }

  // Le dernier prix par quantité lancé fait foi.
  const tiersPromotion =
    applicable
      .filter((candidate) => candidate.type === T.QUANTITY_TIERS && candidate.tiers.length > 0)
      .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0] ?? null;
  const quantityTiers = (tiersPromotion?.tiers ?? [])
    .map((tier) => ({ minQuantity: tier.minQuantity, percent: tier.discountValue }))
    .sort((a, b) => a.minQuantity - b.minQuantity);

  if (!best) return { discountPrice: null, promo: null, quantityTiers, promotion: null, tiersPromotion };
  return {
    discountPrice: best.price,
    promo: {
      promotionId: best.promo._id as Types.ObjectId,
      type: best.promo.type,
      label: best.promo.nom,
      endsAt: best.promo.endDate,
      referencePrice: reference,
      percent: shownPercent(reference, best.price),
      flash: best.promo.type === T.FLASH_SALE,
      campaignId: best.promo.campaignId ?? null,
    },
    quantityTiers,
    promotion: best.promo,
    tiersPromotion,
  };
};

// ── Recalcul des offres ─────────────────────

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const promoSnapshot = (promo: IOfferPromo | null | undefined) =>
  promo
    ? {
        promotionId: String(promo.promotionId),
        type: promo.type,
        label: promo.label,
        endsAt: new Date(promo.endsAt).toISOString(),
        referencePrice: promo.referencePrice,
        percent: promo.percent,
        flash: promo.flash,
        campaignId: promo.campaignId ? String(promo.campaignId) : null,
      }
    : null;

const tiersSnapshot = (tiers: readonly IQuantityTier[] | undefined) =>
  (tiers ?? []).map((tier) => ({ minQuantity: tier.minQuantity, percent: tier.percent }));

/**
 * Recopie sur les offres le prix que leurs promotions leur donnent à `now`.
 * N'écrit que ce qui change. Renvoie le nombre d'offres modifiées.
 */
export const recomputeOfferPricing = async (filter: { offerIds?: readonly unknown[]; boutiqueId?: unknown }, now = new Date()): Promise<number> => {
  const query: Record<string, unknown> = {};
  if (filter.offerIds) query._id = { $in: filter.offerIds.map((id) => new Types.ObjectId(String(id))) };
  if (filter.boutiqueId) query.boutiqueId = new Types.ObjectId(String(filter.boutiqueId));
  if (!filter.offerIds && !filter.boutiqueId) return 0;

  const offers = await productBoutique.find(query);
  if (offers.length === 0) return 0;
  const [products, promotions, references] = await Promise.all([
    Product.find({ _id: { $in: offers.map((offer) => offer.productId) } }),
    promotionsFor(offers, now),
    referencePrices(offers, now),
  ]);

  const writes = [];
  for (const offer of offers) {
    const product = products.find((candidate) => String(candidate._id) === String(offer.productId));
    const pricing = computePricing({ offer, product, promotions, reference: references.get(String(offer._id)) ?? offer.price, now });
    const unchanged =
      (offer.discountPrice ?? null) === pricing.discountPrice &&
      sameJson(promoSnapshot(offer.promo), promoSnapshot(pricing.promo)) &&
      sameJson(tiersSnapshot(offer.quantityTiers), tiersSnapshot(pricing.quantityTiers));
    if (unchanged) continue;
    writes.push({
      updateOne: {
        filter: { _id: offer._id },
        update: { $set: { discountPrice: pricing.discountPrice, promo: pricing.promo, quantityTiers: pricing.quantityTiers } },
      },
    });
  }
  if (writes.length > 0) await productBoutique.bulkWrite(writes);
  return writes.length;
};

/** Offres que touche une promotion : celles qu'elle nomme, ou toute la boutique pour une promotion boutique. */
export const recomputeForPromotion = async (
  promo: Pick<IPromotion, "type" | "boutiqueId" | "productBoutiqueIds">,
  now = new Date()
): Promise<number> =>
  promo.type === T.SHOP_DISCOUNT && promo.boutiqueId
    ? recomputeOfferPricing({ boutiqueId: promo.boutiqueId }, now)
    : recomputeOfferPricing({ offerIds: promo.productBoutiqueIds }, now);

// ── Checkout : prix frais de chaque ligne ───

export interface PricedLine {
  unitPrice: number;
  basePrice: number;
  promotionId: Types.ObjectId | null;
  promotionLabel?: string | undefined;
  /** La ligne utilise la quantité d'une vente flash. */
  flashPromotionId?: string | undefined;
  /** Promotion de prix appliquée, pour savoir si un code « non cumulable » la touche. */
  promoted: boolean;
}

/**
 * Prix de chaque ligne au checkout, calculé des promotions en vigueur dans
 * la transaction. Une vente flash ne sert que tant que sa quantité suffit :
 * au-delà, la ligne retombe sur la meilleure autre remise.
 */
export const priceLines = async (
  lines: readonly { offer: IProductBoutique; product?: IProduct | undefined; quantity: number }[],
  now: Date,
  session?: ClientSession | null
): Promise<PricedLine[]> => {
  const offers = lines.map((line) => line.offer);
  const [promotions, references] = await Promise.all([promotionsFor(offers, now, session), referencePrices(offers, now, session)]);
  const flashUsed = new Map<string, number>();

  return lines.map(({ offer, product, quantity }) => {
    const reference = references.get(String(offer._id)) ?? offer.price;
    const excluded = new Set<string>();
    let pricing = computePricing({ offer, product, promotions, reference, now });
    // Quantité flash insuffisante : la remise suivante, s'il y en a une.
    while (pricing.promotion?.type === T.FLASH_SALE && pricing.promotion.flashQuantity != null) {
      const id = String(pricing.promotion._id);
      const left = pricing.promotion.flashQuantity - pricing.promotion.flashSold - (flashUsed.get(id) ?? 0);
      if (left >= quantity) {
        flashUsed.set(id, (flashUsed.get(id) ?? 0) + quantity);
        break;
      }
      excluded.add(id);
      pricing = computePricing({ offer, product, promotions, reference, now, excluded });
    }

    const priced = { price: offer.price, discountPrice: pricing.discountPrice, quantityTiers: pricing.quantityTiers };
    const unitPrice = unitPriceFor(priced, quantity);
    const tier = tierFor(priced, quantity);
    const tierPrice = tier ? discountedPrice(offer.price, undefined, tier.percent) : Infinity;
    const byTier = Boolean(tier && pricing.tiersPromotion && tierPrice <= (pricing.discountPrice ?? offer.price));
    const source = byTier ? pricing.tiersPromotion : pricing.promotion;
    return {
      unitPrice,
      basePrice: offer.price,
      promotionId: (source?._id as Types.ObjectId | undefined) ?? null,
      promotionLabel: source?.nom,
      flashPromotionId: !byTier && pricing.promotion?.type === T.FLASH_SALE ? String(pricing.promotion._id) : undefined,
      promoted: unitPrice < offer.price,
    };
  });
};

// ── Meilleures ventes ───────────────────────

/**
 * Unités vendues et livrées sur 30 jours, par offre : le classement des
 * meilleures ventes, que la boutique ne peut plus déclarer elle-même.
 */
export const recomputeSalesCounts = async (now = new Date()): Promise<number> => {
  const since = new Date(now.getTime() - 30 * DAY);
  const rows: { _id: Types.ObjectId; units: number }[] = await ShopOrder.aggregate([
    {
      $match: {
        status: { $in: [ShopOrderStatus.DELIVERED, ShopOrderStatus.COMPLETED] },
        statusHistory: { $elemMatch: { status: ShopOrderStatus.DELIVERED, changedAt: { $gte: since } } },
      },
    },
    { $unwind: "$items" },
    { $group: { _id: "$items.productBoutiqueId", units: { $sum: "$items.quantity" } } },
  ]);
  const writes: mongoose.AnyBulkWriteOperation[] = rows.map((row) => ({
    updateOne: { filter: { _id: row._id }, update: { $set: { salesCount30d: row.units } } },
  }));
  writes.push({
    updateMany: { filter: { salesCount30d: { $gt: 0 }, _id: { $nin: rows.map((row) => row._id) } }, update: { $set: { salesCount30d: 0 } } },
  });
  await productBoutique.bulkWrite(writes as never);
  return rows.length;
};

// ── Planificateur ───────────────────────────

export interface PromotionTickSummary {
  started: number;
  ended: number;
  offers: number;
}

/**
 * Passages de dates depuis le dernier tour : une promotion programmée
 * démarre, une promotion échue (ou dont la quantité flash est vendue) se
 * termine, et les offres concernées sont recalculées. Les promotions de la
 * plateforme n'ont pas d'état propre : leurs dates suffisent.
 */
export const runPromotionTick = async (since: Date, now = new Date()): Promise<PromotionTickSummary> => {
  const started = await Promotion.find({ status: S.SCHEDULED, startDate: { $lte: now } });
  for (const promo of started) {
    promo.status = now > promo.endDate ? S.ENDED : S.ACTIVE;
    await promo.save();
  }
  // Une promotion en pause dont la fin est passée se termine aussi : sinon elle
  // resterait « en cours » et compterait dans le plafond de la boutique.
  const ended = await Promotion.find({
    status: { $in: [S.ACTIVE, S.PAUSED] },
    $or: [{ endDate: { $lt: now } }, { $expr: { $and: [{ $ne: ["$flashQuantity", null] }, { $gte: ["$flashSold", "$flashQuantity"] }] } }],
  });
  for (const promo of ended) {
    promo.status = S.ENDED;
    await promo.save();
  }
  // Dates franchies depuis le dernier tour, toutes promotions confondues.
  // Une vente flash modifiée depuis (unités rendues, reprise) est recalculée aussi.
  const crossed = await Promotion.find({
    type: { $in: [...PRICE_TYPES, T.QUANTITY_TIERS] },
    $or: [
      { startDate: { $gt: since, $lte: now } },
      { endDate: { $gte: since, $lt: now } },
      { type: T.FLASH_SALE, updatedAt: { $gt: since, $lte: now } },
    ],
  });

  const touched = new Map<string, IPromotion>();
  for (const promo of [...started, ...ended, ...crossed]) touched.set(String(promo._id), promo);
  let offers = 0;
  for (const promo of touched.values()) {
    if (PRICE_TYPES.includes(promo.type) || promo.type === T.QUANTITY_TIERS) offers += await recomputeForPromotion(promo, now);
  }
  return { started: started.length, ended: ended.length, offers };
};

/** Au démarrage : toute offre qui porte une promotion, ou que vise une promotion en cours, est recalculée. */
export const recomputeAllPromotedOffers = async (now = new Date()): Promise<number> => {
  const [promoted, live] = await Promise.all([
    productBoutique.find({ $or: [{ promo: { $ne: null } }, { "quantityTiers.0": { $exists: true } }] }).select("_id"),
    Promotion.find({ type: { $in: [...PRICE_TYPES, T.QUANTITY_TIERS] }, actif: true, startDate: { $lte: now }, endDate: { $gte: now } }),
  ]);
  let count = await recomputeOfferPricing({ offerIds: promoted.map((offer) => offer._id) }, now);
  for (const promo of live) count += await recomputeForPromotion(promo, now);
  return count;
};

// ── Livraison offerte ───────────────────────

export interface FreeShippingRule {
  minAmount: number;
  promotionId: string;
  label: string;
}

/** Livraison offerte en cours, par boutique : le seuil le plus bas l'emporte. */
export const liveFreeShipping = async (shopIds: readonly unknown[], now: Date, session?: ClientSession | null): Promise<Map<string, FreeShippingRule>> => {
  const rules = new Map<string, FreeShippingRule>();
  if (shopIds.length === 0) return rules;
  const promos = await Promotion.find({
    type: T.FREE_SHIPPING,
    boutiqueId: { $in: shopIds.map((id) => new Types.ObjectId(String(id))) },
    actif: true,
    status: { $nin: [S.DRAFT, S.PAUSED, S.STOPPED] },
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).session(session ?? null);
  for (const promo of promos.filter((candidate) => isLive(candidate, now))) {
    const key = String(promo.boutiqueId);
    const current = rules.get(key);
    const minAmount = promo.minAmount ?? 0;
    if (!current || minAmount < current.minAmount) rules.set(key, { minAmount, promotionId: String(promo._id), label: promo.nom });
  }
  return rules;
};

// ── Codes promo ─────────────────────────────

export interface CouponLine {
  productBoutiqueId: unknown;
  boutiqueId: unknown;
  /** Prix unitaire payé, promotion comprise. */
  price: number;
  quantity: number;
  /** Le prix de la ligne vient déjà d'une promotion. */
  promoted: boolean;
}

export interface CouponResult {
  discount: number;
  /** Boutique dont la part porte toute la remise ; null = code de la plateforme, réparti au prorata. */
  boutiqueId: string | null;
  error?: string | undefined;
}

/**
 * Remise d'un code sur des lignes. Un code de boutique ne porte que sur sa
 * part du panier (et, s'il n'est pas cumulable, seulement sur les articles
 * sans promotion) ; un code de la plateforme porte sur tout le panier ou sur
 * ses offres.
 */
export const evaluateCoupon = (
  promo: Pick<
    IPromotion,
    "type" | "status" | "actif" | "boutiqueId" | "startDate" | "endDate" | "usageLimit" | "usedCount" | "scope" | "productBoutiqueIds" | "discountType" | "discountValue" | "minAmount" | "maxDiscount" | "stackable" | "flashQuantity" | "flashSold"
  >,
  lines: readonly CouponLine[],
  now: Date
): CouponResult => {
  const boutiqueId = promo.boutiqueId ? String(promo.boutiqueId) : null;
  if (promo.type !== T.COUPON || !isLive(promo, now)) {
    return { discount: 0, boutiqueId, error: "Ce coupon n'est pas valide (inactif, expiré ou épuisé)." };
  }
  let eligible = lines;
  if (boutiqueId) {
    eligible = lines.filter((line) => String(line.boutiqueId) === boutiqueId);
    if (eligible.length === 0) return { discount: 0, boutiqueId, error: "Ce code ne vaut que chez la boutique qui l'a créé : ajoutez un de ses articles." };
    if (!promo.stackable) eligible = eligible.filter((line) => !line.promoted);
  } else if (promo.scope === "product_boutique") {
    const ids = new Set(promo.productBoutiqueIds.map(String));
    eligible = lines.filter((line) => ids.has(String(line.productBoutiqueId)));
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

/** Un client n'utilise un code que `perCustomerLimit` fois (commandes annulées ou non payées exclues). */
export const customerUsedCode = async (userId: unknown, code: string, session?: ClientSession | null): Promise<number> => {
  return Order.countDocuments({
    userId: new Types.ObjectId(String(userId)),
    promotionCode: code,
    status: { $nin: [OrderStatus.CANCELLED, OrderStatus.PAYMENT_FAILED] },
  }).session(session ?? null);
};
