import { Types } from "mongoose";
import { Shop, type IShop } from "../../models/boutique.model.js";
import { Campaign, type ICampaign } from "../../models/campaign.model.js";
import { Order, OrderStatus } from "../../models/order.model.js";
import { Product, productBoutique } from "../../models/product.model.js";
import {
  DiscountType,
  Promotion,
  PromotionScope,
  PromotionStatus,
  PromotionType,
  type IPromotion,
} from "../../models/promotion.model.js";
import { ShopOrder, ShopOrderStatus } from "../../models/shopOrder.model.js";
import { HttpError } from "../middlewares/error.middleware.js";
import type { AuthUser } from "../middlewares/auth.middleware.js";
import { arePromotionsBlocked, isShopSuspended } from "../helpers/moderation.helper.js";
import { canManageShop, SHOP_FORBIDDEN_MESSAGE } from "../helpers/shopAccess.js";
import logger from "../logger/logger.js";
import {
  availablePromotionActions,
  checkPromotionAction,
  checkShopPromotionInput,
  NO_END,
  PROMO_LIMITS,
  PROMOTION_STATUS_LABELS,
  PROMOTION_TABS,
  PROMOTION_TYPE_LABELS,
  PromotionAction,
  statusAt,
  type PromotionTab,
  type ShopPromotionContext,
  type ShopPromotionInput,
} from "../helpers/promotion.rules.js";
import { recomputeForPromotion } from "./pricing.service.js";

// ─────────────────────────────────────────────
//  Promotions de boutique.
//
//  La boutique planifie et lance seule ses promotions : aucune validation de
//  la plateforme. Les règles (remise, durée, plafonds) sont dans
//  promotion.rules.ts ; chaque écriture recalcule le prix des offres
//  touchées.
// ─────────────────────────────────────────────

const T = PromotionType;
const S = PromotionStatus;
const DAY = 24 * 3600 * 1000;
const RUNNING: readonly PromotionStatus[] = [S.SCHEDULED, S.ACTIVE, S.PAUSED];

/** Corps reçu pour créer ou modifier une promotion (déjà validé par le formulaire). */
export interface ShopPromotionBody {
  type: PromotionType;
  nom: string;
  description?: string | undefined;
  discountType?: DiscountType | undefined;
  discountValue?: number | undefined;
  startDate?: string | Date | undefined;
  endDate?: string | Date | undefined;
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
  /** « now » : lancée tout de suite ; « schedule » : à sa date de début ; « draft » : brouillon. */
  launch?: "now" | "schedule" | "draft" | undefined;
}

const oid = (value: unknown) => new Types.ObjectId(String(value));

/** La boutique, si ce compte la gère. */
export const managedShop = async (user: AuthUser | undefined, shopId: string): Promise<IShop> => {
  if (!Types.ObjectId.isValid(shopId)) throw new HttpError("Boutique introuvable.", 404);
  const shop = await Shop.findById(shopId);
  if (!shop) throw new HttpError("Boutique introuvable.", 404);
  if (!canManageShop(user, shop)) throw new HttpError(SHOP_FORBIDDEN_MESSAGE, 403);
  return shop;
};

/** Plafonds : ce que la boutique a déjà en cours. */
export const promotionContext = async (shop: IShop, now: Date, exceptId?: unknown): Promise<ShopPromotionContext> => {
  const except = exceptId ? { _id: { $ne: oid(exceptId) } } : {};
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [running, activeCodes, flashThisMonth, deliveredOrders] = await Promise.all([
    Promotion.countDocuments({ ...except, boutiqueId: shop._id, status: { $in: RUNNING }, type: { $ne: T.QUANTITY_TIERS } }),
    Promotion.countDocuments({ ...except, boutiqueId: shop._id, status: { $in: RUNNING }, type: T.COUPON }),
    Promotion.countDocuments({ ...except, boutiqueId: shop._id, type: T.FLASH_SALE, status: { $ne: S.DRAFT }, startDate: { $gte: monthStart } }),
    ShopOrder.countDocuments({ boutiqueId: shop._id, status: { $in: [ShopOrderStatus.DELIVERED, ShopOrderStatus.COMPLETED] } }),
  ]);
  const created = (shop as unknown as { createdAt?: Date }).createdAt ?? now;
  return { running, activeCodes, flashThisMonth, shopAgeDays: Math.floor((now.getTime() - created.getTime()) / DAY), deliveredOrders };
};

const toInput = (body: ShopPromotionBody, startDate: Date, endDate: Date | undefined): ShopPromotionInput => ({
  type: body.type,
  nom: body.nom,
  discountType: body.discountType,
  discountValue: body.discountValue,
  startDate,
  endDate,
  productBoutiqueIds: body.productBoutiqueIds,
  code: body.code?.trim().toUpperCase(),
  minAmount: body.minAmount,
  maxDiscount: body.maxDiscount,
  usageLimit: body.usageLimit,
  tiers: body.tiers,
  flashQuantity: body.flashQuantity,
  confirmHighDiscount: body.confirmHighDiscount,
});

/** Les offres nommées sont-elles à la boutique, et en vente ? */
const checkOffers = async (shop: IShop, ids: readonly string[] = []): Promise<void> => {
  if (ids.length === 0) return;
  const offers = await productBoutique.find({ _id: { $in: ids.map(oid) } });
  if (offers.length !== new Set(ids).size) throw new HttpError("Une offre est introuvable.", 404);
  if (offers.some((offer) => String(offer.boutiqueId) !== String(shop._id))) {
    throw new HttpError("Une promotion ne porte que sur les offres de sa boutique.", 403);
  }
  if (offers.some((offer) => offer.hiddenAt)) throw new HttpError("Une offre masquée par la modération ne peut pas être en promotion.", 400);
};

/** Une offre ne repasse pas en vente flash moins de 30 jours après la précédente. */
const checkFlashCooldown = async (ids: readonly string[], now: Date, exceptId?: unknown): Promise<void> => {
  const recent = await Promotion.findOne({
    ...(exceptId ? { _id: { $ne: oid(exceptId) } } : {}),
    type: T.FLASH_SALE,
    status: { $ne: S.DRAFT },
    productBoutiqueIds: { $in: ids.map(oid) },
    endDate: { $gte: new Date(now.getTime() - PROMO_LIMITS.flashCooldownDays * DAY) },
  });
  if (recent) throw new HttpError(`Une offre ne repasse pas en vente flash moins de ${PROMO_LIMITS.flashCooldownDays} jours après la précédente.`, 400);
};

const parseDate = (value: string | Date | undefined): Date | undefined => (value === undefined || value === "" ? undefined : new Date(value));

/** Dates retenues : « now » démarre maintenant ; un prix par quantité n'a pas de fin. */
const datesOf = (body: ShopPromotionBody, now: Date): { start: Date; end: Date | undefined } => {
  const start = body.launch === "now" || !body.startDate ? now : (parseDate(body.startDate) ?? now);
  const end = body.type === T.QUANTITY_TIERS ? NO_END : parseDate(body.endDate);
  return { start, end };
};

const fieldsOf = (body: ShopPromotionBody, start: Date, end: Date) => ({
  type: body.type,
  nom: body.nom.trim(),
  description: body.description?.trim() || undefined,
  scope: body.type === T.COUPON || body.type === T.FREE_SHIPPING ? PromotionScope.CART : PromotionScope.PRODUCT_BOUTIQUE,
  discountType: body.type === T.COUPON ? (body.discountType ?? DiscountType.PERCENTAGE) : DiscountType.PERCENTAGE,
  discountValue: body.type === T.QUANTITY_TIERS || body.type === T.FREE_SHIPPING ? 0 : (body.discountValue ?? 0),
  code: body.type === T.COUPON ? body.code!.trim().toUpperCase() : null,
  startDate: start,
  endDate: end,
  productBoutiqueIds: [T.PRODUCT_DISCOUNT, T.FLASH_SALE, T.QUANTITY_TIERS].includes(body.type) ? (body.productBoutiqueIds ?? []).map(oid) : [],
  ...(body.type === T.SHOP_DISCOUNT
    ? {
        target: {
          familleIds: (body.familleIds ?? []).map(oid),
          categoryIds: (body.categoryIds ?? []).map(oid),
          excludedOfferIds: (body.excludedOfferIds ?? []).map(oid),
        },
      }
    : {}),
  minAmount: body.minAmount ?? 0,
  maxDiscount: body.maxDiscount ?? null,
  usageLimit: body.usageLimit ?? null,
  perCustomerLimit: body.type === T.COUPON ? (body.perCustomerLimit ?? 1) : null,
  stackable: body.stackable ?? true,
  tiers: body.type === T.QUANTITY_TIERS ? [...(body.tiers ?? [])].sort((a, b) => a.minQuantity - b.minQuantity) : [],
  flashQuantity: body.type === T.FLASH_SALE ? (body.flashQuantity ?? null) : null,
  highDiscountConfirmed: !!body.confirmHighDiscount,
});

/** Contrôles communs à la création, la modification et le lancement. */
const checkLaunchable = async (shop: IShop, body: ShopPromotionBody, start: Date, end: Date | undefined, now: Date, exceptId?: unknown) => {
  if (arePromotionsBlocked(shop, now)) {
    throw new HttpError(`Les promotions de cette boutique sont suspendues jusqu'au ${shop.promotionsBlockedUntil!.toLocaleDateString("fr-FR")}.`, 403);
  }
  const refusal = checkShopPromotionInput(toInput(body, start, end), await promotionContext(shop, now, exceptId), now);
  if (refusal) throw new HttpError(refusal, 400);
  await checkOffers(shop, [...(body.productBoutiqueIds ?? []), ...(body.excludedOfferIds ?? [])]);
  if (body.type === T.FLASH_SALE) await checkFlashCooldown(body.productBoutiqueIds ?? [], now, exceptId);
  if (body.type === T.COUPON) {
    const taken = await Promotion.findOne({ code: body.code!.trim().toUpperCase(), ...(exceptId ? { _id: { $ne: oid(exceptId) } } : {}) });
    if (taken) throw new HttpError("Ce code est déjà pris : choisissez-en un autre.", 409);
  }
};

export const createShopPromotion = async (user: AuthUser | undefined, shopId: string, body: ShopPromotionBody, now = new Date()): Promise<IPromotion> => {
  const shop = await managedShop(user, shopId);
  const { start, end } = datesOf(body, now);
  const draft = body.launch === "draft";
  if (!draft && isShopSuspended(shop, now)) {
    throw new HttpError("Votre boutique est suspendue : préparez la promotion en brouillon, elle se lancera après.", 400);
  }
  await checkLaunchable(shop, body, start, end, now);

  const fields = fieldsOf(body, start, end ?? NO_END);
  const promo = await Promotion.create({
    ...fields,
    description: fields.description ?? "",
    boutiqueId: shop._id,
    status: draft ? S.DRAFT : start <= now ? S.ACTIVE : S.SCHEDULED,
    actif: true,
    usedCount: 0,
    flashSold: 0,
    createdBy: user?.id ? oid(user.id) : null,
  });
  if (!draft) await recomputeForPromotion(promo, now);
  logger.info(`Promotion ${promo.type} ${String(promo._id)} de ${shop.nom} : ${promo.status}`);
  return promo;
};

/** Une promotion de boutique, si ce compte gère la boutique. */
export const managedPromotion = async (user: AuthUser | undefined, promotionId: string): Promise<{ promo: IPromotion; shop: IShop }> => {
  if (!Types.ObjectId.isValid(promotionId)) throw new HttpError("Promotion introuvable.", 404);
  const promo = await Promotion.findById(promotionId);
  if (!promo || !promo.boutiqueId) throw new HttpError("Promotion introuvable.", 404);
  const shop = await managedShop(user, String(promo.boutiqueId));
  return { promo, shop };
};

/** Un brouillon ou une promotion programmée se modifie jusqu'à son début. */
export const updateShopPromotion = async (user: AuthUser | undefined, promotionId: string, body: ShopPromotionBody, now = new Date()): Promise<IPromotion> => {
  const { promo, shop } = await managedPromotion(user, promotionId);
  const status = statusAt(promo, now);
  if (status !== S.DRAFT && status !== S.SCHEDULED) throw new HttpError("Une promotion commencée ne se modifie plus : prolongez-la ou arrêtez-la.", 400);
  if (body.type !== promo.type) throw new HttpError("Le type d'une promotion ne change pas : créez-en une autre.", 400);
  const { start, end } = datesOf(body, now);
  // Comme la création et le lancement : une boutique suspendue ne met rien en ligne.
  if (status === S.SCHEDULED && start <= now && isShopSuspended(shop, now)) {
    throw new HttpError("Votre boutique est suspendue : la promotion se lancera après la suspension.", 400);
  }
  await checkLaunchable(shop, body, start, end, now, promo._id);
  const previous = { type: promo.type, boutiqueId: promo.boutiqueId ?? null, productBoutiqueIds: [...promo.productBoutiqueIds] };
  promo.set(fieldsOf(body, start, end ?? NO_END));
  if (status === S.SCHEDULED) promo.status = start <= now ? S.ACTIVE : S.SCHEDULED;
  await promo.save();
  if (status === S.SCHEDULED) {
    await recomputeForPromotion(previous, now);
    await recomputeForPromotion(promo, now);
  }
  return promo;
};

export const applyPromotionAction = async (
  user: AuthUser | undefined,
  promotionId: string,
  action: PromotionAction,
  body: { endDate?: string | Date | undefined; now?: boolean | undefined },
  now = new Date()
): Promise<IPromotion> => {
  const { promo, shop } = await managedPromotion(user, promotionId);
  const endDate = parseDate(body.endDate);
  const refusal = checkPromotionAction(action, promo, { endDate }, now);
  if (refusal) throw new HttpError(refusal, 400);

  switch (action) {
    case PromotionAction.LAUNCH: {
      if (isShopSuspended(shop, now)) throw new HttpError("Votre boutique est suspendue : la promotion se lancera après la suspension.", 400);
      const start = body.now || promo.startDate <= now ? now : promo.startDate;
      const draftBody: ShopPromotionBody = {
        type: promo.type,
        nom: promo.nom,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        productBoutiqueIds: promo.productBoutiqueIds.map(String),
        excludedOfferIds: promo.target?.excludedOfferIds?.map(String),
        code: promo.code ?? undefined,
        minAmount: promo.minAmount,
        usageLimit: promo.usageLimit ?? undefined,
        tiers: promo.tiers,
        flashQuantity: promo.flashQuantity ?? undefined,
        confirmHighDiscount: promo.highDiscountConfirmed,
      };
      // La durée choisie est gardée : un lancement anticipé avance aussi la fin.
      const end = promo.type === T.QUANTITY_TIERS ? NO_END : new Date(start.getTime() + (promo.endDate.getTime() - promo.startDate.getTime()));
      await checkLaunchable(shop, draftBody, start, end, now, promo._id);
      promo.startDate = start;
      promo.endDate = end;
      promo.status = start <= now ? S.ACTIVE : S.SCHEDULED;
      break;
    }
    case PromotionAction.PAUSE:
      promo.status = S.PAUSED;
      break;
    case PromotionAction.RESUME:
      if (arePromotionsBlocked(shop, now)) throw new HttpError("Les promotions de cette boutique sont suspendues par la modération.", 403);
      if (promo.startDate <= now && isShopSuspended(shop, now)) {
        throw new HttpError("Votre boutique est suspendue : la promotion reprendra après la suspension.", 400);
      }
      promo.status = promo.startDate > now ? S.SCHEDULED : S.ACTIVE;
      break;
    case PromotionAction.EXTEND:
      promo.endDate = endDate!;
      break;
    case PromotionAction.STOP:
      promo.status = S.STOPPED;
      promo.stoppedAt = now;
      promo.stopReason = "Arrêtée par la boutique.";
      break;
    default:
      throw new HttpError("Action inconnue.", 400);
  }
  await promo.save();
  await recomputeForPromotion(promo, now);
  logger.info(`Promotion ${String(promo._id)} : ${action} (${promo.status})`);
  return promo;
};

// ── Lecture ─────────────────────────────────

export interface PromotionStats {
  orders: number;
  units: number;
  revenue: number;
  discount: number;
}

const EMPTY_STATS: PromotionStats = { orders: 0, units: 0, revenue: 0, discount: 0 };

/** Ventes faites sous chaque promotion : commandes, unités, chiffre d'affaires, remise accordée. */
export const promotionStats = async (promos: readonly IPromotion[]): Promise<Map<string, PromotionStats>> => {
  const stats = new Map<string, PromotionStats>(promos.map((promo) => [String(promo._id), { ...EMPTY_STATS }]));
  if (promos.length === 0) return stats;
  const counted = { status: { $nin: [OrderStatus.PAYMENT_FAILED, OrderStatus.CANCELLED] } };
  const lineRows: { _id: Types.ObjectId; orders: number; units: number; revenue: number; discount: number }[] = await Order.aggregate([
    { $match: { ...counted, "items.promotionId": { $in: promos.map((promo) => promo._id) } } },
    { $unwind: "$items" },
    { $match: { "items.promotionId": { $in: promos.map((promo) => promo._id) } } },
    {
      $group: {
        _id: "$items.promotionId",
        orderIds: { $addToSet: "$_id" },
        units: { $sum: "$items.quantity" },
        revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        discount: { $sum: { $multiply: [{ $subtract: [{ $ifNull: ["$items.basePrice", "$items.price"] }, "$items.price"] }, "$items.quantity"] } },
      },
    },
    { $project: { orders: { $size: "$orderIds" }, units: 1, revenue: 1, discount: 1 } },
  ]);
  for (const row of lineRows) stats.set(String(row._id), { orders: row.orders, units: row.units, revenue: row.revenue, discount: row.discount });

  const codes = promos.filter((promo) => promo.type === T.COUPON && promo.code);
  if (codes.length > 0) {
    const codeRows: { _id: string; orders: number; revenue: number; discount: number }[] = await Order.aggregate([
      { $match: { ...counted, promotionCode: { $in: codes.map((promo) => promo.code) } } },
      { $group: { _id: "$promotionCode", orders: { $sum: 1 }, revenue: { $sum: "$amount" }, discount: { $sum: "$discountAmount" } } },
    ]);
    for (const row of codeRows) {
      const promo = codes.find((candidate) => candidate.code === row._id);
      if (promo) stats.set(String(promo._id), { orders: row.orders, units: 0, revenue: row.revenue, discount: row.discount });
    }
  }
  return stats;
};

export interface PromotionPage {
  items: IPromotion[];
  total: number;
  page: number;
  totalPages: number;
  counts: Record<PromotionTab, number>;
}

const TAB_SORT: Record<PromotionTab, Record<string, 1 | -1>> = {
  active: { endDate: 1 },
  scheduled: { startDate: 1 },
  ended: { endDate: -1 },
};

export const listShopPromotions = async (shopId: Types.ObjectId, tab: PromotionTab, page: number, limit: number): Promise<PromotionPage> => {
  const filter = { boutiqueId: shopId, status: { $in: PROMOTION_TABS[tab] } };
  const [items, total, ...counts] = await Promise.all([
    Promotion.find(filter).sort(TAB_SORT[tab]).skip((page - 1) * limit).limit(limit),
    Promotion.countDocuments(filter),
    ...(Object.keys(PROMOTION_TABS) as PromotionTab[]).map((key) =>
      Promotion.countDocuments({ boutiqueId: shopId, status: { $in: PROMOTION_TABS[key] } })
    ),
  ]);
  const keys = Object.keys(PROMOTION_TABS) as PromotionTab[];
  return {
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    counts: Object.fromEntries(keys.map((key, index) => [key, counts[index] ?? 0])) as Record<PromotionTab, number>,
  };
};

export { availablePromotionActions, PROMOTION_STATUS_LABELS, PROMOTION_TYPE_LABELS };

// ── Produits phares ─────────────────────────

/** Place une offre parmi les 6 produits phares de sa vitrine (ou l'en retire). La place prise est libérée. */
export const setFeaturedRank = async (user: AuthUser | undefined, offerId: string, rank: number | null): Promise<void> => {
  if (!Types.ObjectId.isValid(offerId)) throw new HttpError("Produit en boutique non trouvé", 404);
  const offer = await productBoutique.findById(offerId);
  if (!offer) throw new HttpError("Produit en boutique non trouvé", 404);
  await managedShop(user, String(offer.boutiqueId));
  if (rank !== null) {
    if (offer.hiddenAt) throw new HttpError("Une offre masquée ne peut pas être un produit phare.", 400);
    await productBoutique.updateMany({ boutiqueId: offer.boutiqueId, featuredRank: rank, _id: { $ne: offer._id } }, { $set: { featuredRank: null } });
  }
  offer.featuredRank = rank;
  await offer.save();
};

// ── Campagnes de la plateforme ──────────────

const CAMPAIGN_MAX_DAYS = 30;

export const checkCampaignInput = (input: { startDate: Date; endDate: Date; minDiscount: number }): string | null => {
  if (Number.isNaN(input.startDate.getTime()) || Number.isNaN(input.endDate.getTime())) return "Dates invalides.";
  if (input.endDate <= input.startDate) return "La fin vient après le début.";
  if (input.endDate.getTime() - input.startDate.getTime() > CAMPAIGN_MAX_DAYS * DAY) return `Une campagne dure ${CAMPAIGN_MAX_DAYS} jours au plus.`;
  if (input.minDiscount < PROMO_LIMITS.minPercent || input.minDiscount > PROMO_LIMITS.maxPercent) {
    return `La remise minimale va de ${PROMO_LIMITS.minPercent} à ${PROMO_LIMITS.maxPercent} %.`;
  }
  return null;
};

export const campaignState = (campaign: Pick<ICampaign, "actif" | "startDate" | "endDate">, now: Date): "upcoming" | "running" | "ended" =>
  !campaign.actif || now > campaign.endDate ? "ended" : now < campaign.startDate ? "upcoming" : "running";

/**
 * Après une modification de la campagne par l'administration, ses promotions
 * suivent : closes avec elle, ou alignées sur ses nouvelles dates. Les prix
 * des offres concernées sont recalculés.
 */
export const syncCampaignPromotions = async (campaign: ICampaign, now = new Date()): Promise<number> => {
  const promos = await Promotion.find({ campaignId: campaign._id, status: { $in: [S.SCHEDULED, S.ACTIVE, S.PAUSED] } });
  const closed = campaignState(campaign, now) === "ended";
  for (const promo of promos) {
    if (closed) {
      promo.status = S.STOPPED;
      promo.stoppedAt = now;
      promo.stopReason = "La campagne de la plateforme est terminée.";
    } else {
      promo.endDate = campaign.endDate;
      if (campaign.startDate > now) {
        promo.startDate = campaign.startDate;
        if (promo.status === S.ACTIVE) promo.status = S.SCHEDULED;
      } else if (promo.status === S.SCHEDULED) {
        promo.startDate = now;
        promo.status = S.ACTIVE;
      }
    }
    await promo.save();
    await recomputeForPromotion(promo, now);
  }
  return promos.length;
};

/**
 * Offres inscrites à des campagnes, par campagne : celles d'une remise de la
 * campagne en cours. Une offre reste inscrite même quand une autre remise
 * (une vente flash plus forte) fixe son prix du moment.
 */
export const campaignOfferIds = async (campaignIds: readonly Types.ObjectId[], now: Date): Promise<Map<string, Types.ObjectId[]>> => {
  const promos = await Promotion.find({
    campaignId: { $in: campaignIds },
    status: PromotionStatus.ACTIVE,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).select("campaignId productBoutiqueIds");
  const byCampaign = new Map<string, Types.ObjectId[]>();
  for (const promo of promos) {
    const key = String(promo.campaignId);
    byCampaign.set(key, [...(byCampaign.get(key) ?? []), ...promo.productBoutiqueIds]);
  }
  return byCampaign;
};

/**
 * Une boutique inscrit des offres à une campagne : une remise produit, à la
 * remise minimale de la campagne au moins, rattachée à ses dates. Sans
 * validation : la boutique s'inscrit seule.
 */
export const joinCampaign = async (
  user: AuthUser | undefined,
  campaignId: string,
  body: { boutiqueId: string; productBoutiqueIds: string[]; discountValue: number; confirmHighDiscount?: boolean | undefined },
  now = new Date()
): Promise<IPromotion> => {
  if (!Types.ObjectId.isValid(campaignId)) throw new HttpError("Campagne introuvable.", 404);
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new HttpError("Campagne introuvable.", 404);
  if (campaignState(campaign, now) === "ended") throw new HttpError("Cette campagne est terminée.", 400);
  if (body.discountValue < campaign.minDiscount) throw new HttpError(`Cette campagne demande une remise de ${campaign.minDiscount} % au moins.`, 400);
  if (campaign.familleIds.length > 0) {
    const offers = await productBoutique.find({ _id: { $in: body.productBoutiqueIds.map(oid) } });
    const products = await Product.find({ _id: { $in: offers.map((offer) => offer.productId) } });
    const outside = products.some((product) => !campaign.familleIds.some((id) => String(id) === String(product.familleId)));
    if (outside) throw new HttpError("Une offre n'appartient pas aux familles de la campagne.", 400);
  }
  const start = campaign.startDate > now ? campaign.startDate : now;
  const promo = await createShopPromotion(
    user,
    body.boutiqueId,
    {
      type: T.PRODUCT_DISCOUNT,
      nom: `${campaign.nom} — −${body.discountValue} %`,
      discountValue: body.discountValue,
      productBoutiqueIds: body.productBoutiqueIds,
      startDate: start,
      endDate: campaign.endDate,
      launch: start <= now ? "now" : "schedule",
      confirmHighDiscount: body.confirmHighDiscount,
    },
    now
  );
  promo.campaignId = campaign._id as Types.ObjectId;
  await promo.save();
  await recomputeForPromotion(promo, now);
  return promo;
};
