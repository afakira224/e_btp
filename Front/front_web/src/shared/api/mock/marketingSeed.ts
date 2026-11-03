import { OFFERS, PROMOTIONS, SHOPS } from "./catalogSeed";

// ─────────────────────────────────────────────
//  Promotions, campagnes et boosts de la couche simulée.
//
//  Mêmes documents que le back (Promotion, Campaign, Boost, BoostStat,
//  CreditLedger…), rangés dans la base simulée sous `marketing`. Le jeu de
//  départ reprend celui du seed du back : les remises du catalogue
//  deviennent des remises produit de leur boutique, plus un prix par
//  quantité, une livraison offerte, un code de boutique, une campagne, et
//  pour Volta Électrique un boost terminé et un boost en cours.
// ─────────────────────────────────────────────

export type MockPromotionType = "coupon" | "flash_sale" | "product_discount" | "shop_discount" | "quantity_tiers" | "free_shipping";
export type MockPromotionStatus = "draft" | "scheduled" | "active" | "paused" | "ended" | "stopped";

export interface MockPromotion {
  id: string;
  /** null : promotion de la plateforme. */
  boutiqueId: string | null;
  type: MockPromotionType;
  status: MockPromotionStatus;
  nom: string;
  description?: string | undefined;
  scope: "product_boutique" | "cart";
  discountType: "percentage" | "fixed";
  discountValue: number;
  code: string | null;
  startDate: string;
  endDate: string;
  productBoutiqueIds: string[];
  target?: { familleIds: string[]; categoryIds: string[]; excludedOfferIds: string[] } | undefined;
  minAmount: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  usedCount: number;
  perCustomerLimit: number | null;
  stackable: boolean;
  tiers: { minQuantity: number; discountValue: number }[];
  flashQuantity: number | null;
  flashSold: number;
  campaignId: string | null;
  highDiscountConfirmed: boolean;
  actif: boolean;
  stoppedAt: string | null;
  stopReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MockCampaign {
  id: string;
  slug: string;
  nom: string;
  description?: string | undefined;
  startDate: string;
  endDate: string;
  minDiscount: number;
  familleIds: string[];
  image: string | null;
  actif: boolean;
  createdAt: string;
}

export interface MockBoost {
  id: string;
  boutiqueId: string;
  kind: "promotion" | "product";
  promotionId: string | null;
  productBoutiqueIds: string[];
  goal: "visits" | "views";
  audience: {
    mode: "auto" | "custom";
    communes: string[];
    villes: string[];
    customerTypes: string[];
    interestFamilleIds: string[];
    relation: "all" | "new" | "returning";
  };
  dailyBudget: number;
  reserved: number;
  spent: number;
  costPerVisit: number;
  costPerThousandViews: number;
  startDate: string;
  endDate: string;
  status: "active" | "paused" | "ended" | "stopped";
  stopReason: string | null;
  endedAt: string | null;
  refunded: number;
  createdAt: string;
}

export interface MockBoostDay {
  impressions: number;
  reach: number;
  visits: number;
  carts: number;
  orders: number;
  revenue: number;
  spent: number;
}

export interface MockBoostVisit {
  boostId: string;
  offerId: string;
  viewerKey: string;
  userId: string | null;
  day: string;
  at: string;
}

export interface MockCreditEntry {
  id: string;
  shopId: string;
  delta: number;
  balanceAfter: number;
  reason: "recharge" | "monthly_grant" | "boost_reserve" | "boost_refund";
  label: string;
  ref: string | null;
  createdAt: string;
}

export interface MockCreditPurchase {
  id: string;
  shopId: string;
  amount: number;
  status: "pending" | "paid" | "failed";
  createdAt: string;
  paidAt: string | null;
}

export interface MockBoostSettings {
  costPerVisit: number;
  costPerThousandViews: number;
  monthlyCredits: number;
  minVisitsPerDay: number;
  minAudience: number;
}

export interface MockMarketing {
  promotions: MockPromotion[];
  /** Prix pratiqués par offre, du plus ancien au plus récent (le prix de référence s'en déduit). */
  priceHistory: Record<string, { price: number; from: string; to: string | null }[]>;
  campaigns: MockCampaign[];
  /** Produits phares, par boutique : identifiants d'offres dans l'ordre (6 au plus). */
  featured: Record<string, string[]>;
  boosts: MockBoost[];
  /** boostId → jour (AAAA-MM-JJ) → chiffres. */
  boostStats: Record<string, Record<string, MockBoostDay>>;
  /** `${boostId}|${viewerKey}|${day}` → affichages ce jour-là (plafond de 3). */
  boostExposures: Record<string, number>;
  boostVisits: MockBoostVisit[];
  credits: Record<string, number>;
  ledger: MockCreditEntry[];
  purchases: MockCreditPurchase[];
  settings: MockBoostSettings;
  /** Boutique → mois (AAAA-MM) des derniers crédits offerts. */
  grantedMonths: Record<string, string>;
  /** Commandes livrées avant le jeu de démonstration, par boutique : l'ancienneté des ventes flash et des boosts. */
  pastDelivered: Record<string, number>;
  /** Unités vendues sur 30 jours avant le jeu de démonstration, par offre : les meilleures ventes. */
  salesSeed: Record<string, number>;
}

export const DEFAULT_BOOST_SETTINGS: MockBoostSettings = {
  costPerVisit: 500,
  costPerThousandViews: 5000,
  monthlyCredits: 50000,
  minVisitsPerDay: 20,
  minAudience: 100,
};

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
export const NO_END = "9999-12-31T00:00:00.000Z";
export const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

const shopIdOf = (nom: string): string => {
  const shop = SHOPS.find((candidate) => candidate.nom === nom);
  if (!shop) throw new Error(`Jeu de promotions : boutique « ${nom} » introuvable.`);
  return shop.id;
};

const blank = (over: Partial<MockPromotion> & Pick<MockPromotion, "id" | "type" | "nom" | "startDate" | "endDate">): MockPromotion => ({
  boutiqueId: null,
  status: "active",
  scope: "product_boutique",
  discountType: "percentage",
  discountValue: 0,
  code: null,
  productBoutiqueIds: [],
  minAmount: 0,
  maxDiscount: null,
  usageLimit: null,
  usedCount: 0,
  perCustomerLimit: null,
  stackable: true,
  tiers: [],
  flashQuantity: null,
  flashSold: 0,
  campaignId: null,
  highDiscountConfirmed: false,
  actif: true,
  stoppedAt: null,
  stopReason: null,
  createdAt: over.startDate,
  updatedAt: over.startDate,
  ...over,
});

/** Jours de statistiques d'un boost : des chiffres plausibles, du premier jour au dernier. */
const statsFor = (start: Date, days: number, perDay: { impressions: number; visits: number; costPerVisit: number }) => {
  const rows: Record<string, MockBoostDay> = {};
  let spent = 0;
  for (let index = 0; index < days; index += 1) {
    const day = new Date(start.getTime() + index * DAY);
    const wave = 0.8 + ((index * 37) % 5) / 10;
    const impressions = Math.round(perDay.impressions * wave);
    const visits = Math.round(perDay.visits * wave);
    const orders = index % 3 === 1 ? 1 : 0;
    const cost = visits * perDay.costPerVisit;
    spent += cost;
    rows[dayKey(day)] = { impressions, reach: Math.round(impressions * 0.62), visits, carts: Math.round(visits * 0.18), orders, revenue: orders * 442000, spent: cost };
  }
  return { rows, spent };
};

export const seedMarketing = (now = new Date()): MockMarketing => {
  const iso = (offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString();
  const volta = shopIdOf("Volta Électrique");
  const matam = shopIdOf("Dépôt Matam");
  const kaloum = shopIdOf("Kaloum Céramique");
  const campaignStart = iso(-2 * DAY);
  const campaignEnd = iso(12 * DAY);

  const campaign: MockCampaign = {
    id: "camp-rentree-chantier",
    slug: "rentree-chantier",
    nom: "Rentrée chantier",
    description: "Les dépôts baissent leurs prix pour la reprise des chantiers.",
    startDate: campaignStart,
    endDate: campaignEnd,
    minDiscount: 10,
    familleIds: [],
    image: null,
    actif: true,
    createdAt: campaignStart,
  };

  // Vente flash et codes de la plateforme.
  const platform: MockPromotion[] = [
    ...PROMOTIONS.map((promo) =>
      blank({
        id: promo.id,
        type: promo.type,
        nom: promo.nom,
        description: promo.description,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        startDate: promo.startDate,
        endDate: promo.endDate,
        productBoutiqueIds: promo.productBoutiqueIds,
      })
    ),
    blank({ id: "promo-bienvenue", type: "coupon", scope: "cart", nom: "Bienvenue", description: "10 % sur votre première commande.", discountValue: 10, code: "BIENVENUE10", minAmount: 200000, maxDiscount: 100000, perCustomerLimit: 1, startDate: iso(-30 * DAY), endDate: iso(335 * DAY) }),
    blank({ id: "promo-chantier", type: "coupon", scope: "cart", nom: "Remise chantier", description: "50 000 GNF dès 1 000 000 GNF d'achat.", discountType: "fixed", discountValue: 50000, code: "CHANTIER50", minAmount: 1000000, startDate: iso(-2 * DAY), endDate: iso(28 * DAY) }),
  ];

  // Les remises du catalogue : des remises produit de leur boutique, celles
  // de Dépôt Matam inscrites à la campagne.
  const discounts: MockPromotion[] = OFFERS.flatMap((offer) => {
    if (offer.discountPrice == null || !offer.boutique) return [];
    const percent = Math.round(((offer.price - offer.discountPrice) / offer.price) * 100);
    const inCampaign = offer.boutique.id === matam && percent >= campaign.minDiscount;
    return [
      blank({
        id: `promo-${offer.id}`,
        boutiqueId: offer.boutique.id,
        type: "product_discount",
        nom: inCampaign ? `${campaign.nom} — −${percent} %` : `Remise de ${percent} %`,
        discountValue: percent,
        productBoutiqueIds: [offer.id],
        campaignId: inCampaign ? campaign.id : null,
        startDate: inCampaign ? campaignStart : iso(-2 * DAY),
        endDate: inCampaign ? campaignEnd : iso(19 * DAY),
      }),
    ];
  });

  const shopPromos: MockPromotion[] = [
    blank({ id: "promo-paliers-ciment", boutiqueId: matam, type: "quantity_tiers", nom: "Ciment en gros", productBoutiqueIds: ["off-ciment-cem2"], tiers: [{ minQuantity: 50, discountValue: 5 }, { minQuantity: 200, discountValue: 8 }], startDate: iso(-3 * DAY), endDate: NO_END }),
    blank({ id: "promo-livraison-kaloum", boutiqueId: kaloum, type: "free_shipping", scope: "cart", nom: "Livraison offerte dès 1 000 000 GNF", minAmount: 1000000, startDate: iso(-2 * DAY), endDate: iso(28 * DAY) }),
    blank({ id: "promo-volta10", boutiqueId: volta, type: "coupon", scope: "cart", nom: "VOLTA10", code: "VOLTA10", discountValue: 10, minAmount: 500000, perCustomerLimit: 1, startDate: iso(-1 * DAY), endDate: iso(59 * DAY) }),
    blank({ id: "promo-volta-disjoncteurs", boutiqueId: volta, type: "product_discount", status: "scheduled", nom: "Semaine des disjoncteurs", discountValue: 12, productBoutiqueIds: ["off-disjoncteur-20a"], startDate: iso(3 * DAY), endDate: iso(10 * DAY) }),
    blank({ id: "promo-volta-projecteurs", boutiqueId: volta, type: "product_discount", status: "ended", nom: "Éclairage de chantier", discountValue: 10, productBoutiqueIds: ["off-projecteur-led"], startDate: iso(-24 * DAY), endDate: iso(-10 * DAY) }),
  ].filter((promo) => promo.productBoutiqueIds.every((id) => OFFERS.some((offer) => offer.id === id)));

  // Boosts de Volta Électrique : un terminé, un en cours.
  const endedStart = new Date(now.getTime() - 14 * DAY);
  const ended = statsFor(endedStart, 7, { impressions: 410, visits: 14, costPerVisit: 500 });
  const activeStart = new Date(now.getTime() - 2 * DAY);
  const active = statsFor(activeStart, 2, { impressions: 380, visits: 12, costPerVisit: 500 });
  const audience = { mode: "auto" as const, communes: [], villes: [], customerTypes: [], interestFamilleIds: [], relation: "all" as const };
  const boosts = ([
    {
      id: "boost-volta-cable",
      boutiqueId: volta,
      kind: "product",
      promotionId: null,
      productBoutiqueIds: ["off-cable-25"],
      goal: "visits",
      audience,
      dailyBudget: 10000,
      reserved: 70000,
      spent: ended.spent,
      costPerVisit: 500,
      costPerThousandViews: 5000,
      startDate: endedStart.toISOString(),
      endDate: new Date(endedStart.getTime() + 7 * DAY).toISOString(),
      status: "ended",
      stopReason: "Durée écoulée.",
      endedAt: new Date(endedStart.getTime() + 7 * DAY).toISOString(),
      refunded: Math.max(0, 70000 - ended.spent),
      createdAt: endedStart.toISOString(),
    },
    {
      id: "boost-volta-tableau",
      boutiqueId: volta,
      kind: "promotion",
      promotionId: "promo-off-tableau-12",
      productBoutiqueIds: ["off-tableau-12"],
      goal: "visits",
      audience: { ...audience, mode: "custom", communes: ["Ratoma", "Matoto"] },
      dailyBudget: 15000,
      reserved: 105000,
      spent: active.spent,
      costPerVisit: 500,
      costPerThousandViews: 5000,
      startDate: activeStart.toISOString(),
      endDate: new Date(activeStart.getTime() + 7 * DAY).toISOString(),
      status: "active",
      stopReason: null,
      endedAt: null,
      refunded: 0,
      createdAt: activeStart.toISOString(),
    },
  ] satisfies MockBoost[]).filter((boost) => boost.productBoutiqueIds.every((id) => OFFERS.some((offer) => offer.id === id))) as MockBoost[];

  // Crédits : offerts ce mois-ci à chaque boutique ; Volta a rechargé et lancé ses boosts.
  const month = now.toISOString().slice(0, 7);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const credits: Record<string, number> = {};
  const ledger: MockCreditEntry[] = [];
  const grantedMonths: Record<string, string> = {};
  const move = (shopId: string, delta: number, reason: MockCreditEntry["reason"], label: string, at: string, ref: string | null = null) => {
    credits[shopId] = (credits[shopId] ?? 0) + delta;
    ledger.push({ id: `cr-${ledger.length + 1}`, shopId, delta, balanceAfter: credits[shopId]!, reason, label, ref, createdAt: at });
  };
  for (const shop of SHOPS) {
    if (shop.id === volta) {
      move(volta, 150000, "recharge", "Recharge par mobile money", iso(-20 * DAY));
      move(volta, -70000, "boost_reserve", "Boost de 7 jours", endedStart.toISOString(), "boost-volta-cable");
      move(volta, Math.max(0, 70000 - ended.spent), "boost_refund", "Budget de boost non dépensé", new Date(endedStart.getTime() + 7 * DAY).toISOString(), "boost-volta-cable");
    }
    move(shop.id, DEFAULT_BOOST_SETTINGS.monthlyCredits, "monthly_grant", `Crédits offerts — ${month}`, monthStart, month);
    grantedMonths[shop.id] = month;
    if (shop.id === volta) move(volta, -105000, "boost_reserve", "Boost de 7 jours", activeStart.toISOString(), "boost-volta-tableau");
  }

  return {
    promotions: [...platform, ...discounts, ...shopPromos],
    priceHistory: {},
    campaigns: [campaign],
    featured: { [volta]: ["off-tableau-12", "off-cable-25", "off-disjoncteur-20a"].filter((id) => OFFERS.some((offer) => offer.id === id)) },
    boosts,
    boostStats: Object.fromEntries(boosts.map((boost) => [boost.id, boost.id === "boost-volta-cable" ? ended.rows : active.rows])),
    boostExposures: {},
    boostVisits: [],
    credits,
    ledger: ledger.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    purchases: [],
    settings: { ...DEFAULT_BOOST_SETTINGS },
    grantedMonths,
    pastDelivered: Object.fromEntries(SHOPS.map((shop) => [shop.id, 40])),
    salesSeed: Object.fromEntries(OFFERS.map((offer) => [offer.id, Math.round((offer.reviewsCount ?? 0) / 4)])),
  };
};
