import { type ClientSession, Types } from "mongoose";
import { Address } from "../../models/address.model.js";
import { Shop, type IShop } from "../../models/boutique.model.js";
import {
  Boost,
  BoostExposure,
  BoostGoal,
  BoostKind,
  BoostRelation,
  BoostStat,
  BoostStatus,
  BoostVisit,
  type IBoost,
  type IBoostAudience,
} from "../../models/boost.model.js";
import { CreditLedger, CreditReason, PlatformSetting } from "../../models/credit.model.js";
import { Order } from "../../models/order.model.js";
import { Product, productBoutique, type IProduct, type IProductBoutique } from "../../models/product.model.js";
import { Promotion, PromotionStatus, PromotionType } from "../../models/promotion.model.js";
import { RecentlyViewed } from "../../models/recentlyViewed.model.js";
import { ShopOrder } from "../../models/shopOrder.model.js";
import { EntityType, User } from "../../models/user.model.js";
import { Wishlist } from "../../models/wishlist.model.js";
import { HttpError } from "../middlewares/error.middleware.js";
import type { AuthUser } from "../middlewares/auth.middleware.js";
import { arePromotionsBlocked, isShopSuspended } from "../helpers/moderation.helper.js";
import { PROMO_LIMITS, statusAt } from "../helpers/promotion.rules.js";
import logger from "../logger/logger.js";
import { managedShop, promotionContext } from "./promotion.service.js";
import { targetsOffer } from "./pricing.service.js";

// ─────────────────────────────────────────────
//  Boosts : faire voir une promotion ou des produits à plus de clients.
//
//  La boutique réserve un budget sur ses crédits ; la plateforme montre ses
//  offres sur les places sponsorisées (accueil, recherche, catégorie, fiche
//  produit, page Promotions) aux clients visés, à prix fixe : à la visite
//  (ou aux 1 000 affichages). Le budget non dépensé est rendu à l'arrêt.
// ─────────────────────────────────────────────

const DAY = 24 * 3600 * 1000;
const MAX_OFFERS = 10;
const MAX_DAYS = 30;
const FREQUENCY_CAP = 3;
const ATTRIBUTION_MS = 7 * DAY;
/** Heures de diffusion (heure de Conakry, UTC) : le budget du jour se dépense régulièrement entre elles. */
const DELIVERY_HOURS = { from: 7, to: 22 };

export const dayOf = (date: Date): string => date.toISOString().slice(0, 10);
const monthOf = (date: Date): string => date.toISOString().slice(0, 7);
const oid = (value: unknown) => new Types.ObjectId(String(value));

// ── Réglages ────────────────────────────────

export interface BoostSettings {
  /** Prix d'une visite de la fiche, en GNF. */
  costPerVisit: number;
  /** Prix de 1 000 affichages, en GNF. */
  costPerThousandViews: number;
  /** Crédits offerts à chaque boutique le 1er du mois. */
  monthlyCredits: number;
  /** Le budget minimum paie au moins ce nombre de visites par jour. */
  minVisitsPerDay: number;
  /** Une audience personnalisée vise au moins ce nombre de clients. */
  minAudience: number;
}

export const DEFAULT_BOOST_SETTINGS: BoostSettings = {
  costPerVisit: 500,
  costPerThousandViews: 5000,
  monthlyCredits: 50000,
  minVisitsPerDay: 20,
  minAudience: Number(process.env.BOOST_MIN_AUDIENCE ?? 100),
};

export const getBoostSettings = async (): Promise<BoostSettings> => {
  const stored = await PlatformSetting.findOne({ key: "boost" });
  return { ...DEFAULT_BOOST_SETTINGS, ...((stored?.value ?? {}) as Partial<BoostSettings>) };
};

export const updateBoostSettings = async (input: Partial<BoostSettings>): Promise<BoostSettings> => {
  const current = await getBoostSettings();
  const next = { ...current, ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) } as BoostSettings;
  await PlatformSetting.findOneAndUpdate({ key: "boost" }, { $set: { value: next } }, { upsert: true });
  return next;
};

export const minDailyBudget = (settings: BoostSettings): number => settings.costPerVisit * settings.minVisitsPerDay;

// ── Crédits ─────────────────────────────────

/** Mouvement sur le portefeuille : refusé si le solde ne suffit pas. */
export const moveCredits = async (
  shopId: unknown,
  delta: number,
  reason: CreditReason,
  label: string,
  ref: string | null,
  session?: ClientSession | null
): Promise<number> => {
  const amount = Math.round(delta);
  const shop = await Shop.findOneAndUpdate(
    { _id: oid(shopId), ...(amount < 0 ? { boostCredits: { $gte: -amount } } : {}) },
    { $inc: { boostCredits: amount } },
    { new: true, ...(session ? { session } : {}) }
  );
  if (!shop) throw new HttpError("Crédits insuffisants : rechargez votre portefeuille.", 400);
  await CreditLedger.create([{ boutiqueId: shop._id, delta: amount, balanceAfter: shop.boostCredits, reason, ref, label }], session ? { session } : {});
  return shop.boostCredits;
};

/** Le 1er du mois, chaque boutique reçoit ses crédits offerts, une fois. */
export const grantMonthlyCredits = async (now = new Date()): Promise<number> => {
  const settings = await getBoostSettings();
  if (settings.monthlyCredits <= 0) return 0;
  const month = monthOf(now);
  const granted = new Set((await CreditLedger.find({ reason: CreditReason.MONTHLY_GRANT, ref: month }).select("boutiqueId")).map((row) => String(row.boutiqueId)));
  const shops = await Shop.find({}).select("_id");
  let count = 0;
  for (const shop of shops) {
    if (granted.has(String(shop._id))) continue;
    try {
      await moveCredits(shop._id, settings.monthlyCredits, CreditReason.MONTHLY_GRANT, `Crédits offerts — ${month}`, month);
      count += 1;
    } catch (error) {
      logger.warn(`Crédits offerts non versés à ${String(shop._id)} : ${(error as Error).message}`);
    }
  }
  return count;
};

// ── Audience ────────────────────────────────

export interface AudienceInput {
  mode?: "auto" | "custom" | undefined;
  communes?: string[] | undefined;
  villes?: string[] | undefined;
  customerTypes?: string[] | undefined;
  interestFamilleIds?: string[] | undefined;
  relation?: BoostRelation | undefined;
}

const CUSTOMER_TYPES: readonly EntityType[] = [EntityType.USER, EntityType.USER_SOCIETE];

export const toAudience = (input: AudienceInput | undefined): IBoostAudience => ({
  mode: input?.mode === "custom" ? "custom" : "auto",
  communes: (input?.communes ?? []).map((value) => value.trim()).filter(Boolean),
  villes: (input?.villes ?? []).map((value) => value.trim()).filter(Boolean),
  customerTypes: (input?.customerTypes ?? []).filter((value) => (CUSTOMER_TYPES as readonly string[]).includes(value)),
  interestFamilleIds: (input?.interestFamilleIds ?? []).filter((id) => Types.ObjectId.isValid(id)).map(oid),
  relation: input?.relation && Object.values(BoostRelation).includes(input.relation) ? input.relation : BoostRelation.ALL,
});

const intersect = (a: Set<string>, b: Set<string>) => new Set([...a].filter((value) => b.has(value)));

/**
 * Clients visés par une audience. Automatique : tous les clients (la
 * pertinence de la page fait le tri). Personnalisée : zone (commune ou ville
 * d'une adresse), type de compte, intérêt (a consulté, mis en favori ou
 * acheté dans ces familles depuis 30 jours), relation avec la boutique.
 */
export const audienceUsers = async (shopId: unknown, audience: IBoostAudience, now = new Date()): Promise<Set<string>> => {
  const types = audience.customerTypes.length > 0 ? (audience.customerTypes as EntityType[]) : CUSTOMER_TYPES;
  let users = new Set((await User.find({ role: { $in: types }, blockedAt: null }).select("_id")).map((user) => String(user._id)));
  if (audience.mode !== "custom") return users;

  if (audience.communes.length > 0 || audience.villes.length > 0) {
    const ids: unknown[] = await Address.distinct("userId", {
      $or: [
        ...(audience.communes.length > 0 ? [{ commune: { $in: audience.communes } }] : []),
        ...(audience.villes.length > 0 ? [{ ville: { $in: audience.villes } }] : []),
      ],
    });
    users = intersect(users, new Set(ids.map(String)));
  }

  if (audience.interestFamilleIds.length > 0) {
    const since = new Date(now.getTime() - 30 * DAY);
    const productIds = (await Product.find({ familleId: { $in: audience.interestFamilleIds } }).select("_id")).map((product) => product._id);
    const offerIds = (await productBoutique.find({ productId: { $in: productIds } }).select("_id")).map((offer) => offer._id);
    const [viewed, wished, bought] = await Promise.all([
      RecentlyViewed.find({ items: { $elemMatch: { productBoutiqueId: { $in: offerIds }, viewedAt: { $gte: since } } } }).select("userId"),
      Wishlist.find({ "items.productBoutiqueId": { $in: offerIds } }).select("userId"),
      Order.distinct("userId", { createdAt: { $gte: since }, "items.productId": { $in: productIds } }),
    ]);
    const interested = new Set<string>([
      ...viewed.map((row) => String(row.userId)),
      ...wished.map((row) => String(row.userId)),
      ...(bought as unknown[]).map(String),
    ]);
    users = intersect(users, interested);
  }

  if (audience.relation !== BoostRelation.ALL) {
    const clients = new Set(((await ShopOrder.distinct("userId", { boutiqueId: oid(shopId) })) as unknown[]).map(String));
    users = audience.relation === BoostRelation.RETURNING ? intersect(users, clients) : new Set([...users].filter((id) => !clients.has(id)));
  }
  return users;
};

const audienceCache = new Map<string, { at: number; users: Set<string> }>();
const AUDIENCE_TTL = 10 * 60 * 1000;

const cachedAudience = async (boost: IBoost, now: Date): Promise<Set<string>> => {
  const key = String(boost._id);
  const hit = audienceCache.get(key);
  if (hit && now.getTime() - hit.at < AUDIENCE_TTL) return hit.users;
  const users = await audienceUsers(boost.boutiqueId, boost.audience, now);
  audienceCache.set(key, { at: now.getTime(), users });
  return users;
};

// ── Offres boostées ─────────────────────────

/** Une offre peut-elle être boostée : en stock, en vente, avec une photo. */
export const isBoostable = (offer: Pick<IProductBoutique, "stock" | "hiddenAt" | "urlImages">): boolean =>
  offer.stock > 0 && !offer.hiddenAt && (offer.urlImages?.length ?? 0) > 0;

export interface BoostInput {
  kind: BoostKind;
  promotionId?: string | undefined;
  productBoutiqueIds?: string[] | undefined;
  goal?: BoostGoal | undefined;
  audience?: AudienceInput | undefined;
  dailyBudget: number;
  days: number;
}

/** Offres et fin possibles d'un boost : celles de la promotion (jusqu'à sa fin), ou celles choisies. */
const resolveBoostOffers = async (shop: IShop, input: BoostInput, now: Date) => {
  let offers: IProductBoutique[];
  let latestEnd: Date | null = null;
  let promotionId: Types.ObjectId | null = null;

  if (input.kind === BoostKind.PROMOTION) {
    if (!input.promotionId || !Types.ObjectId.isValid(input.promotionId)) throw new HttpError("Choisissez la promotion à booster.", 400);
    const promo = await Promotion.findById(input.promotionId);
    if (!promo || String(promo.boutiqueId) !== String(shop._id)) throw new HttpError("Promotion introuvable.", 404);
    const status = statusAt(promo, now);
    if (status !== PromotionStatus.ACTIVE && status !== PromotionStatus.SCHEDULED) throw new HttpError("Seule une promotion en cours ou programmée se booste.", 400);
    if (promo.type === PromotionType.COUPON || promo.type === PromotionType.FREE_SHIPPING) {
      throw new HttpError("Un code ou une livraison offerte n'a pas de produit à montrer : boostez plutôt les produits.", 400);
    }
    promotionId = promo._id as Types.ObjectId;
    latestEnd = promo.endDate;
    if (promo.type === PromotionType.SHOP_DISCOUNT) {
      const shopOffers = await productBoutique.find({ boutiqueId: shop._id }).sort({ salesCount30d: -1 });
      const products = await Product.find({ _id: { $in: shopOffers.map((offer) => offer.productId) } });
      offers = shopOffers.filter((offer) =>
        targetsOffer(promo, offer, products.find((product) => String(product._id) === String(offer.productId)))
      );
    } else {
      offers = await productBoutique.find({ _id: { $in: promo.productBoutiqueIds } });
    }
    // La boutique peut en retirer.
    if (input.productBoutiqueIds && input.productBoutiqueIds.length > 0) {
      const kept = new Set(input.productBoutiqueIds);
      offers = offers.filter((offer) => kept.has(String(offer._id)));
    }
  } else {
    const ids = input.productBoutiqueIds ?? [];
    if (ids.length === 0) throw new HttpError("Choisissez au moins un produit.", 400);
    if (ids.length > MAX_OFFERS) throw new HttpError(`${MAX_OFFERS} produits au plus par boost.`, 400);
    offers = await productBoutique.find({ _id: { $in: ids.filter((id) => Types.ObjectId.isValid(id)).map(oid) } });
    if (offers.length !== new Set(ids).size) throw new HttpError("Un produit est introuvable.", 404);
    if (offers.some((offer) => String(offer.boutiqueId) !== String(shop._id))) throw new HttpError("Un boost ne montre que les produits de sa boutique.", 403);
  }

  const eligible = offers.filter(isBoostable).slice(0, MAX_OFFERS);
  if (eligible.length === 0) throw new HttpError("Aucun de ces produits ne peut être boosté : il faut du stock et au moins une photo.", 400);
  return { offers: eligible, latestEnd, promotionId };
};

export interface BoostEstimate {
  audienceSize: number;
  minAudience: number;
  audienceOk: boolean;
  days: number;
  maxDays: number;
  totalBudget: number;
  minDailyBudget: number;
  dailyViews: [number, number];
  dailyVisits: [number, number];
  costPerVisit: number;
  costPerThousandViews: number;
  credits: number;
}

/** Fourchettes indicatives : taux de visite de 2 à 4 %, plafond de 3 affichages par client et par jour. */
export const estimateResults = (
  input: { goal: BoostGoal; dailyBudget: number },
  settings: BoostSettings,
  audienceSize: number
): { dailyViews: [number, number]; dailyVisits: [number, number] } => {
  const cap = Math.max(1, audienceSize) * FREQUENCY_CAP;
  if (input.goal === BoostGoal.VIEWS) {
    const views = Math.min(cap, Math.floor((input.dailyBudget / settings.costPerThousandViews) * 1000));
    return { dailyViews: [Math.floor(views * 0.7), views], dailyVisits: [Math.floor(views * 0.02), Math.ceil(views * 0.04)] };
  }
  const visits = Math.floor(input.dailyBudget / settings.costPerVisit);
  return {
    dailyViews: [Math.min(cap, visits * 25), Math.min(cap, visits * 50)],
    dailyVisits: [Math.floor(Math.min(visits, cap * 0.04) * 0.6), Math.min(visits, Math.ceil(cap * 0.04))],
  };
};

const checkBoostInput = (input: BoostInput, settings: BoostSettings): string | null => {
  if (!Object.values(BoostKind).includes(input.kind)) return "Choisissez un boost de promotion ou de produit.";
  if (input.goal && !Object.values(BoostGoal).includes(input.goal)) return "Objectif inconnu.";
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_DAYS) return `Un boost dure de 1 à ${MAX_DAYS} jours.`;
  if (!(input.dailyBudget >= minDailyBudget(settings))) return `Le budget minimum est de ${minDailyBudget(settings)} GNF par jour.`;
  return null;
};

export const estimateBoost = async (user: AuthUser | undefined, shopId: string, input: BoostInput, now = new Date()): Promise<BoostEstimate> => {
  const shop = await managedShop(user, shopId);
  const settings = await getBoostSettings();
  const { latestEnd } = await resolveBoostOffers(shop, input, now);
  const audience = toAudience(input.audience);
  const users = await audienceUsers(shop._id, audience, now);
  const maxDays = latestEnd ? Math.max(1, Math.min(MAX_DAYS, Math.floor((latestEnd.getTime() - now.getTime()) / DAY))) : MAX_DAYS;
  const days = Math.max(1, Math.min(input.days || 1, maxDays));
  const goal = input.goal ?? BoostGoal.VISITS;
  return {
    audienceSize: users.size,
    minAudience: settings.minAudience,
    audienceOk: audience.mode !== "custom" || users.size >= settings.minAudience,
    days,
    maxDays,
    totalBudget: Math.round(input.dailyBudget * days),
    minDailyBudget: minDailyBudget(settings),
    ...estimateResults({ goal, dailyBudget: input.dailyBudget }, settings, users.size),
    costPerVisit: settings.costPerVisit,
    costPerThousandViews: settings.costPerThousandViews,
    credits: shop.boostCredits ?? 0,
  };
};

export const createBoost = async (user: AuthUser | undefined, shopId: string, input: BoostInput, now = new Date()): Promise<IBoost> => {
  const shop = await managedShop(user, shopId);
  const settings = await getBoostSettings();
  const refusal = checkBoostInput(input, settings);
  if (refusal) throw new HttpError(refusal, 400);
  if (isShopSuspended(shop, now)) throw new HttpError("Votre boutique est suspendue : elle ne peut pas être boostée d'ici là.", 400);
  if (arePromotionsBlocked(shop, now)) throw new HttpError("Les promotions et boosts de cette boutique sont suspendus par la modération.", 403);
  const context = await promotionContext(shop, now);
  if (context.shopAgeDays < PROMO_LIMITS.seniorityDays || context.deliveredOrders < PROMO_LIMITS.seniorityDeliveredOrders) {
    throw new HttpError(`Le boost s'ouvre après ${PROMO_LIMITS.seniorityDays} jours et ${PROMO_LIMITS.seniorityDeliveredOrders} commandes livrées.`, 400);
  }

  const { offers, latestEnd, promotionId } = await resolveBoostOffers(shop, input, now);
  const endDate = new Date(now.getTime() + input.days * DAY);
  if (latestEnd && endDate > latestEnd) {
    throw new HttpError(`Un boost de promotion ne dépasse pas la fin de la promotion (${latestEnd.toLocaleDateString("fr-FR")}).`, 400);
  }
  const audience = toAudience(input.audience);
  if (audience.mode === "custom") {
    const users = await audienceUsers(shop._id, audience, now);
    if (users.size < settings.minAudience) {
      throw new HttpError(`Cette audience compte moins de ${settings.minAudience} clients : élargissez-la, pour ne jamais viser une personne.`, 400);
    }
  }

  const reserved = Math.round(input.dailyBudget * input.days);
  const boostId = new Types.ObjectId();
  await moveCredits(shop._id, -reserved, CreditReason.BOOST_RESERVE, `Boost de ${input.days} jour${input.days > 1 ? "s" : ""}`, String(boostId));
  // Le budget est réservé avant l'écriture du boost : si elle échoue, il est rendu.
  const boost = await Boost.create({
    _id: boostId,
    boutiqueId: shop._id,
    kind: input.kind,
    promotionId,
    productBoutiqueIds: offers.map((offer) => offer._id),
    goal: input.goal ?? BoostGoal.VISITS,
    audience,
    dailyBudget: input.dailyBudget,
    reserved,
    spent: 0,
    costPerVisit: settings.costPerVisit,
    costPerThousandViews: settings.costPerThousandViews,
    startDate: now,
    endDate,
    status: BoostStatus.ACTIVE,
    createdBy: user?.id ? oid(user.id) : null,
  }).catch(async (error: unknown) => {
    await moveCredits(shop._id, reserved, CreditReason.BOOST_REFUND, "Boost non lancé : budget rendu", String(boostId)).catch((refundError: unknown) =>
      logger.error(`Budget du boost ${String(boostId)} non rendu : ${(refundError as Error).message}`)
    );
    throw error;
  });
  logger.info(`Boost ${String(boost._id)} lancé par ${shop.nom} : ${reserved} GNF sur ${input.days} jour(s)`);
  return boost;
};

/**
 * Termine un boost et rend le budget non dépensé. Le passage à « terminé » se
 * fait par une écriture conditionnelle : deux arrêts simultanés (un clic
 * pendant le tour du planificateur, un double clic) ne rendent le budget
 * qu'une fois.
 */
export const finishBoost = async (boost: IBoost, status: BoostStatus.ENDED | BoostStatus.STOPPED, reason: string, now = new Date()): Promise<IBoost> => {
  if (boost.status === BoostStatus.ENDED || boost.status === BoostStatus.STOPPED) return boost;
  const refund = Math.max(0, Math.round(boost.reserved - boost.spent));
  // Seul le premier arrêt passe : les dépenses, elles, ne s'écrivent que sur un boost en cours.
  const written = await Boost.updateOne(
    { _id: boost._id, status: { $in: [BoostStatus.ACTIVE, BoostStatus.PAUSED] } },
    { $set: { status, stopReason: reason, endedAt: now, refunded: refund } }
  );
  if ((written as { modifiedCount?: number } | undefined)?.modifiedCount === 0) return boost;
  boost.status = status;
  boost.stopReason = reason;
  boost.endedAt = now;
  boost.refunded = refund;
  if (refund > 0) await moveCredits(boost.boutiqueId, refund, CreditReason.BOOST_REFUND, "Budget de boost non dépensé", String(boost._id));
  audienceCache.delete(String(boost._id));
  return boost;
};

export const managedBoost = async (user: AuthUser | undefined, boostId: string): Promise<IBoost> => {
  if (!Types.ObjectId.isValid(boostId)) throw new HttpError("Boost introuvable.", 404);
  const boost = await Boost.findById(boostId);
  if (!boost) throw new HttpError("Boost introuvable.", 404);
  await managedShop(user, String(boost.boutiqueId));
  return boost;
};

export const BOOST_ACTIONS = ["pause", "resume", "stop"] as const;
export type BoostAction = (typeof BOOST_ACTIONS)[number];

export const applyBoostAction = async (user: AuthUser | undefined, boostId: string, action: BoostAction, now = new Date()): Promise<IBoost> => {
  const boost = await managedBoost(user, boostId);
  switch (action) {
    case "pause":
      if (boost.status !== BoostStatus.ACTIVE) throw new HttpError("Seul un boost en cours se met en pause.", 400);
      boost.status = BoostStatus.PAUSED;
      await boost.save();
      return boost;
    case "resume":
      if (boost.status !== BoostStatus.PAUSED) throw new HttpError("Seul un boost en pause reprend.", 400);
      if (now >= boost.endDate) return finishBoost(boost, BoostStatus.ENDED, "Durée écoulée.", now);
      boost.status = BoostStatus.ACTIVE;
      await boost.save();
      return boost;
    case "stop":
      if (boost.status !== BoostStatus.ACTIVE && boost.status !== BoostStatus.PAUSED) throw new HttpError("Ce boost est déjà terminé.", 400);
      return finishBoost(boost, BoostStatus.STOPPED, "Arrêté par la boutique.", now);
    default:
      throw new HttpError("Action inconnue.", 400);
  }
};

/** Sanction ou suspension : les boosts de la boutique s'arrêtent, budget rendu. */
export const stopShopBoosts = async (shopId: unknown, reason: string, now = new Date()): Promise<number> => {
  const boosts = await Boost.find({ boutiqueId: oid(shopId), status: { $in: [BoostStatus.ACTIVE, BoostStatus.PAUSED] } });
  for (const boost of boosts) await finishBoost(boost, BoostStatus.STOPPED, reason, now);
  return boosts.length;
};

/**
 * Arrêts automatiques : durée écoulée, budget dépensé, promotion terminée,
 * boutique suspendue ou privée de promotions, plus aucun produit à montrer.
 */
export const runBoostTick = async (now = new Date()): Promise<number> => {
  const boosts = await Boost.find({ status: { $in: [BoostStatus.ACTIVE, BoostStatus.PAUSED] } });
  if (boosts.length === 0) return 0;
  const [shops, offers, promos] = await Promise.all([
    Shop.find({ _id: { $in: boosts.map((boost) => boost.boutiqueId) } }),
    productBoutique.find({ _id: { $in: boosts.flatMap((boost) => boost.productBoutiqueIds) } }),
    Promotion.find({ _id: { $in: boosts.flatMap((boost) => (boost.promotionId ? [boost.promotionId] : [])) } }),
  ]);
  let finished = 0;
  for (const boost of boosts) {
    const shop = shops.find((candidate) => String(candidate._id) === String(boost.boutiqueId));
    const promo = promos.find((candidate) => String(candidate._id) === String(boost.promotionId));
    const promoStatus = promo ? statusAt(promo, now) : null;
    let end: [BoostStatus.ENDED | BoostStatus.STOPPED, string] | null = null;
    if (now >= boost.endDate) end = [BoostStatus.ENDED, "Durée écoulée."];
    else if (boost.spent >= boost.reserved) end = [BoostStatus.ENDED, "Budget dépensé."];
    else if (boost.kind === BoostKind.PROMOTION && (!promo || promoStatus === PromotionStatus.ENDED || promoStatus === PromotionStatus.STOPPED)) {
      end = [BoostStatus.ENDED, "La promotion est terminée."];
    } else if (!shop || isShopSuspended(shop, now)) end = [BoostStatus.STOPPED, "Boutique suspendue."];
    else if (arePromotionsBlocked(shop, now)) end = [BoostStatus.STOPPED, "Promotions suspendues par la modération."];
    else if (!boost.productBoutiqueIds.some((id) => offers.some((offer) => String(offer._id) === String(id) && isBoostable(offer)))) {
      end = [BoostStatus.STOPPED, "Plus aucun produit à montrer : rupture ou retrait."];
    }
    if (end) {
      await finishBoost(boost, end[0], end[1], now);
      finished += 1;
    }
  }
  return finished;
};

// ── Diffusion ───────────────────────────────

export type SponsoredSlot = "home" | "search" | "category" | "similar" | "promotions";

/** Places sponsorisées par page, et pour une boutique au plus la moitié. */
export const SLOT_PLACES: Record<SponsoredSlot, number> = { home: 4, search: 2, category: 2, similar: 2, promotions: 4 };

export interface Viewer {
  key: string;
  userId?: string | undefined;
}

export interface SponsoredContext {
  slot: SponsoredSlot;
  viewer: Viewer;
  q?: string | undefined;
  familleId?: string | undefined;
  categoryId?: string | undefined;
  sousCategoryId?: string | undefined;
  /** Fiche produit consultée (« Produits similaires »). */
  offerId?: string | undefined;
}

export interface SponsoredOffer {
  offer: IProductBoutique;
  boost: IBoost;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Part du budget du jour qui peut être dépensée à cette heure. */
export const pacingShare = (now: Date): number => {
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const span = DELIVERY_HOURS.to - DELIVERY_HOURS.from;
  return Math.min(1, Math.max(0.05, (hour - DELIVERY_HOURS.from) / span));
};

/** L'offre est-elle à sa place sur cette page ? Un sponsorisé n'est jamais ajouté hors sujet. */
const relevant = (context: SponsoredContext, offer: IProductBoutique, product: IProduct | undefined, viewed?: IProduct): boolean => {
  switch (context.slot) {
    case "search": {
      if (!context.q?.trim() || !product) return false;
      const pattern = new RegExp(escapeRegex(context.q.trim()), "i");
      return pattern.test(product.name) || pattern.test(product.description ?? "");
    }
    case "category":
      if (!product) return false;
      if (context.sousCategoryId) return String(product.sousCategoryId) === context.sousCategoryId;
      if (context.categoryId) return String(product.categoryId) === context.categoryId;
      if (context.familleId) return String(product.familleId) === context.familleId;
      return false;
    case "similar":
      return !!product && !!viewed && String(offer._id) !== context.offerId && String(product.categoryId) === String(viewed.categoryId);
    case "promotions":
      return !!offer.promo && offer.promo.percent > 0;
    default:
      return true;
  }
};

/** Tirage pondéré, sans remise. */
const weightedPick = <T>(items: { item: T; weight: number }[], count: number, accept: (item: T) => boolean): T[] => {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let draw = Math.random() * total;
    const index = pool.findIndex((entry) => (draw -= entry.weight) <= 0);
    const [entry] = pool.splice(index === -1 ? pool.length - 1 : index, 1);
    if (entry && accept(entry.item)) picked.push(entry.item);
  }
  return picked;
};

/**
 * Offres sponsorisées d'une page, choisies pour ce visiteur : boosts en
 * cours avec du budget pour l'heure, boutique en règle, offre en vente et à
 * sa place, audience qui correspond, 3 affichages par jour au plus. Classées
 * par qualité, puis force de la remise ; chaque affichage est compté (et
 * payé, pour l'objectif « vues »).
 */
export const sponsoredOffers = async (context: SponsoredContext, now = new Date()): Promise<SponsoredOffer[]> => {
  const places = SLOT_PLACES[context.slot];
  const boosts = await Boost.find({
    status: BoostStatus.ACTIVE,
    startDate: { $lte: now },
    endDate: { $gt: now },
    ...(context.slot === "promotions" ? { kind: BoostKind.PROMOTION } : {}),
  });
  if (boosts.length === 0) return [];
  const day = dayOf(now);
  const share = pacingShare(now);

  const [shops, stats, exposures] = await Promise.all([
    Shop.find({ _id: { $in: boosts.map((boost) => boost.boutiqueId) } }),
    BoostStat.find({ boostId: { $in: boosts.map((boost) => boost._id) }, day }),
    BoostExposure.find({ boostId: { $in: boosts.map((boost) => boost._id) }, viewerKey: context.viewer.key, day }),
  ]);
  const totals = await BoostStat.aggregate([
    { $match: { boostId: { $in: boosts.map((boost) => boost._id) } } },
    { $group: { _id: "$boostId", impressions: { $sum: "$impressions" }, visits: { $sum: "$visits" } } },
  ]);

  const open = boosts.filter((boost) => {
    const shop = shops.find((candidate) => String(candidate._id) === String(boost.boutiqueId));
    if (!shop || isShopSuspended(shop, now) || arePromotionsBlocked(shop, now)) return false;
    if (boost.spent >= boost.reserved) return false;
    const spentToday = stats.find((stat) => String(stat.boostId) === String(boost._id))?.spent ?? 0;
    if (spentToday >= boost.dailyBudget * share) return false;
    const seen = exposures.find((exposure) => String(exposure.boostId) === String(boost._id))?.count ?? 0;
    return seen < FREQUENCY_CAP;
  });
  if (open.length === 0) return [];

  const offers = await productBoutique.find({ _id: { $in: open.flatMap((boost) => boost.productBoutiqueIds) }, hiddenAt: null, stock: { $gt: 0 } });
  const viewedOffer = context.offerId && Types.ObjectId.isValid(context.offerId) ? await productBoutique.findById(context.offerId) : null;
  const products = await Product.find({ _id: { $in: [...offers.map((offer) => offer.productId), ...(viewedOffer ? [viewedOffer.productId] : [])] } });
  const viewed = viewedOffer ? products.find((product) => String(product._id) === String(viewedOffer.productId)) : undefined;

  const candidates: { item: SponsoredOffer; weight: number }[] = [];
  for (const boost of open) {
    if (boost.audience.mode === "custom") {
      if (!context.viewer.userId) continue;
      const audience = await cachedAudience(boost, now);
      if (!audience.has(context.viewer.userId)) continue;
    }
    const fitting = offers
      .filter((offer) => boost.productBoutiqueIds.some((id) => String(id) === String(offer._id)))
      .filter((offer) => relevant(context, offer, products.find((product) => String(product._id) === String(offer.productId)), viewed));
    if (fitting.length === 0) continue;
    // Une offre par boost et par page : la plus remisée, sinon la plus vendue.
    const offer = [...fitting].sort((a, b) => (b.promo?.percent ?? 0) - (a.promo?.percent ?? 0) || b.salesCount30d - a.salesCount30d)[0]!;
    const total = totals.find((row) => String(row._id) === String(boost._id));
    const visitRate = ((total?.visits ?? 0) + 1) / ((total?.impressions ?? 0) + 30);
    const quality = visitRate * (1 + (offer.rating ?? 0) / 5);
    const discount = boost.kind === BoostKind.PROMOTION ? 1 + (offer.promo?.percent ?? 0) / 50 : 1;
    candidates.push({ item: { offer, boost }, weight: quality * discount });
  }

  const perShop = new Map<string, number>();
  const maxPerShop = Math.max(1, Math.floor(places / 2));
  const seenOffers = new Set<string>();
  const chosen = weightedPick(candidates, places, ({ offer, boost }) => {
    const shopKey = String(boost.boutiqueId);
    if ((perShop.get(shopKey) ?? 0) >= maxPerShop || seenOffers.has(String(offer._id))) return false;
    perShop.set(shopKey, (perShop.get(shopKey) ?? 0) + 1);
    seenOffers.add(String(offer._id));
    return true;
  });

  // Affichages comptés ; payés pour l'objectif « vues ».
  for (const { boost } of chosen) {
    const exposure = await BoostExposure.findOneAndUpdate(
      { boostId: boost._id, viewerKey: context.viewer.key, day },
      { $inc: { count: 1 } },
      { upsert: true, new: true }
    );
    const firstToday = exposure?.count === 1;
    const cost = boost.goal === BoostGoal.VIEWS ? Math.min(boost.costPerThousandViews / 1000, boost.reserved - boost.spent) : 0;
    await BoostStat.updateOne({ boostId: boost._id, day }, { $inc: { impressions: 1, reach: firstToday ? 1 : 0, spent: cost } }, { upsert: true });
    if (cost > 0) await Boost.updateOne({ _id: boost._id, status: BoostStatus.ACTIVE }, { $inc: { spent: cost } });
  }
  return chosen;
};

/**
 * Visite d'une fiche depuis une place sponsorisée : comptée une fois par
 * visiteur et par jour, payée pour l'objectif « visites ». Les visites de la
 * boutique elle-même, de l'administration et des robots ne comptent pas.
 */
export const recordBoostVisit = async (
  input: { boostId: string; offerId: string; viewer: Viewer; viewerRole?: string | undefined; userAgent?: string | undefined },
  now = new Date()
): Promise<boolean> => {
  if (!Types.ObjectId.isValid(input.boostId) || /bot|crawl|spider|slurp|preview/i.test(input.userAgent ?? "")) return false;
  if (input.viewerRole === EntityType.ADMIN) return false;
  const boost = await Boost.findById(input.boostId);
  if (!boost || boost.status !== BoostStatus.ACTIVE || !boost.productBoutiqueIds.some((id) => String(id) === input.offerId)) return false;
  if (input.viewer.userId) {
    const shop = await Shop.findById(boost.boutiqueId).select("ownerId");
    if (shop && String(shop.ownerId) === input.viewer.userId) return false;
  }
  const day = dayOf(now);
  try {
    await BoostVisit.create({
      boostId: boost._id,
      productBoutiqueId: oid(input.offerId),
      viewerKey: input.viewer.key,
      userId: input.viewer.userId ? oid(input.viewer.userId) : null,
      day,
    });
  } catch {
    return false; // déjà comptée aujourd'hui
  }
  const cost = boost.goal === BoostGoal.VISITS ? Math.min(boost.costPerVisit, Math.max(0, boost.reserved - boost.spent)) : 0;
  await BoostStat.updateOne({ boostId: boost._id, day }, { $inc: { visits: 1, spent: cost } }, { upsert: true });
  if (cost > 0) await Boost.updateOne({ _id: boost._id, status: BoostStatus.ACTIVE }, { $inc: { spent: cost } });
  return true;
};

/** Boost dont une visite, dans les 7 jours, a précédé cet achat. */
export const attributedBoost = async (userId: unknown, offerId: unknown, now = new Date(), session?: ClientSession | null): Promise<Types.ObjectId | null> => {
  const visit = await BoostVisit.findOne({ userId: oid(userId), productBoutiqueId: oid(offerId), createdAt: { $gte: new Date(now.getTime() - ATTRIBUTION_MS) } })
    .sort({ createdAt: -1 })
    .session(session ?? null);
  return (visit?.boostId as Types.ObjectId | undefined) ?? null;
};

/** Après une commande : ventes et chiffre d'affaires de chaque boost qui l'a amenée. */
export const recordBoostSales = async (items: readonly { boostId?: Types.ObjectId | null | undefined; price: number; quantity: number }[], now = new Date()): Promise<void> => {
  const byBoost = new Map<string, number>();
  for (const item of items) {
    if (item.boostId) byBoost.set(String(item.boostId), (byBoost.get(String(item.boostId)) ?? 0) + item.price * item.quantity);
  }
  for (const [boostId, revenue] of byBoost) {
    await BoostStat.updateOne({ boostId: oid(boostId), day: dayOf(now) }, { $inc: { orders: 1, revenue } }, { upsert: true });
  }
};

/** Ajout au panier après une visite du boost. */
export const recordBoostCartAdd = async (userId: unknown, offerId: unknown, now = new Date()): Promise<void> => {
  const boostId = await attributedBoost(userId, offerId, now);
  if (boostId) await BoostStat.updateOne({ boostId, day: dayOf(now) }, { $inc: { carts: 1 } }, { upsert: true });
};

// ── Lecture ─────────────────────────────────

export interface BoostTotals {
  impressions: number;
  reach: number;
  visits: number;
  carts: number;
  orders: number;
  revenue: number;
  spent: number;
}

export const EMPTY_TOTALS: BoostTotals = { impressions: 0, reach: 0, visits: 0, carts: 0, orders: 0, revenue: 0, spent: 0 };

export const boostTotals = async (boostIds: readonly unknown[]): Promise<Map<string, BoostTotals>> => {
  const rows: (BoostTotals & { _id: Types.ObjectId })[] = await BoostStat.aggregate([
    { $match: { boostId: { $in: boostIds.map(oid) } } },
    {
      $group: {
        _id: "$boostId",
        impressions: { $sum: "$impressions" },
        reach: { $sum: "$reach" },
        visits: { $sum: "$visits" },
        carts: { $sum: "$carts" },
        orders: { $sum: "$orders" },
        revenue: { $sum: "$revenue" },
        spent: { $sum: "$spent" },
      },
    },
  ]);
  return new Map(rows.map(({ _id, ...totals }) => [String(_id), totals]));
};
