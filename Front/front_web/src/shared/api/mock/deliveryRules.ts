import {
  CURRENCY,
  DELIVERY_MODE_LABELS,
  DELIVERY_MODES,
  DeliveryMode,
  isDeliveryMode,
  type DeliveryGroupQuote,
  type DeliveryOption,
  type DeliveryQuote,
  type DeliverySettings,
  type EffectiveDelivery,
} from "../../../entities/delivery";
import { DeliveryMethod, type OrderDelivery } from "../../../entities/order";
import type { ProductBoutique } from "../../../entities/product";
import type { MockProductDelivery, MockShopDelivery } from "./mockDb";
import { SHOPS } from "./catalogSeed";

// ─────────────────────────────────────────────
//  Règles de livraison simulées.
//
//  Portage fidèle de Back/src/shared/helpers/delivery.helper.ts : mêmes
//  validations, mêmes messages, même calcul de devis. Fonctions pures, sans
//  accès à la base simulée ; liveCatalog.ts les applique aux données.
//
//  Facturation du prix fixe : une livraison par boutique, facturée une fois
//  au tarif le plus élevé de ses articles. Deux boutiques, deux frais.
// ─────────────────────────────────────────────

// Réglages d'une boutique qui n'a jamais configuré sa livraison, comme
// DEFAULT_SHOP_MODES / DEFAULT_FLAT_RATE_FEE côté back.
export const DEFAULT_SHOP_DELIVERY: MockShopDelivery = {
  modes: [DeliveryMode.PICKUP, DeliveryMode.FLAT_RATE],
  flatRateFee: 25_000,
};

// Réglages de départ, repris de Back/src/seed/catalog.data.ts.
const SEED_BY_SHOP_NAME: Record<string, MockShopDelivery> = {
  "Dépôt Matam": { modes: [DeliveryMode.PICKUP, DeliveryMode.FLAT_RATE], flatRateFee: 50_000 },
  "Kaloum Céramique": { modes: [DeliveryMode.PICKUP, DeliveryMode.FLAT_RATE], flatRateFee: 25_000 },
  "Coloris Conakry": { modes: [DeliveryMode.PICKUP, DeliveryMode.FREE], flatRateFee: null },
  "Sanitaire Plus": { modes: [DeliveryMode.PICKUP, DeliveryMode.FLAT_RATE], flatRateFee: 30_000 },
  "Volta Électrique": {
    modes: [DeliveryMode.PICKUP, DeliveryMode.FREE, DeliveryMode.FLAT_RATE],
    flatRateFee: 20_000,
  },
  "Pro Outillage": { modes: [DeliveryMode.PICKUP, DeliveryMode.FLAT_RATE], flatRateFee: 35_000 },
};

// Offres livrées autrement que leur boutique : granulats en benne, échafaudage
// trop encombrant pour être livré.
const SEED_BY_OFFER: Record<string, MockProductDelivery> = {
  "off-gravier-15": { useShopSettings: false, modes: [DeliveryMode.FLAT_RATE], flatRateFee: 150_000 },
  "off-sable-lave": { useShopSettings: false, modes: [DeliveryMode.FLAT_RATE], flatRateFee: 150_000 },
  "off-echafaudage-roulant": { useShopSettings: false, modes: [DeliveryMode.PICKUP], flatRateFee: null },
};

export const INHERIT: MockProductDelivery = { useShopSettings: true, modes: [], flatRateFee: null };

export const seedShopDelivery = (shopId: string): MockShopDelivery => {
  const shop = SHOPS.find((candidate) => candidate.id === shopId);
  return (shop && SEED_BY_SHOP_NAME[shop.nom]) ?? DEFAULT_SHOP_DELIVERY;
};

export const seedOfferDelivery = (offerId: string): MockProductDelivery =>
  SEED_BY_OFFER[offerId] ?? INHERIT;

// ── Normalisation ───────────────────────────
export const sortModes = (modes: readonly unknown[]): DeliveryMode[] =>
  DELIVERY_MODES.filter((mode) => modes.includes(mode));

export const normalizeSettings = (
  modes: readonly unknown[],
  flatRateFee: number | null | undefined
): MockShopDelivery => {
  const sorted = sortModes(modes);
  return {
    modes: sorted,
    flatRateFee: sorted.includes(DeliveryMode.FLAT_RATE) ? (flatRateFee ?? null) : null,
  };
};

/** Retrait et livraison gratuite ne coûtent jamais rien. */
const feeFor = (method: DeliveryMode, flatRateFee: number | null): number =>
  method === DeliveryMode.FLAT_RATE ? (flatRateFee ?? 0) : 0;

const optionsOf = (settings: MockShopDelivery): DeliveryOption[] =>
  settings.modes.map((method) => ({ method, fee: feeFor(method, settings.flatRateFee) }));

/** toShopDeliverySettingsDto */
export const toSettingsDto = (settings: MockShopDelivery): DeliverySettings => {
  const normalized = normalizeSettings(settings.modes, settings.flatRateFee);
  return { ...normalized, options: optionsOf(normalized), currency: CURRENCY };
};

/** toEffectiveDeliveryDto : l'offre suit sa boutique, sauf configuration propre. */
export const resolveEffective = (
  offer: MockProductDelivery,
  shop: MockShopDelivery
): EffectiveDelivery => {
  const custom = offer.useShopSettings === false;
  return { source: custom ? "product" : "shop", ...toSettingsDto(custom ? offer : shop) };
};

// ─────────────────────────────────────────────
//  validateDeliverySettings — message d'erreur, ou null si cohérent.
// ─────────────────────────────────────────────
export const validateSettings = (
  settings: { modes: readonly unknown[]; flatRateFee?: number | null | undefined },
  shop: { adresse?: string | undefined }
): string | null => {
  const unknown = settings.modes.filter((mode) => !isDeliveryMode(mode));
  if (unknown.length > 0) {
    return `Mode de livraison inconnu : ${unknown.join(", ")}. Valeurs autorisées : ${DELIVERY_MODES.join(", ")}.`;
  }

  const modes = sortModes(settings.modes);
  if (modes.length === 0) {
    return "Activez au moins un mode de livraison : sans mode, le produit ne peut être ni livré ni retiré.";
  }

  if (modes.includes(DeliveryMode.FLAT_RATE)) {
    const fee = settings.flatRateFee;
    if (fee === null || fee === undefined) {
      return "Le tarif de la livraison à prix fixe est requis quand ce mode est activé.";
    }
    if (!Number.isSafeInteger(fee) || fee <= 0) {
      return "Le tarif de la livraison à prix fixe doit être un nombre entier de GNF supérieur à 0 (pour une livraison sans frais, activez la livraison gratuite).";
    }
  }

  if (modes.includes(DeliveryMode.PICKUP) && !shop.adresse?.trim()) {
    return "Le retrait en boutique nécessite l'adresse de la boutique : renseignez-la avant d'activer ce mode.";
  }

  return null;
};

/** buildProductDelivery : { useShopSettings: true } revient à l'héritage. */
export const buildProductDelivery = (
  input: { useShopSettings?: boolean; modes?: unknown[]; flatRateFee?: number | null },
  shop: { adresse?: string | undefined }
): { delivery: MockProductDelivery } | { error: string } => {
  if (input.useShopSettings !== false) return { delivery: INHERIT };

  const settings = { modes: input.modes ?? [], flatRateFee: input.flatRateFee };
  const error = validateSettings(settings, shop);
  if (error) return { error };

  return {
    delivery: { useShopSettings: false, ...normalizeSettings(settings.modes, settings.flatRateFee) },
  };
};

// ─────────────────────────────────────────────
//  quoteDelivery — une livraison par boutique.
//  Les offres du catalogue vivant portent déjà leur livraison effective et
//  leur boutique : le devis se calcule directement dessus.
// ─────────────────────────────────────────────
export interface QuoteLine {
  offer: ProductBoutique;
  quantity: number;
}

export interface QuoteSelection {
  byShop?: Readonly<Record<string, DeliveryMode>>;
  all?: DeliveryMode | undefined;
}

export const quoteDelivery = (
  lines: QuoteLine[],
  selection: QuoteSelection = {}
): Omit<DeliveryQuote, "subtotal" | "total"> => {
  const byShop = new Map<string, QuoteLine[]>();
  for (const line of lines) {
    const key = line.offer.boutique?.id ?? "";
    byShop.set(key, [...(byShop.get(key) ?? []), line]);
  }

  const groups = [...byShop.entries()].map(([boutiqueId, group]): DeliveryGroupQuote => {
    const shop = group[0]?.offer.boutique;
    const base: DeliveryGroupQuote = {
      boutiqueId,
      boutiqueNom: shop?.nom,
      pickupAdresse: shop?.adresse,
      items: group.map((line) => ({
        productBoutiqueId: line.offer.id,
        productName: line.offer.product?.name,
        quantity: line.quantity,
      })),
      options: [],
      selectedMethod: null,
      fee: null,
    };

    if (!shop) {
      return { ...base, error: "Cette boutique n'est plus disponible : retirez ses articles du panier." };
    }

    const effective = group.map((line) => line.offer.delivery ?? toSettingsDto(INHERIT));
    const common = DELIVERY_MODES.filter((mode) => effective.every((d) => d.modes.includes(mode)));
    const flatRates = effective.map((d) => d.flatRateFee ?? 0);
    const options = common.map((method) => ({
      method,
      fee: method === DeliveryMode.FLAT_RATE ? Math.max(...flatRates) : 0,
    }));

    if (options.length === 0) {
      return {
        ...base,
        error: `Les articles de ${shop.nom} n'ont aucun mode de livraison en commun : commandez-les séparément.`,
      };
    }

    const requested = selection.byShop?.[boutiqueId] ?? selection.all;
    const chosen = requested ?? (options.length === 1 ? options[0]!.method : undefined);

    if (!chosen) {
      return { ...base, options, error: `Choisissez un mode de livraison pour ${shop.nom}.` };
    }

    const option = options.find((candidate) => candidate.method === chosen);
    if (!option) {
      return {
        ...base,
        options,
        error: `« ${DELIVERY_MODE_LABELS[chosen]} » n'est pas proposé par ${shop.nom} pour ces articles.`,
      };
    }

    return { ...base, options, selectedMethod: option.method, fee: option.fee };
  });

  return {
    groups,
    shippingFee: groups.reduce((sum, g) => sum + (g.fee ?? 0), 0),
    ready: groups.length > 0 && groups.every((g) => g.selectedMethod !== null && !g.error),
    currency: CURRENCY,
  };
};

/** toOrderDeliveries : l'instantané figé dans la commande. */
export const toOrderDeliveries = (quote: Pick<DeliveryQuote, "groups">): OrderDelivery[] =>
  quote.groups
    .filter((g) => g.selectedMethod !== null)
    .map((g) => ({
      boutiqueId: g.boutiqueId,
      boutiqueNom: g.boutiqueNom,
      method: g.selectedMethod!,
      fee: g.fee ?? 0,
      ...(g.selectedMethod === DeliveryMode.PICKUP && g.pickupAdresse
        ? { pickupAdresse: g.pickupAdresse }
        : {}),
    }));

/** Mode résumé : le mode commun, ou `mixed`. */
export const summaryMethod = (methods: DeliveryMode[]): DeliveryMethod =>
  methods.length > 0 && methods.every((m) => m === methods[0]) ? methods[0]! : DeliveryMethod.MIXED;
