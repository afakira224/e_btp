import type { ProductBoutique } from "../../../entities/product";
import type { Shop } from "../../../entities/shop";
import { ApiError } from "../ApiError";
import type { ApiResponse } from "../httpClient";
import { allShops, findLiveOffer, liveCatalog, publicCatalog } from "./liveCatalog";
import {
  availablePromotionActions,
  checkPromotionAction,
  checkShopPromotionInput,
  isPromotionAction,
  PROMO_LIMITS,
  PROMOTION_STATUS_LABELS,
  PROMOTION_TABS,
  PROMOTION_TYPE_LABELS,
  statusAt,
  type PromotionAction,
  type PromotionTab,
} from "./marketingRules";
import { evaluateCoupon, livePromo, ruleOf, targetsOffer } from "./marketingPricing";
import { dayKey, NO_END, type MockBoost, type MockPromotion } from "./marketingSeed";
import { objectId, readDb, writeDb, type MockDb } from "./mockDb";

// ─────────────────────────────────────────────
//  Promotions de boutique, campagnes, produits phares, boosts et crédits —
//  portage de Back/src/shared/services/{promotion,boost}.service.ts et des
//  contrôleurs qui les servent. Mêmes réponses, mêmes messages.
// ─────────────────────────────────────────────

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;

const ok = <T>(data: T, message: string, statusCode = 200): ApiResponse<T> => ({ success: true, message, statusCode, data });

const sessionUser = (db: MockDb) => {
  const user = db.users.find((candidate) => candidate._id === db.sessionUserId);
  if (!user) throw new ApiError("Session absente ou expirée, veuillez vous connecter.", 401);
  return user;
};

/** La boutique, si le compte connecté la gère (son gérant, ou l'administration). */
const managedShop = (db: MockDb, shopId: string): Shop => {
  const user = sessionUser(db);
  if (user.role !== "shop" && user.role !== "admin") throw new ApiError("Accès refusé, vous n'avez pas les permissions nécessaires", 403);
  const shop = allShops().find((candidate) => candidate.id === shopId);
  if (!shop) throw new ApiError("Boutique introuvable.", 404);
  if (user.role !== "admin" && shop.ownerId !== user._id) throw new ApiError("Vous ne pouvez gérer que vos propres boutiques.", 403);
  return shop;
};

const suspendedUntil = (db: MockDb, shopId: string, now: Date) => {
  const until = db.moderation.suspendedShops[shopId];
  return until && new Date(until) > now ? until : null;
};
const promotionsBlockedUntil = (db: MockDb, shopId: string, now: Date) => {
  const until = db.moderation.promotionsBlocked?.[shopId];
  return until && new Date(until) > now ? until : null;
};

const RUNNING = ["scheduled", "active", "paused"];

/** Plafonds et ancienneté (commandes livrées : historique de démonstration compris). */
const contextOf = (db: MockDb, shop: Shop, now: Date, exceptId?: string) => {
  const mine = db.marketing.promotions.filter((promo) => promo.boutiqueId === shop.id && promo.id !== exceptId);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const delivered = db.shopOrders.filter((part) => part.boutiqueId === shop.id && (part.status === "delivered" || part.status === "completed")).length;
  return {
    running: mine.filter((promo) => RUNNING.includes(promo.status) && promo.type !== "quantity_tiers").length,
    activeCodes: mine.filter((promo) => RUNNING.includes(promo.status) && promo.type === "coupon").length,
    flashThisMonth: mine.filter((promo) => promo.type === "flash_sale" && promo.status !== "draft" && new Date(promo.startDate) >= monthStart).length,
    shopAgeDays: Math.floor((now.getTime() - new Date(shop.createdAt).getTime()) / DAY),
    deliveredOrders: delivered + (db.marketing.pastDelivered[shop.id] ?? 0),
  };
};

// ── Promotions de boutique ──────────────────

interface PromotionBody {
  type?: string;
  nom?: string;
  description?: string;
  discountType?: "percentage" | "fixed";
  discountValue?: number;
  startDate?: string;
  endDate?: string;
  productBoutiqueIds?: string[];
  familleIds?: string[];
  categoryIds?: string[];
  excludedOfferIds?: string[];
  code?: string;
  minAmount?: number;
  maxDiscount?: number;
  usageLimit?: number;
  perCustomerLimit?: number;
  stackable?: boolean;
  tiers?: { minQuantity: number; discountValue: number }[];
  flashQuantity?: number;
  confirmHighDiscount?: boolean;
  launch?: "now" | "schedule" | "draft";
}

const offerSummary = (ids: readonly string[]) => {
  const catalog = liveCatalog();
  return ids.flatMap((id) => {
    const offer = catalog.find((candidate) => candidate.id === id);
    return offer ? [{ id, name: offer.product?.name ?? "Produit", price: offer.price, ...(offer.urlImages[0] ? { image: offer.urlImages[0] } : {}) }] : [];
  });
};

const statsOf = (db: MockDb, promo: MockPromotion) => {
  const counted = db.orders.filter((order) => order.status !== "cancelled" && order.status !== "payment_failed");
  if (promo.type === "coupon") {
    const orders = counted.filter((order) => order.promotionCode === promo.code);
    return { orders: orders.length, units: 0, revenue: orders.reduce((sum, order) => sum + order.amount, 0), discount: orders.reduce((sum, order) => sum + order.discountAmount, 0) };
  }
  let units = 0;
  let revenue = 0;
  let discount = 0;
  let orders = 0;
  for (const order of counted) {
    const lines = order.items.filter((item) => item.promotionId === promo.id);
    if (lines.length === 0) continue;
    orders += 1;
    for (const line of lines) {
      units += line.quantity;
      revenue += line.price * line.quantity;
      discount += ((line.basePrice ?? line.price) - line.price) * line.quantity;
    }
  }
  return { orders, units, revenue, discount };
};

export const toShopPromotion = (db: MockDb, promo: MockPromotion, now = new Date()) => {
  const status = statusAt(ruleOf(promo), now);
  return {
    id: promo.id,
    boutiqueId: promo.boutiqueId ?? "",
    type: promo.type,
    typeLabel: PROMOTION_TYPE_LABELS[promo.type],
    nom: promo.nom,
    ...(promo.description ? { description: promo.description } : {}),
    status,
    statusLabel: PROMOTION_STATUS_LABELS[status],
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    startDate: promo.startDate,
    endDate: promo.endDate >= NO_END ? null : promo.endDate,
    productBoutiqueIds: promo.productBoutiqueIds,
    offers: offerSummary(promo.productBoutiqueIds),
    ...(promo.target ? { target: promo.target } : {}),
    code: promo.code,
    minAmount: promo.minAmount,
    maxDiscount: promo.maxDiscount,
    usageLimit: promo.usageLimit,
    usedCount: promo.usedCount,
    perCustomerLimit: promo.perCustomerLimit,
    stackable: promo.stackable,
    tiers: promo.tiers,
    flashQuantity: promo.flashQuantity,
    flashSold: promo.flashSold,
    campaignId: promo.campaignId,
    stopReason: promo.stopReason,
    availableActions: availablePromotionActions(ruleOf(promo), now),
    stats: statsOf(db, promo),
    createdAt: promo.createdAt,
    updatedAt: promo.updatedAt,
  };
};

/** Le planificateur, à la lecture : une promotion programmée démarre, une échue se termine. */
const refreshStatuses = (db: MockDb, now: Date): boolean => {
  let changed = false;
  for (const promo of db.marketing.promotions) {
    if (!promo.boutiqueId) continue;
    // Comme runPromotionTick : une promotion en pause dont la fin est passée se termine aussi.
    const next = promo.status === "paused" && new Date(promo.endDate) < now ? "ended" : statusAt(ruleOf(promo), now);
    if ((promo.status === "scheduled" || promo.status === "active" || promo.status === "paused") && next !== promo.status) {
      promo.status = next;
      promo.updatedAt = now.toISOString();
      changed = true;
    }
  }
  return changed;
};

const TAB_SORT: Record<PromotionTab, (a: MockPromotion, b: MockPromotion) => number> = {
  active: (a, b) => a.endDate.localeCompare(b.endDate),
  scheduled: (a, b) => a.startDate.localeCompare(b.startDate),
  ended: (a, b) => b.endDate.localeCompare(a.endDate),
};

export const listShopPromotions = (shopId: string, params: URLSearchParams) => {
  const db = readDb();
  const now = new Date();
  managedShop(db, shopId);
  if (refreshStatuses(db, now)) writeDb(db);
  const raw = params.get("tab") ?? "active";
  const tab = (raw in PROMOTION_TABS ? raw : "active") as PromotionTab;
  const mine = db.marketing.promotions.filter((promo) => promo.boutiqueId === shopId);
  const inTab = (key: PromotionTab) => mine.filter((promo) => (PROMOTION_TABS[key] as readonly string[]).includes(promo.status));
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const limit = Math.max(1, Math.min(50, Number(params.get("limit") ?? 20) || 20));
  const items = inTab(tab).sort(TAB_SORT[tab]);
  return ok(
    {
      promotions: items.slice((page - 1) * limit, page * limit).map((promo) => toShopPromotion(db, promo, now)),
      total: items.length,
      page,
      totalPages: Math.ceil(items.length / limit),
      counts: { active: inTab("active").length, scheduled: inTab("scheduled").length, ended: inTab("ended").length },
      promotionsBlockedUntil: promotionsBlockedUntil(db, shopId, now),
    },
    "Promotions de la boutique récupérées avec succès"
  );
};

const datesOf = (body: PromotionBody, now: Date) => {
  const start = body.launch === "now" || !body.startDate ? now : new Date(body.startDate);
  const end = body.type === "quantity_tiers" ? new Date(NO_END) : body.endDate ? new Date(body.endDate) : undefined;
  return { start, end };
};

const checkLaunchable = (db: MockDb, shop: Shop, body: PromotionBody, start: Date, end: Date | undefined, now: Date, exceptId?: string) => {
  const blocked = promotionsBlockedUntil(db, shop.id, now);
  if (blocked) throw new ApiError(`Les promotions de cette boutique sont suspendues jusqu'au ${new Date(blocked).toLocaleDateString("fr-FR")}.`, 403);
  const refusal = checkShopPromotionInput(
    {
      type: body.type as MockPromotion["type"],
      nom: body.nom ?? "",
      discountType: body.discountType,
      discountValue: body.discountValue,
      startDate: start,
      endDate: end,
      productBoutiqueIds: body.productBoutiqueIds,
      code: body.code?.trim().toUpperCase(),
      minAmount: body.minAmount,
      maxDiscount: body.maxDiscount,
      usageLimit: body.usageLimit,
      tiers: body.tiers,
      flashQuantity: body.flashQuantity,
      confirmHighDiscount: body.confirmHighDiscount,
    },
    contextOf(db, shop, now, exceptId),
    now
  );
  if (refusal) throw new ApiError(refusal, 400);
  const ids = [...(body.productBoutiqueIds ?? []), ...(body.excludedOfferIds ?? [])];
  const catalog = liveCatalog();
  for (const id of ids) {
    const offer = catalog.find((candidate) => candidate.id === id);
    if (!offer) throw new ApiError("Une offre est introuvable.", 404);
    if (offer.boutique?.id !== shop.id) throw new ApiError("Une promotion ne porte que sur les offres de sa boutique.", 403);
    if (offer.hidden) throw new ApiError("Une offre masquée par la modération ne peut pas être en promotion.", 400);
  }
  if (body.type === "flash_sale") {
    const since = now.getTime() - PROMO_LIMITS.flashCooldownDays * DAY;
    const recent = db.marketing.promotions.find(
      (promo) =>
        promo.id !== exceptId &&
        promo.type === "flash_sale" &&
        promo.status !== "draft" &&
        new Date(promo.endDate).getTime() >= since &&
        promo.productBoutiqueIds.some((id) => body.productBoutiqueIds?.includes(id))
    );
    if (recent) throw new ApiError(`Une offre ne repasse pas en vente flash moins de ${PROMO_LIMITS.flashCooldownDays} jours après la précédente.`, 400);
  }
  if (body.type === "coupon") {
    const code = body.code!.trim().toUpperCase();
    if (db.marketing.promotions.some((promo) => promo.code === code && promo.id !== exceptId)) {
      throw new ApiError("Ce code est déjà pris : choisissez-en un autre.", 409);
    }
  }
};

const fieldsOf = (body: PromotionBody, start: Date, end: Date) => ({
  type: body.type as MockPromotion["type"],
  nom: (body.nom ?? "").trim(),
  description: body.description?.trim() || undefined,
  scope: (body.type === "coupon" || body.type === "free_shipping" ? "cart" : "product_boutique") as MockPromotion["scope"],
  discountType: body.type === "coupon" ? (body.discountType ?? "percentage") : ("percentage" as const),
  discountValue: body.type === "quantity_tiers" || body.type === "free_shipping" ? 0 : (body.discountValue ?? 0),
  code: body.type === "coupon" ? body.code!.trim().toUpperCase() : null,
  startDate: start.toISOString(),
  endDate: end.toISOString(),
  productBoutiqueIds: ["product_discount", "flash_sale", "quantity_tiers"].includes(body.type ?? "") ? (body.productBoutiqueIds ?? []) : [],
  ...(body.type === "shop_discount"
    ? { target: { familleIds: body.familleIds ?? [], categoryIds: body.categoryIds ?? [], excludedOfferIds: body.excludedOfferIds ?? [] } }
    : {}),
  minAmount: body.minAmount ?? 0,
  maxDiscount: body.maxDiscount ?? null,
  usageLimit: body.usageLimit ?? null,
  perCustomerLimit: body.type === "coupon" ? (body.perCustomerLimit ?? 1) : null,
  stackable: body.stackable ?? true,
  tiers: body.type === "quantity_tiers" ? [...(body.tiers ?? [])].sort((a, b) => a.minQuantity - b.minQuantity) : [],
  flashQuantity: body.type === "flash_sale" ? (body.flashQuantity ?? null) : null,
  highDiscountConfirmed: !!body.confirmHighDiscount,
});

const formErrors = (body: PromotionBody): string[] => {
  const errors: string[] = [];
  if (!["product_discount", "shop_discount", "coupon", "flash_sale", "quantity_tiers", "free_shipping"].includes(body.type ?? "")) {
    errors.push("Type invalide. Valeurs acceptées : product_discount, shop_discount, coupon, flash_sale, quantity_tiers, free_shipping.");
  }
  if (!body.nom || body.nom.trim().length < 2 || body.nom.trim().length > 80) errors.push("Le nom fait de 2 à 80 caractères.");
  return errors;
};

export const createShopPromotion = (shopId: string, body: PromotionBody) => {
  const errors = formErrors(body);
  if (errors.length > 0) throw new ApiError(errors.join(" | "), 422);
  const db = readDb();
  const now = new Date();
  const shop = managedShop(db, shopId);
  const { start, end } = datesOf(body, now);
  const draft = body.launch === "draft";
  if (!draft && suspendedUntil(db, shopId, now)) {
    throw new ApiError("Votre boutique est suspendue : préparez la promotion en brouillon, elle se lancera après.", 400);
  }
  checkLaunchable(db, shop, body, start, end, now);
  const stamp = now.toISOString();
  const promo: MockPromotion = {
    id: objectId(),
    boutiqueId: shop.id,
    status: draft ? "draft" : start <= now ? "active" : "scheduled",
    ...fieldsOf(body, start, end ?? new Date(NO_END)),
    usedCount: 0,
    flashSold: 0,
    campaignId: null,
    actif: true,
    stoppedAt: null,
    stopReason: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  db.marketing.promotions.push(promo);
  writeDb(db);
  const message = promo.status === "draft" ? "Brouillon enregistré." : promo.status === "active" ? "Promotion lancée : elle est en ligne." : "Promotion programmée.";
  return ok(toShopPromotion(db, promo, now), message, 201);
};

const managedPromotion = (db: MockDb, promotionId: string) => {
  const promo = db.marketing.promotions.find((candidate) => candidate.id === promotionId);
  if (!promo || !promo.boutiqueId) throw new ApiError("Promotion introuvable.", 404);
  const shop = managedShop(db, promo.boutiqueId);
  return { promo, shop };
};

export const getShopPromotion = (shopId: string, promotionId: string) => {
  const db = readDb();
  const { promo } = managedPromotion(db, promotionId);
  if (promo.boutiqueId !== shopId) throw new ApiError("Promotion introuvable.", 404);
  return ok(toShopPromotion(db, promo), "Promotion récupérée avec succès");
};

export const updateShopPromotion = (shopId: string, promotionId: string, body: PromotionBody) => {
  const errors = formErrors(body);
  if (errors.length > 0) throw new ApiError(errors.join(" | "), 422);
  const db = readDb();
  const now = new Date();
  const { promo, shop } = managedPromotion(db, promotionId);
  if (promo.boutiqueId !== shopId) throw new ApiError("Promotion introuvable.", 404);
  const status = statusAt(ruleOf(promo), now);
  if (status !== "draft" && status !== "scheduled") throw new ApiError("Une promotion commencée ne se modifie plus : prolongez-la ou arrêtez-la.", 400);
  if (body.type !== promo.type) throw new ApiError("Le type d'une promotion ne change pas : créez-en une autre.", 400);
  const { start, end } = datesOf(body, now);
  if (status === "scheduled" && start <= now && suspendedUntil(db, shop.id, now)) {
    throw new ApiError("Votre boutique est suspendue : la promotion se lancera après la suspension.", 400);
  }
  checkLaunchable(db, shop, body, start, end, now, promo.id);
  Object.assign(promo, fieldsOf(body, start, end ?? new Date(NO_END)), { updatedAt: now.toISOString() });
  if (status === "scheduled") promo.status = start <= now ? "active" : "scheduled";
  writeDb(db);
  return ok(toShopPromotion(db, promo, now), "Promotion modifiée.");
};

const ACTION_MESSAGES: Record<PromotionAction, string> = {
  launch: "Promotion lancée.",
  pause: "Promotion en pause : les prix reviennent à la normale.",
  resume: "Promotion reprise.",
  extend: "Promotion prolongée.",
  stop: "Promotion arrêtée.",
};

export const promotionAction = (promotionId: string, action: string, body: { endDate?: string; now?: boolean } = {}) => {
  if (!isPromotionAction(action)) throw new ApiError("Action inconnue.", 404);
  const db = readDb();
  const now = new Date();
  const { promo, shop } = managedPromotion(db, promotionId);
  const endDate = body.endDate ? new Date(body.endDate) : undefined;
  const refusal = checkPromotionAction(action, ruleOf(promo), { endDate }, now);
  if (refusal) throw new ApiError(refusal, 400);
  switch (action) {
    case "launch": {
      if (suspendedUntil(db, shop.id, now)) throw new ApiError("Votre boutique est suspendue : la promotion se lancera après la suspension.", 400);
      const start = body.now || new Date(promo.startDate) <= now ? now : new Date(promo.startDate);
      const end = promo.type === "quantity_tiers" ? new Date(NO_END) : new Date(start.getTime() + (new Date(promo.endDate).getTime() - new Date(promo.startDate).getTime()));
      checkLaunchable(
        db,
        shop,
        {
          type: promo.type,
          nom: promo.nom,
          discountType: promo.discountType,
          discountValue: promo.discountValue,
          productBoutiqueIds: promo.productBoutiqueIds,
          minAmount: promo.minAmount,
          tiers: promo.tiers,
          ...(promo.code ? { code: promo.code } : {}),
          ...(promo.maxDiscount != null ? { maxDiscount: promo.maxDiscount } : {}),
          ...(promo.usageLimit != null ? { usageLimit: promo.usageLimit } : {}),
          ...(promo.flashQuantity != null ? { flashQuantity: promo.flashQuantity } : {}),
          ...(promo.target ? { excludedOfferIds: promo.target.excludedOfferIds } : {}),
          confirmHighDiscount: promo.highDiscountConfirmed,
        },
        start,
        end,
        now,
        promo.id
      );
      promo.startDate = start.toISOString();
      promo.endDate = end.toISOString();
      promo.status = start <= now ? "active" : "scheduled";
      break;
    }
    case "pause":
      promo.status = "paused";
      break;
    case "resume":
      if (promotionsBlockedUntil(db, shop.id, now)) throw new ApiError("Les promotions de cette boutique sont suspendues par la modération.", 403);
      if (new Date(promo.startDate) <= now && suspendedUntil(db, shop.id, now)) {
        throw new ApiError("Votre boutique est suspendue : la promotion reprendra après la suspension.", 400);
      }
      promo.status = new Date(promo.startDate) > now ? "scheduled" : "active";
      break;
    case "extend":
      promo.endDate = endDate!.toISOString();
      break;
    case "stop":
      promo.status = "stopped";
      promo.stoppedAt = now.toISOString();
      promo.stopReason = "Arrêtée par la boutique.";
      break;
  }
  promo.updatedAt = now.toISOString();
  writeDb(db);
  const message = action === "launch" && promo.status === "scheduled" ? "Promotion programmée." : ACTION_MESSAGES[action];
  return ok(toShopPromotion(db, promo, now), message);
};

// ── Produits phares ─────────────────────────

export const setFeatured = (offerId: string, body: { rank?: number | null }) => {
  const rank = body.rank === null || body.rank === undefined ? null : Number(body.rank);
  if (rank !== null && (!Number.isInteger(rank) || rank < 1 || rank > 6)) throw new ApiError("Rang de 1 à 6, ou null pour retirer le produit.", 422);
  const db = readDb();
  const offer = findLiveOffer(offerId);
  if (!offer || !offer.boutique) throw new ApiError("Produit en boutique non trouvé", 404);
  managedShop(db, offer.boutique.id);
  if (rank !== null && offer.hidden) throw new ApiError("Une offre masquée ne peut pas être un produit phare.", 400);
  const list = (db.marketing.featured[offer.boutique.id] ?? []).filter((id) => id !== offerId);
  if (rank !== null) list.splice(rank - 1, 0, offerId);
  db.marketing.featured[offer.boutique.id] = list.slice(0, 6);
  writeDb(db);
  return ok(findLiveOffer(offerId), rank === null ? "Produit retiré des produits phares" : `Produit phare n° ${rank}`);
};

// ── Campagnes ───────────────────────────────

const campaignState = (campaign: { actif: boolean; startDate: string; endDate: string }, now: Date) =>
  !campaign.actif || now > new Date(campaign.endDate) ? "ended" : now < new Date(campaign.startDate) ? "upcoming" : "running";

/**
 * Offres inscrites à une campagne : celles d'une remise de la campagne en
 * cours, même quand une autre remise (une vente flash plus forte) fixe leur
 * prix du moment.
 */
export const campaignOfferIds = (db: MockDb, campaignId: string, now = new Date()): Set<string> =>
  new Set(db.marketing.promotions.filter((promo) => promo.campaignId === campaignId && livePromo(promo, now)).flatMap((promo) => promo.productBoutiqueIds));

const toCampaign = (db: MockDb, campaign: MockDb["marketing"]["campaigns"][number], now = new Date()) => {
  const ids = campaignOfferIds(db, campaign.id, now);
  return { ...campaign, state: campaignState(campaign, now), offerCount: publicCatalog().filter((offer) => ids.has(offer.id)).length };
};

export const listCampaigns = (params: URLSearchParams) => {
  const db = readDb();
  const now = new Date();
  const user = db.users.find((candidate) => candidate._id === db.sessionUserId);
  const all = user?.role === "admin" && params.get("all") === "true";
  const items = db.marketing.campaigns
    .filter((campaign) => all || (campaign.actif && new Date(campaign.endDate) >= now))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return ok(items.map((campaign) => toCampaign(db, campaign, now)), "Campagnes récupérées avec succès");
};

export const getCampaign = (slug: string) => {
  const db = readDb();
  const campaign = db.marketing.campaigns.find((candidate) => candidate.slug === slug || candidate.id === slug);
  if (!campaign) throw new ApiError("Campagne introuvable.", 404);
  const ids = campaignOfferIds(db, campaign.id);
  const offers = publicCatalog()
    .filter((offer) => ids.has(offer.id) && offer.stock > 0)
    .sort((a, b) => (b.pricing?.percent ?? 0) - (a.pricing?.percent ?? 0));
  return ok({ ...toCampaign(db, campaign), offers }, "Campagne récupérée avec succès");
};

const requireAdmin = (db: MockDb) => {
  const user = sessionUser(db);
  if (user.role !== "admin") throw new ApiError("Accès refusé, vous n'avez pas les permissions nécessaires", 403);
  return user;
};

const checkCampaign = (input: { startDate: Date; endDate: Date; minDiscount: number }) => {
  if (Number.isNaN(input.startDate.getTime()) || Number.isNaN(input.endDate.getTime())) return "Dates invalides.";
  if (input.endDate <= input.startDate) return "La fin vient après le début.";
  if (input.endDate.getTime() - input.startDate.getTime() > 30 * DAY) return "Une campagne dure 30 jours au plus.";
  if (input.minDiscount < 5 || input.minDiscount > 70) return "La remise minimale va de 5 à 70 %.";
  return null;
};

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

export const createCampaign = (body: { nom?: string; description?: string; startDate?: string; endDate?: string; minDiscount?: number; familleIds?: string[] }) => {
  const db = readDb();
  requireAdmin(db);
  if (!body.nom || body.nom.trim().length < 2) throw new ApiError("Le nom fait de 2 à 80 caractères.", 422);
  const startDate = new Date(body.startDate ?? "");
  const endDate = new Date(body.endDate ?? "");
  const minDiscount = Number(body.minDiscount);
  const refusal = checkCampaign({ startDate, endDate, minDiscount });
  if (refusal) throw new ApiError(refusal, 400);
  const slug = slugify(body.nom);
  if (db.marketing.campaigns.some((campaign) => campaign.slug === slug)) throw new ApiError("Une campagne porte déjà ce nom : choisissez-en un autre.", 409);
  const campaign = {
    id: objectId(),
    slug,
    nom: body.nom.trim(),
    ...(body.description?.trim() ? { description: body.description.trim() } : {}),
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    minDiscount,
    familleIds: body.familleIds ?? [],
    image: null,
    actif: true,
    createdAt: new Date().toISOString(),
  };
  db.marketing.campaigns.push(campaign);
  writeDb(db);
  return ok(toCampaign(db, campaign), "Campagne créée.", 201);
};

export const updateCampaign = (id: string, body: { nom?: string; description?: string; startDate?: string; endDate?: string; minDiscount?: number; actif?: boolean }) => {
  const db = readDb();
  requireAdmin(db);
  const campaign = db.marketing.campaigns.find((candidate) => candidate.id === id);
  if (!campaign) throw new ApiError("Campagne introuvable.", 404);
  const next = {
    ...campaign,
    ...(body.nom !== undefined ? { nom: body.nom.trim() } : {}),
    ...(body.description !== undefined ? { description: body.description.trim() } : {}),
    ...(body.startDate !== undefined ? { startDate: new Date(body.startDate).toISOString() } : {}),
    ...(body.endDate !== undefined ? { endDate: new Date(body.endDate).toISOString() } : {}),
    ...(body.minDiscount !== undefined ? { minDiscount: Number(body.minDiscount) } : {}),
    ...(body.actif !== undefined ? { actif: !!body.actif } : {}),
  };
  const refusal = checkCampaign({ startDate: new Date(next.startDate), endDate: new Date(next.endDate), minDiscount: next.minDiscount });
  if (refusal) throw new ApiError(refusal, 400);
  Object.assign(campaign, next);
  // Comme syncCampaignPromotions : les promotions inscrites suivent la campagne.
  const now = new Date();
  const closed = campaignState(campaign, now) === "ended";
  for (const promo of db.marketing.promotions) {
    if (promo.campaignId !== campaign.id || !["scheduled", "active", "paused"].includes(promo.status)) continue;
    if (closed) {
      Object.assign(promo, { status: "stopped", stoppedAt: now.toISOString(), stopReason: "La campagne de la plateforme est terminée." });
    } else {
      promo.endDate = campaign.endDate;
      if (new Date(campaign.startDate) > now) {
        promo.startDate = campaign.startDate;
        if (promo.status === "active") promo.status = "scheduled";
      } else if (promo.status === "scheduled") {
        Object.assign(promo, { startDate: now.toISOString(), status: "active" });
      }
    }
    promo.updatedAt = now.toISOString();
  }
  writeDb(db);
  return ok(toCampaign(db, campaign), "Campagne modifiée.");
};

export const joinCampaign = (id: string, body: { boutiqueId?: string; productBoutiqueIds?: string[]; discountValue?: number; confirmHighDiscount?: boolean }) => {
  const db = readDb();
  const now = new Date();
  const campaign = db.marketing.campaigns.find((candidate) => candidate.id === id);
  if (!campaign) throw new ApiError("Campagne introuvable.", 404);
  if (campaignState(campaign, now) === "ended") throw new ApiError("Cette campagne est terminée.", 400);
  const discount = Number(body.discountValue);
  if (!(discount >= campaign.minDiscount)) throw new ApiError(`Cette campagne demande une remise de ${campaign.minDiscount} % au moins.`, 400);
  const ids = body.productBoutiqueIds ?? [];
  if (campaign.familleIds.length > 0) {
    const catalog = liveCatalog();
    const outside = ids.some((offerId) => !campaign.familleIds.includes(catalog.find((offer) => offer.id === offerId)?.product?.familles[0]?.id ?? ""));
    if (outside) throw new ApiError("Une offre n'appartient pas aux familles de la campagne.", 400);
  }
  const start = new Date(campaign.startDate) > now ? new Date(campaign.startDate) : now;
  const response = createShopPromotion(String(body.boutiqueId), {
    type: "product_discount",
    nom: `${campaign.nom} — −${discount} %`,
    discountValue: discount,
    productBoutiqueIds: ids,
    startDate: start.toISOString(),
    endDate: campaign.endDate,
    launch: start <= now ? "now" : "schedule",
    confirmHighDiscount: body.confirmHighDiscount,
  });
  const fresh = readDb();
  const promo = fresh.marketing.promotions.find((candidate) => candidate.id === response.data?.id)!;
  promo.campaignId = campaign.id;
  writeDb(fresh);
  return ok(toShopPromotion(fresh, promo, now), "Offres inscrites à la campagne.", 201);
};

// ── Promotions de la plateforme : lecture publique ──

export const listPlatformPromotions = () => {
  const db = readDb();
  const now = new Date();
  return ok(
    db.marketing.promotions.filter((promo) => !promo.boutiqueId && livePromo(promo, now)).map((promo) => ({
      id: promo.id,
      nom: promo.nom,
      description: promo.description,
      type: promo.type,
      scope: promo.scope,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      code: promo.code,
      startDate: promo.startDate,
      endDate: promo.endDate,
      productBoutiqueIds: promo.productBoutiqueIds,
      minAmount: promo.minAmount,
      maxDiscount: promo.maxDiscount,
      actif: promo.actif,
      isActive: true,
    })),
    "Promotions récupérées avec succès"
  );
};

/** Ventes flash en cours : de la plateforme et des boutiques, la plus proche de sa fin d'abord. */
export const listActiveFlashSales = () => {
  const db = readDb();
  const now = new Date();
  const shops = allShops();
  const active = db.marketing.promotions
    .filter((promo) => promo.type === "flash_sale" && livePromo(promo, now))
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .map((promo) => {
      const shop = shops.find((candidate) => candidate.id === promo.boutiqueId);
      return {
        id: promo.id,
        nom: promo.nom,
        description: promo.description,
        type: promo.type,
        scope: promo.scope,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        code: null,
        startDate: promo.startDate,
        endDate: promo.endDate,
        productBoutiqueIds: promo.productBoutiqueIds,
        actif: true,
        isActive: true,
        ...(shop ? { boutique: { id: shop.id, nom: shop.nom } } : {}),
        ...(promo.flashQuantity != null ? { flashLeft: Math.max(0, promo.flashQuantity - promo.flashSold) } : {}),
      };
    });
  return ok(active, "Ventes flash actives récupérées avec succès");
};

/** POST /promotions/apply : aperçu d'un code sur le panier, aux prix du moment. */
export const applyCoupon = (body: { userId?: string; code?: string }) => {
  const db = readDb();
  const user = sessionUser(db);
  if (body.userId !== user._id) throw new ApiError("Vous ne pouvez accéder qu'à vos propres données.", 403);
  const code = String(body.code ?? "").trim().toUpperCase();
  const promo = db.marketing.promotions.find((candidate) => candidate.code === code);
  if (!promo) throw new ApiError("Coupon introuvable", 404);
  const cart = db.carts.find((entry) => entry.userId === user._id);
  if (!cart || cart.items.length === 0) throw new ApiError("Le panier est vide.", 400);
  const lines = cart.items.flatMap((item) => {
    const offer = findLiveOffer(item.productBoutiqueId);
    if (!offer?.boutique) return [];
    const price = unitPrice(offer, item.quantity);
    return [{ offerId: offer.id, boutiqueId: offer.boutique.id, price, quantity: item.quantity, promoted: price < offer.price }];
  });
  const result = evaluateCoupon(promo, lines);
  if (result.error) throw new ApiError(result.error, 400);
  if (promo.perCustomerLimit != null && usedCode(db, user._id, code) >= promo.perCustomerLimit) {
    throw new ApiError(promo.perCustomerLimit === 1 ? "Vous avez déjà utilisé ce code." : `Ce code s'utilise ${promo.perCustomerLimit} fois par client.`, 400);
  }
  const totalBefore = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const shop = result.boutiqueId ? allShops().find((candidate) => candidate.id === result.boutiqueId) : undefined;
  return ok(
    {
      promotion: { id: promo.id, nom: promo.nom, type: promo.type, scope: promo.scope, discountType: promo.discountType, discountValue: promo.discountValue, code: promo.code, startDate: promo.startDate, endDate: promo.endDate, productBoutiqueIds: promo.productBoutiqueIds, actif: true, isActive: true },
      totalBefore,
      discountAmount: result.discount,
      totalAfter: Math.max(0, totalBefore - result.discount),
      ...(shop ? { boutique: { id: shop.id, nom: shop.nom } } : {}),
    },
    "Coupon appliqué avec succès"
  );
};

/** Utilisations d'un code par un client (commandes annulées ou non payées exclues). */
export const usedCode = (db: MockDb, userId: string, code: string) =>
  db.orders.filter((order) => order.userId === userId && order.promotionCode === code && order.status !== "cancelled" && order.status !== "payment_failed").length;

/** Prix d'une unité pour une quantité, palier compris. */
export const unitPrice = (offer: ProductBoutique, quantity: number): number =>
  (offer.pricing?.tiers ?? []).filter((tier) => quantity >= tier.minQuantity).reduce((lowest, tier) => Math.min(lowest, tier.unitPrice), offer.pricing?.price ?? offer.price);

// ── Boosts ──────────────────────────────────

const MAX_BOOST_DAYS = 30;
const FREQUENCY_CAP = 3;
const SLOT_PLACES = { home: 4, search: 2, category: 2, similar: 2, promotions: 4 } as const;
type Slot = keyof typeof SLOT_PLACES;

const minDailyBudget = (db: MockDb) => db.marketing.settings.costPerVisit * db.marketing.settings.minVisitsPerDay;

const moveCredits = (db: MockDb, shopId: string, delta: number, reason: "recharge" | "monthly_grant" | "boost_reserve" | "boost_refund", label: string, ref: string | null) => {
  const amount = Math.round(delta);
  const balance = db.marketing.credits[shopId] ?? 0;
  if (amount < 0 && balance < -amount) throw new ApiError("Crédits insuffisants : rechargez votre portefeuille.", 400);
  db.marketing.credits[shopId] = balance + amount;
  db.marketing.ledger.push({ id: objectId(), shopId, delta: amount, balanceAfter: balance + amount, reason, label, ref, createdAt: new Date().toISOString() });
};

/** Le 1er du mois, chaque boutique reçoit ses crédits offerts, une fois. */
const grantMonthlyCredits = (db: MockDb, now: Date): boolean => {
  const month = now.toISOString().slice(0, 7);
  let changed = false;
  for (const shop of allShops()) {
    if (db.marketing.grantedMonths[shop.id] === month || db.marketing.settings.monthlyCredits <= 0) continue;
    moveCredits(db, shop.id, db.marketing.settings.monthlyCredits, "monthly_grant", `Crédits offerts — ${month}`, month);
    db.marketing.grantedMonths[shop.id] = month;
    changed = true;
  }
  return changed;
};

const finishBoost = (db: MockDb, boost: MockBoost, status: "ended" | "stopped", reason: string, now: Date) => {
  if (boost.status === "ended" || boost.status === "stopped") return;
  const refund = Math.max(0, Math.round(boost.reserved - boost.spent));
  Object.assign(boost, { status, stopReason: reason, endedAt: now.toISOString(), refunded: refund });
  if (refund > 0) moveCredits(db, boost.boutiqueId, refund, "boost_refund", "Budget de boost non dépensé", boost.id);
};

// Le back exige aussi une photo ; les offres du jeu simulé n'en ont pas.
const isBoostable = (offer: ProductBoutique | undefined) => !!offer && offer.stock > 0 && !offer.hidden;

/** Les arrêts automatiques (durée, budget, promotion finie, suspension, rupture), à la lecture. */
const boostTick = (db: MockDb, now: Date): boolean => {
  let changed = grantMonthlyCredits(db, now);
  const catalog = liveCatalog();
  for (const boost of db.marketing.boosts) {
    if (boost.status !== "active" && boost.status !== "paused") continue;
    const promo = db.marketing.promotions.find((candidate) => candidate.id === boost.promotionId);
    const promoStatus = promo ? statusAt(ruleOf(promo), now) : null;
    let end: ["ended" | "stopped", string] | null = null;
    if (now >= new Date(boost.endDate)) end = ["ended", "Durée écoulée."];
    else if (boost.spent >= boost.reserved) end = ["ended", "Budget dépensé."];
    else if (boost.kind === "promotion" && (!promo || promoStatus === "ended" || promoStatus === "stopped")) end = ["ended", "La promotion est terminée."];
    else if (suspendedUntil(db, boost.boutiqueId, now)) end = ["stopped", "Boutique suspendue."];
    else if (promotionsBlockedUntil(db, boost.boutiqueId, now)) end = ["stopped", "Promotions suspendues par la modération."];
    else if (!boost.productBoutiqueIds.some((id) => isBoostable(catalog.find((offer) => offer.id === id)))) end = ["stopped", "Plus aucun produit à montrer : rupture ou retrait."];
    if (end) {
      finishBoost(db, boost, end[0], end[1], now);
      changed = true;
    }
  }
  return changed;
};

const totalsOf = (db: MockDb, boostId: string) => {
  const days = Object.values(db.marketing.boostStats[boostId] ?? {});
  const sum = (key: keyof (typeof days)[number]) => days.reduce((total, day) => total + day[key], 0);
  return { impressions: sum("impressions"), reach: sum("reach"), visits: sum("visits"), carts: sum("carts"), orders: sum("orders"), revenue: sum("revenue"), spent: sum("spent") };
};

const toBoost = (db: MockDb, boost: MockBoost, daily = false) => {
  const totals = totalsOf(db, boost.id);
  const promo = db.marketing.promotions.find((candidate) => candidate.id === boost.promotionId);
  const live = boost.status === "active" || boost.status === "paused";
  const spent = Math.round(boost.spent);
  return {
    id: boost.id,
    boutiqueId: boost.boutiqueId,
    kind: boost.kind,
    kindLabel: boost.kind === "promotion" ? "Boost de promotion" : "Boost de produit",
    ...(promo ? { promotion: { id: promo.id, nom: promo.nom, endDate: promo.endDate } } : {}),
    productBoutiqueIds: boost.productBoutiqueIds,
    offers: offerSummary(boost.productBoutiqueIds),
    goal: boost.goal,
    audience: boost.audience,
    dailyBudget: boost.dailyBudget,
    reserved: boost.reserved,
    spent,
    remaining: live ? Math.max(0, boost.reserved - spent) : 0,
    refunded: boost.refunded,
    costPerVisit: boost.costPerVisit,
    costPerThousandViews: boost.costPerThousandViews,
    startDate: boost.startDate,
    endDate: boost.endDate,
    status: boost.status,
    statusLabel: { active: "En cours", paused: "En pause", ended: "Terminé", stopped: "Arrêté" }[boost.status],
    stopReason: boost.stopReason,
    endedAt: boost.endedAt,
    totals: {
      ...totals,
      spent: Math.round(totals.spent),
      visitRate: totals.impressions > 0 ? Math.round((totals.visits / totals.impressions) * 1000) / 10 : 0,
      costPerSale: totals.orders > 0 ? Math.round(totals.spent / totals.orders) : null,
    },
    ...(daily
      ? {
          daily: Object.entries(db.marketing.boostStats[boost.id] ?? {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([day, row]) => ({ day, ...row, spent: Math.round(row.spent) })),
        }
      : {}),
    availableActions: boost.status === "active" ? ["pause", "stop"] : boost.status === "paused" ? ["resume", "stop"] : [],
    createdAt: boost.createdAt,
  };
};

interface BoostBody {
  kind?: "promotion" | "product";
  promotionId?: string;
  productBoutiqueIds?: string[];
  goal?: "visits" | "views";
  audience?: Partial<MockBoost["audience"]>;
  dailyBudget?: number;
  days?: number;
}

const audienceOf = (input: BoostBody["audience"]): MockBoost["audience"] => ({
  mode: input?.mode === "custom" ? "custom" : "auto",
  communes: (input?.communes ?? []).filter(Boolean),
  villes: (input?.villes ?? []).filter(Boolean),
  customerTypes: (input?.customerTypes ?? []).filter((type) => type === "user" || type === "user_societe"),
  interestFamilleIds: input?.interestFamilleIds ?? [],
  relation: input?.relation === "new" || input?.relation === "returning" ? input.relation : "all",
});

/**
 * Taille d'une audience. La couche simulée n'a qu'une poignée de comptes :
 * elle estime sur une population de 2 400 clients actifs (Conakry et
 * l'intérieur) répartis comme sur la plateforme. Le back compte les vrais.
 */
const POPULATION = 2400;
const ZONE_SHARE: Record<string, number> = { Kaloum: 0.12, Dixinn: 0.15, Matam: 0.16, Ratoma: 0.27, Matoto: 0.2 };
const audienceSize = (audience: MockBoost["audience"]): number => {
  if (audience.mode !== "custom") return POPULATION;
  let share = 1;
  if (audience.communes.length > 0 || audience.villes.length > 0) {
    share *= Math.min(1, audience.communes.reduce((sum, commune) => sum + (ZONE_SHARE[commune] ?? 0.04), 0) + audience.villes.length * 0.02);
  }
  if (audience.customerTypes.length === 1) share *= audience.customerTypes[0] === "user_societe" ? 0.22 : 0.78;
  if (audience.interestFamilleIds.length > 0) share *= Math.min(1, 0.18 * audience.interestFamilleIds.length);
  if (audience.relation === "new") share *= 0.9;
  if (audience.relation === "returning") share *= 0.1;
  return Math.round(POPULATION * share);
};

const resolveBoostOffers = (db: MockDb, shop: Shop, body: BoostBody, now: Date) => {
  const catalog = liveCatalog();
  let offers: ProductBoutique[];
  let latestEnd: Date | null = null;
  let promotionId: string | null = null;
  if (body.kind === "promotion") {
    if (!body.promotionId) throw new ApiError("Choisissez la promotion à booster.", 400);
    const promo = db.marketing.promotions.find((candidate) => candidate.id === body.promotionId);
    if (!promo || promo.boutiqueId !== shop.id) throw new ApiError("Promotion introuvable.", 404);
    const status = statusAt(ruleOf(promo), now);
    if (status !== "active" && status !== "scheduled") throw new ApiError("Seule une promotion en cours ou programmée se booste.", 400);
    if (promo.type === "coupon" || promo.type === "free_shipping") {
      throw new ApiError("Un code ou une livraison offerte n'a pas de produit à montrer : boostez plutôt les produits.", 400);
    }
    promotionId = promo.id;
    latestEnd = new Date(promo.endDate);
    offers = catalog.filter((offer) => targetsOffer(promo, offer));
    if (body.productBoutiqueIds && body.productBoutiqueIds.length > 0) offers = offers.filter((offer) => body.productBoutiqueIds!.includes(offer.id));
  } else {
    const ids = body.productBoutiqueIds ?? [];
    if (ids.length === 0) throw new ApiError("Choisissez au moins un produit.", 400);
    if (ids.length > 10) throw new ApiError("10 produits au plus par boost.", 400);
    offers = ids.map((id) => catalog.find((offer) => offer.id === id)).filter((offer): offer is ProductBoutique => !!offer);
    if (offers.length !== new Set(ids).size) throw new ApiError("Un produit est introuvable.", 404);
    if (offers.some((offer) => offer.boutique?.id !== shop.id)) throw new ApiError("Un boost ne montre que les produits de sa boutique.", 403);
  }
  const eligible = offers.filter(isBoostable).slice(0, 10);
  if (eligible.length === 0) throw new ApiError("Aucun de ces produits ne peut être boosté : il faut du stock et au moins une photo.", 400);
  return { offers: eligible, latestEnd, promotionId };
};

const estimateResults = (db: MockDb, goal: "visits" | "views", dailyBudget: number, size: number) => {
  const { costPerVisit, costPerThousandViews } = db.marketing.settings;
  const cap = Math.max(1, size) * FREQUENCY_CAP;
  if (goal === "views") {
    const views = Math.min(cap, Math.floor((dailyBudget / costPerThousandViews) * 1000));
    return { dailyViews: [Math.floor(views * 0.7), views] as [number, number], dailyVisits: [Math.floor(views * 0.02), Math.ceil(views * 0.04)] as [number, number] };
  }
  const visits = Math.floor(dailyBudget / costPerVisit);
  return {
    dailyViews: [Math.min(cap, visits * 25), Math.min(cap, visits * 50)] as [number, number],
    dailyVisits: [Math.floor(Math.min(visits, cap * 0.04) * 0.6), Math.min(visits, Math.ceil(cap * 0.04))] as [number, number],
  };
};

export const estimateBoost = (shopId: string, body: BoostBody) => {
  const db = readDb();
  const now = new Date();
  const shop = managedShop(db, shopId);
  const { latestEnd } = resolveBoostOffers(db, shop, body, now);
  const audience = audienceOf(body.audience);
  const size = audienceSize(audience);
  const maxDays = latestEnd ? Math.max(1, Math.min(MAX_BOOST_DAYS, Math.floor((latestEnd.getTime() - now.getTime()) / DAY))) : MAX_BOOST_DAYS;
  const days = Math.max(1, Math.min(Number(body.days) || 1, maxDays));
  const dailyBudget = Number(body.dailyBudget) || 0;
  return ok(
    {
      audienceSize: size,
      minAudience: db.marketing.settings.minAudience,
      audienceOk: audience.mode !== "custom" || size >= db.marketing.settings.minAudience,
      days,
      maxDays,
      totalBudget: Math.round(dailyBudget * days),
      minDailyBudget: minDailyBudget(db),
      ...estimateResults(db, body.goal ?? "visits", dailyBudget, size),
      costPerVisit: db.marketing.settings.costPerVisit,
      costPerThousandViews: db.marketing.settings.costPerThousandViews,
      credits: db.marketing.credits[shopId] ?? 0,
    },
    "Estimation calculée"
  );
};

export const createBoost = (shopId: string, body: BoostBody) => {
  const db = readDb();
  const now = new Date();
  const shop = managedShop(db, shopId);
  if (body.kind !== "promotion" && body.kind !== "product") throw new ApiError("Choisissez un boost de promotion ou de produit.", 422);
  const days = Number(body.days);
  const dailyBudget = Number(body.dailyBudget);
  if (!Number.isInteger(days) || days < 1 || days > MAX_BOOST_DAYS) throw new ApiError(`Un boost dure de 1 à ${MAX_BOOST_DAYS} jours.`, 400);
  if (!(dailyBudget >= minDailyBudget(db))) throw new ApiError(`Le budget minimum est de ${minDailyBudget(db)} GNF par jour.`, 400);
  if (suspendedUntil(db, shopId, now)) throw new ApiError("Votre boutique est suspendue : elle ne peut pas être boostée d'ici là.", 400);
  if (promotionsBlockedUntil(db, shopId, now)) throw new ApiError("Les promotions et boosts de cette boutique sont suspendus par la modération.", 403);
  const context = contextOf(db, shop, now);
  if (context.shopAgeDays < PROMO_LIMITS.seniorityDays || context.deliveredOrders < PROMO_LIMITS.seniorityDeliveredOrders) {
    throw new ApiError(`Le boost s'ouvre après ${PROMO_LIMITS.seniorityDays} jours et ${PROMO_LIMITS.seniorityDeliveredOrders} commandes livrées.`, 400);
  }
  const { offers, latestEnd, promotionId } = resolveBoostOffers(db, shop, body, now);
  const endDate = new Date(now.getTime() + days * DAY);
  if (latestEnd && endDate > latestEnd) {
    throw new ApiError(`Un boost de promotion ne dépasse pas la fin de la promotion (${latestEnd.toLocaleDateString("fr-FR")}).`, 400);
  }
  const audience = audienceOf(body.audience);
  if (audience.mode === "custom" && audienceSize(audience) < db.marketing.settings.minAudience) {
    throw new ApiError(`Cette audience compte moins de ${db.marketing.settings.minAudience} clients : élargissez-la, pour ne jamais viser une personne.`, 400);
  }
  const reserved = Math.round(dailyBudget * days);
  const id = objectId();
  moveCredits(db, shopId, -reserved, "boost_reserve", `Boost de ${days} jour${days > 1 ? "s" : ""}`, id);
  const boost: MockBoost = {
    id,
    boutiqueId: shopId,
    kind: body.kind,
    promotionId,
    productBoutiqueIds: offers.map((offer) => offer.id),
    goal: body.goal === "views" ? "views" : "visits",
    audience,
    dailyBudget,
    reserved,
    spent: 0,
    costPerVisit: db.marketing.settings.costPerVisit,
    costPerThousandViews: db.marketing.settings.costPerThousandViews,
    startDate: now.toISOString(),
    endDate: endDate.toISOString(),
    status: "active",
    stopReason: null,
    endedAt: null,
    refunded: 0,
    createdAt: now.toISOString(),
  };
  db.marketing.boosts.push(boost);
  writeDb(db);
  return ok(toBoost(db, boost), "Boost lancé : vos produits sont mis en avant.", 201);
};

export const listBoosts = (shopId: string, params: URLSearchParams) => {
  const db = readDb();
  const now = new Date();
  managedShop(db, shopId);
  if (boostTick(db, now)) writeDb(db);
  const ended = params.get("tab") === "ended";
  const mine = db.marketing.boosts.filter((boost) => boost.boutiqueId === shopId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const isLive = (boost: MockBoost) => boost.status === "active" || boost.status === "paused";
  const items = mine.filter((boost) => (ended ? !isLive(boost) : isLive(boost)));
  return ok(
    { boosts: items.map((boost) => toBoost(db, boost)), total: items.length, page: 1, totalPages: 1, counts: { active: mine.filter(isLive).length, ended: mine.filter((boost) => !isLive(boost)).length } },
    "Boosts de la boutique récupérés avec succès"
  );
};

const managedBoost = (db: MockDb, boostId: string) => {
  const boost = db.marketing.boosts.find((candidate) => candidate.id === boostId);
  if (!boost) throw new ApiError("Boost introuvable.", 404);
  managedShop(db, boost.boutiqueId);
  return boost;
};

export const getBoost = (boostId: string) => {
  const db = readDb();
  if (boostTick(db, new Date())) writeDb(db);
  return ok(toBoost(db, managedBoost(db, boostId), true), "Boost récupéré avec succès");
};

export const boostAction = (boostId: string, action: string) => {
  const db = readDb();
  const now = new Date();
  const boost = managedBoost(db, boostId);
  switch (action) {
    case "pause":
      if (boost.status !== "active") throw new ApiError("Seul un boost en cours se met en pause.", 400);
      boost.status = "paused";
      break;
    case "resume":
      if (boost.status !== "paused") throw new ApiError("Seul un boost en pause reprend.", 400);
      if (now >= new Date(boost.endDate)) finishBoost(db, boost, "ended", "Durée écoulée.", now);
      else boost.status = "active";
      break;
    case "stop":
      if (boost.status !== "active" && boost.status !== "paused") throw new ApiError("Ce boost est déjà terminé.", 400);
      finishBoost(db, boost, "stopped", "Arrêté par la boutique.", now);
      break;
    default:
      throw new ApiError("Action inconnue.", 404);
  }
  writeDb(db);
  const messages: Record<string, string> = {
    pause: "Boost en pause : vos produits ne sont plus montrés.",
    resume: "Boost repris.",
    stop: "Boost arrêté : le budget non dépensé est rendu en crédits.",
  };
  return ok(toBoost(db, boost), messages[action]!);
};

/** Sanction ou suspension : les boosts de la boutique s'arrêtent, budget rendu (appelé par support.ts). */
export const stopShopBoosts = (db: MockDb, shopId: string, reason: string, now = new Date()): void => {
  for (const boost of db.marketing.boosts) {
    if (boost.boutiqueId === shopId && (boost.status === "active" || boost.status === "paused")) finishBoost(db, boost, "stopped", reason, now);
  }
};

// ── Crédits ─────────────────────────────────

export const getCredits = (shopId: string) => {
  const db = readDb();
  managedShop(db, shopId);
  if (boostTick(db, new Date())) writeDb(db);
  const { settings } = db.marketing;
  return ok(
    {
      balance: db.marketing.credits[shopId] ?? 0,
      settings: { costPerVisit: settings.costPerVisit, costPerThousandViews: settings.costPerThousandViews, monthlyCredits: settings.monthlyCredits, minDailyBudget: minDailyBudget(db), minAudience: settings.minAudience },
      ledger: db.marketing.ledger
        .filter((entry) => entry.shopId === shopId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50)
        .map(({ shopId: _shop, ref: _ref, ...entry }) => entry),
    },
    "Crédits récupérés avec succès"
  );
};

export const rechargeCredits = (shopId: string, body: { amount?: number }) => {
  const amount = Math.round(Number(body.amount));
  if (!(amount >= 1000 && amount <= 10_000_000)) throw new ApiError("Recharge de 1 000 à 10 000 000 GNF.", 422);
  const db = readDb();
  managedShop(db, shopId);
  const purchase = { id: objectId(), shopId, amount, status: "pending" as const, createdAt: new Date().toISOString(), paidAt: null };
  db.marketing.purchases.push(purchase);
  writeDb(db);
  return ok(
    { purchaseId: purchase.id, amount, status: purchase.status, redirectUrl: `${window.location.origin}/paiement/credits-${shopId}-${purchase.id}` },
    "Recharge lancée : il reste à payer.",
    201
  );
};

export const settleSandboxCredits = (shopId: string, purchaseId: string, body: { outcome?: string }) => {
  if (body.outcome !== "paid" && body.outcome !== "failed") throw new ApiError("Issue : paid ou failed.", 422);
  const db = readDb();
  managedShop(db, shopId);
  const purchase = db.marketing.purchases.find((candidate) => candidate.id === purchaseId && candidate.shopId === shopId);
  if (!purchase) throw new ApiError("Recharge introuvable.", 404);
  if (purchase.status !== "pending") throw new ApiError("Cette recharge est déjà réglée.", 409);
  if (body.outcome === "paid") {
    purchase.status = "paid";
    purchase.paidAt = new Date().toISOString();
    moveCredits(db, shopId, purchase.amount, "recharge", "Recharge par mobile money", purchase.id);
  } else {
    purchase.status = "failed";
  }
  writeDb(db);
  return ok(
    { purchaseId: purchase.id, status: purchase.status, balance: db.marketing.credits[shopId] ?? 0 },
    purchase.status === "paid" ? "Crédits ajoutés à votre portefeuille." : "Paiement refusé : aucun crédit ajouté."
  );
};

/** Montant d'une recharge en attente : la page de paiement simulée l'affiche. */
export const getPurchase = (shopId: string, purchaseId: string) => {
  const db = readDb();
  managedShop(db, shopId);
  const purchase = db.marketing.purchases.find((candidate) => candidate.id === purchaseId && candidate.shopId === shopId);
  if (!purchase) throw new ApiError("Recharge introuvable.", 404);
  return ok({ purchaseId: purchase.id, amount: purchase.amount, status: purchase.status }, "Recharge récupérée");
};

// ── Places sponsorisées ─────────────────────

const viewerKey = (db: MockDb) => (db.sessionUserId ? `user:${db.sessionUserId}` : "anon:ce-navigateur");

const pacingShare = (now: Date) => Math.min(1, Math.max(0.05, (now.getUTCHours() + now.getUTCMinutes() / 60 - 7) / 15));

const statRow = (db: MockDb, boostId: string, day: string) => {
  const days = (db.marketing.boostStats[boostId] ??= {});
  return (days[day] ??= { impressions: 0, reach: 0, visits: 0, carts: 0, orders: 0, revenue: 0, spent: 0 });
};

const relevant = (slot: Slot, params: URLSearchParams, offer: ProductBoutique, viewed: ProductBoutique | undefined) => {
  switch (slot) {
    case "search": {
      const q = params.get("q")?.trim().toLowerCase();
      if (!q) return false;
      return `${offer.product?.name ?? ""} ${offer.product?.description ?? ""}`.toLowerCase().includes(q);
    }
    case "category": {
      const sous = params.get("sousCategoryId");
      const categorie = params.get("categoryId");
      const famille = params.get("familleId");
      if (sous) return offer.product?.sousCategories[0]?.id === sous;
      if (categorie) return offer.product?.categories[0]?.id === categorie;
      if (famille) return offer.product?.familles[0]?.id === famille;
      return false;
    }
    case "similar":
      return !!viewed && offer.id !== viewed.id && offer.product?.categories[0]?.id === viewed.product?.categories[0]?.id;
    case "promotions":
      return (offer.pricing?.percent ?? 0) > 0;
    default:
      return true;
  }
};

const whyShown = (boost: MockBoost, offer: ProductBoutique) => {
  const zones = [...boost.audience.communes, ...boost.audience.villes];
  const where = boost.audience.mode === "custom" && zones.length > 0 ? `, à ${zones.join(", ")}` : "";
  return `${offer.boutique?.nom ?? "Cette boutique"} paie pour montrer ce produit aux clients intéressés par ce type d'article${where}.`;
};

/** GET /sponsored : les offres boostées d'une page, choisies pour ce visiteur (affichages comptés). */
export const sponsored = (params: URLSearchParams) => {
  const slot = (params.get("slot") ?? "home") as Slot;
  if (!(slot in SLOT_PLACES)) throw new ApiError("Emplacement inconnu.", 400);
  const db = readDb();
  const now = new Date();
  boostTick(db, now);
  const day = dayKey(now);
  const key = viewerKey(db);
  const user = db.users.find((candidate) => candidate._id === db.sessionUserId);
  const catalog = publicCatalog();
  const viewed = params.get("offerId") ? catalog.find((offer) => offer.id === params.get("offerId")) : undefined;
  const places = SLOT_PLACES[slot];

  const candidates: { offer: ProductBoutique; boost: MockBoost; weight: number }[] = [];
  for (const boost of db.marketing.boosts) {
    if (boost.status !== "active" || new Date(boost.startDate) > now || new Date(boost.endDate) <= now) continue;
    if (slot === "promotions" && boost.kind !== "promotion") continue;
    if (boost.spent >= boost.reserved) continue;
    if (statRow(db, boost.id, day).spent >= boost.dailyBudget * pacingShare(now)) continue;
    if ((db.marketing.boostExposures[`${boost.id}|${key}|${day}`] ?? 0) >= FREQUENCY_CAP) continue;
    // Audience personnalisée : seulement un client connecté, d'après sa commune.
    if (boost.audience.mode === "custom") {
      if (!user) continue;
      const communes = db.addresses.filter((address) => address.userId === user._id).map((address) => address.commune ?? "");
      const zones = [...boost.audience.communes, ...boost.audience.villes];
      if (zones.length > 0 && !communes.some((commune) => zones.includes(commune))) continue;
    }
    const fitting = catalog.filter((offer) => boost.productBoutiqueIds.includes(offer.id) && offer.stock > 0 && relevant(slot, params, offer, viewed));
    const offer = fitting.sort((a, b) => (b.pricing?.percent ?? 0) - (a.pricing?.percent ?? 0))[0];
    if (!offer) continue;
    const totals = totalsOf(db, boost.id);
    const quality = ((totals.visits + 1) / (totals.impressions + 30)) * (1 + (offer.rating ?? 0) / 5);
    const discount = boost.kind === "promotion" ? 1 + (offer.pricing?.percent ?? 0) / 50 : 1;
    candidates.push({ offer, boost, weight: quality * discount });
  }

  const chosen: { offer: ProductBoutique; boost: MockBoost }[] = [];
  const perShop = new Map<string, number>();
  const pool = [...candidates];
  while (chosen.length < places && pool.length > 0) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let draw = Math.random() * total;
    const index = pool.findIndex((entry) => (draw -= entry.weight) <= 0);
    const [entry] = pool.splice(index === -1 ? pool.length - 1 : index, 1);
    if (!entry) break;
    const shopKey = entry.boost.boutiqueId;
    if ((perShop.get(shopKey) ?? 0) >= Math.max(1, Math.floor(places / 2)) || chosen.some((item) => item.offer.id === entry.offer.id)) continue;
    perShop.set(shopKey, (perShop.get(shopKey) ?? 0) + 1);
    chosen.push(entry);
  }

  for (const { boost } of chosen) {
    const exposureKey = `${boost.id}|${key}|${day}`;
    const count = (db.marketing.boostExposures[exposureKey] ?? 0) + 1;
    db.marketing.boostExposures[exposureKey] = count;
    const row = statRow(db, boost.id, day);
    row.impressions += 1;
    if (count === 1) row.reach += 1;
    if (boost.goal === "views") {
      const cost = Math.min(boost.costPerThousandViews / 1000, boost.reserved - boost.spent);
      row.spent += cost;
      boost.spent += cost;
    }
  }
  writeDb(db);
  return ok(
    chosen.map(({ offer, boost }) => ({ ...offer, sponsored: { boostId: boost.id, kind: boost.kind, why: whyShown(boost, offer) } })),
    "Produits sponsorisés"
  );
};

/** Visite d'une fiche depuis une place sponsorisée : une fois par visiteur et par jour, payée à la visite. */
export const recordBoostVisit = (boostId: string, offerId: string) => {
  const db = readDb();
  const now = new Date();
  const boost = db.marketing.boosts.find((candidate) => candidate.id === boostId);
  if (!boost || boost.status !== "active" || !boost.productBoutiqueIds.includes(offerId)) return;
  const user = db.users.find((candidate) => candidate._id === db.sessionUserId);
  if (user?.role === "admin") return;
  const shop = allShops().find((candidate) => candidate.id === boost.boutiqueId);
  if (user && shop?.ownerId === user._id) return;
  const day = dayKey(now);
  const key = viewerKey(db);
  if (db.marketing.boostVisits.some((visit) => visit.boostId === boostId && visit.viewerKey === key && visit.day === day)) return;
  db.marketing.boostVisits.push({ boostId, offerId, viewerKey: key, userId: user?._id ?? null, day, at: now.toISOString() });
  const row = statRow(db, boost.id, day);
  row.visits += 1;
  if (boost.goal === "visits") {
    const cost = Math.min(boost.costPerVisit, Math.max(0, boost.reserved - boost.spent));
    row.spent += cost;
    boost.spent += cost;
  }
  writeDb(db);
};

/** Boost dont une visite, dans les 7 jours, a précédé cet achat. */
export const attributedBoost = (db: MockDb, userId: string, offerId: string, now = new Date()): string | null =>
  [...db.marketing.boostVisits]
    .reverse()
    .find((visit) => visit.userId === userId && visit.offerId === offerId && now.getTime() - new Date(visit.at).getTime() <= 7 * DAY)?.boostId ?? null;

/** Après une commande : ventes et chiffre d'affaires de chaque boost qui l'a amenée. */
export const recordBoostSales = (db: MockDb, items: readonly { boostId?: string | null; price: number; quantity: number }[], now = new Date()): void => {
  const byBoost = new Map<string, number>();
  for (const item of items) if (item.boostId) byBoost.set(item.boostId, (byBoost.get(item.boostId) ?? 0) + item.price * item.quantity);
  for (const [boostId, revenue] of byBoost) {
    const row = statRow(db, boostId, dayKey(now));
    row.orders += 1;
    row.revenue += revenue;
  }
};

/** Ajout au panier après une visite du boost. */
export const recordBoostCartAdd = (db: MockDb, userId: string, offerId: string, now = new Date()): void => {
  const boostId = attributedBoost(db, userId, offerId, now);
  if (boostId) statRow(db, boostId, dayKey(now)).carts += 1;
};

// ── Administration ──────────────────────────

export const listAllBoosts = (params: URLSearchParams) => {
  const db = readDb();
  requireAdmin(db);
  if (boostTick(db, new Date())) writeDb(db);
  const status = params.get("status");
  const items = db.marketing.boosts
    .filter((boost) => (status ? boost.status === status : boost.status === "active" || boost.status === "paused"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return ok({ boosts: items.map((boost) => toBoost(db, boost)), total: items.length, page: 1, totalPages: 1 }, "Boosts récupérés avec succès");
};

export const getBoostSettings = () => {
  const db = readDb();
  sessionUser(db);
  return ok({ ...db.marketing.settings, minDailyBudget: minDailyBudget(db) }, "Réglages des boosts");
};

export const updateBoostSettings = (body: { costPerVisit?: number; costPerThousandViews?: number; monthlyCredits?: number; minVisitsPerDay?: number }) => {
  const db = readDb();
  requireAdmin(db);
  for (const key of ["costPerVisit", "costPerThousandViews", "monthlyCredits", "minVisitsPerDay"] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (!Number.isInteger(Number(value)) || Number(value) < (key === "monthlyCredits" ? 0 : 1)) throw new ApiError("Réglage invalide.", 422);
    db.marketing.settings[key] = Number(value);
  }
  writeDb(db);
  return ok({ ...db.marketing.settings, minDailyBudget: minDailyBudget(db) }, "Réglages enregistrés : ils valent pour les prochains boosts.");
};

// Pour les messages d'heure : une vente flash dure de 2 à 72 heures.
export const FLASH_BOUNDS_HOURS = [2 * HOUR, 72 * HOUR];
