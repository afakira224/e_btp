import { Types } from "mongoose";
import {
  CURRENCY,
  DEFAULT_FLAT_RATE_FEE,
  DEFAULT_SHOP_MODES,
  DELIVERY_MODE_LABELS,
  DELIVERY_MODES,
  DeliveryMethod,
  isDeliveryMode,
  type DeliveryMode,
  type IOrderDelivery,
  type IProductDelivery,
  type IShopDelivery,
} from "../../models/delivery.model.js";
import type { IShop } from "../../models/boutique.model.js";
import type { IProductBoutique } from "../../models/product.model.js";

// ─────────────────────────────────────────────
//  Règles de livraison
//  Fonctions pures, sans accès à la base : les contrôleurs chargent les
//  documents, ces règles décident. Le checkout et le devis du panier passent
//  par le même calcul, ce que le client voit est donc ce qu'il paiera.
//
//  Règle de facturation du prix fixe : une livraison par boutique. Les
//  articles d'une même boutique partent ensemble, leurs frais ne s'additionnent
//  pas : la livraison est facturée une fois, au tarif le plus élevé parmi ses
//  articles (un produit encombrant au tarif propre impose son tarif au colis).
//  Deux boutiques font deux livraisons, donc deux frais.
// ─────────────────────────────────────────────

export interface DeliveryOption {
  method: DeliveryMode;
  fee: number;
}

/** Livraison qui s'applique réellement à une offre, héritée ou propre. */
export interface EffectiveDelivery {
  source: "shop" | "product";
  modes: DeliveryMode[];
  /** Tarif du prix fixe ; null quand ce mode n'est pas proposé. */
  flatRateFee: number | null;
}

/** Modes dédoublonnés, dans l'ordre d'affichage (retrait, gratuite, prix fixe). */
export const sortModes = (modes: readonly unknown[]): DeliveryMode[] =>
  DELIVERY_MODES.filter((mode) => modes.includes(mode));

/** Réglages de la boutique, avec les valeurs par défaut si elle n'en a jamais eu. */
export const shopDeliveryOf = (shop: Pick<IShop, "delivery">): IShopDelivery =>
  shop.delivery ?? { modes: [...DEFAULT_SHOP_MODES], flatRateFee: DEFAULT_FLAT_RATE_FEE };

/** Normalise des réglages : modes triés, tarif conservé seulement si le prix fixe est actif. */
export const normalizeSettings = (modes: readonly unknown[], flatRateFee: number | null | undefined): IShopDelivery => {
  const sorted = sortModes(modes);
  return {
    modes: sorted,
    flatRateFee: sorted.includes(DeliveryMethod.FLAT_RATE) ? flatRateFee ?? null : null,
  };
};

export const resolveEffectiveDelivery = (
  offer: Pick<IProductBoutique, "delivery">,
  shop: Pick<IShop, "delivery">
): EffectiveDelivery => {
  const custom = offer.delivery?.useShopSettings === false;
  const settings = custom ? offer.delivery : shopDeliveryOf(shop);
  const { modes, flatRateFee } = normalizeSettings(settings.modes ?? [], settings.flatRateFee);
  return { source: custom ? "product" : "shop", modes, flatRateFee };
};

/** Frais d'un mode. Retrait et livraison gratuite ne coûtent jamais rien. */
export const feeFor = (method: DeliveryMode, flatRateFee: number | null): number =>
  method === DeliveryMethod.FLAT_RATE ? flatRateFee ?? 0 : 0;

export const optionsOf = (delivery: Pick<EffectiveDelivery, "modes" | "flatRateFee">): DeliveryOption[] =>
  delivery.modes.map((method) => ({ method, fee: feeFor(method, delivery.flatRateFee) }));

// ─────────────────────────────────────────────
//  Validation métier d'une configuration (boutique ou produit)
//  Renvoie le message d'erreur, ou null si la configuration est cohérente.
// ─────────────────────────────────────────────
export const validateDeliverySettings = (
  settings: { modes: readonly unknown[]; flatRateFee?: number | null | undefined },
  shop: Pick<IShop, "adresse">
): string | null => {
  const unknown = settings.modes.filter((mode) => !isDeliveryMode(mode));
  if (unknown.length > 0) {
    return `Mode de livraison inconnu : ${unknown.join(", ")}. Valeurs autorisées : ${DELIVERY_MODES.join(", ")}.`;
  }

  const modes = sortModes(settings.modes);
  if (modes.length === 0) {
    return "Activez au moins un mode de livraison : sans mode, le produit ne peut être ni livré ni retiré.";
  }

  if (modes.includes(DeliveryMethod.FLAT_RATE)) {
    const fee = settings.flatRateFee;
    if (fee === null || fee === undefined) {
      return "Le tarif de la livraison à prix fixe est requis quand ce mode est activé.";
    }
    if (!Number.isSafeInteger(fee) || fee <= 0) {
      return "Le tarif de la livraison à prix fixe doit être un nombre entier de GNF supérieur à 0 (pour une livraison sans frais, activez la livraison gratuite).";
    }
  }

  if (modes.includes(DeliveryMethod.PICKUP) && !shop.adresse?.trim()) {
    return "Le retrait en boutique nécessite l'adresse de la boutique : renseignez-la avant d'activer ce mode.";
  }

  return null;
};

// ─────────────────────────────────────────────
//  Livraison d'une offre à partir de ce qu'envoie le vendeur.
//  { useShopSettings: true } revient à l'héritage ; sinon la configuration
//  propre est validée puis normalisée.
// ─────────────────────────────────────────────
export interface ProductDeliveryInput {
  useShopSettings?: boolean | undefined;
  modes?: unknown[] | undefined;
  flatRateFee?: number | null | undefined;
}

export const buildProductDelivery = (
  input: ProductDeliveryInput,
  shop: Pick<IShop, "adresse">
): { delivery: IProductDelivery } | { error: string } => {
  if (input.useShopSettings !== false) {
    return { delivery: { useShopSettings: true, modes: [], flatRateFee: null } };
  }

  const settings = { modes: input.modes ?? [], flatRateFee: input.flatRateFee };
  const error = validateDeliverySettings(settings, shop);
  if (error) return { error };

  return { delivery: { useShopSettings: false, ...normalizeSettings(settings.modes, settings.flatRateFee) } };
};

// ─────────────────────────────────────────────
//  Devis de livraison d'un panier
//  Une livraison par boutique. Ses modes sont ceux que tous ses articles
//  acceptent ; le client en choisit un, ou il est retenu d'office s'il est seul.
// ─────────────────────────────────────────────
export interface DeliveryQuoteLine {
  offer: Pick<IProductBoutique, "_id" | "boutiqueId" | "delivery">;
  quantity: number;
  productName?: string | undefined;
}

export interface DeliveryGroupQuote {
  boutiqueId: string;
  boutiqueNom?: string | undefined;
  /** Adresse de retrait : celle de la boutique. */
  pickupAdresse?: string | undefined;
  items: { productBoutiqueId: string; productName?: string | undefined; quantity: number }[];
  options: DeliveryOption[];
  selectedMethod: DeliveryMode | null;
  /** Frais du mode retenu ; null tant qu'aucun mode valide n'est retenu. */
  fee: number | null;
  /** Ce qui empêche cette livraison de partir. */
  error?: string | undefined;
}

export interface DeliveryQuote {
  groups: DeliveryGroupQuote[];
  shippingFee: number;
  /** Toutes les livraisons ont un mode valide : la commande peut partir. */
  ready: boolean;
  currency: typeof CURRENCY;
}

/** Choix du client : un mode par boutique, et/ou un mode commun à toutes. */
export interface DeliverySelection {
  byShop?: ReadonlyMap<string, DeliveryMode> | undefined;
  all?: DeliveryMode | undefined;
}

/** Lit le choix du client dans un corps déjà validé (deliverySelectionFields). */
export const selectionFromBody = (body: {
  deliveryMethod?: unknown;
  deliveries?: unknown;
}): DeliverySelection => {
  const byShop = new Map<string, DeliveryMode>();
  if (Array.isArray(body.deliveries)) {
    for (const entry of body.deliveries as { boutiqueId?: unknown; method?: unknown }[]) {
      if (entry?.boutiqueId && isDeliveryMode(entry.method)) byShop.set(String(entry.boutiqueId), entry.method);
    }
  }
  return {
    byShop,
    all: isDeliveryMode(body.deliveryMethod) ? body.deliveryMethod : undefined,
  };
};

export const quoteDelivery = (
  lines: DeliveryQuoteLine[],
  shops: Pick<IShop, "_id" | "nom" | "adresse" | "delivery">[],
  selection: DeliverySelection = {}
): DeliveryQuote => {
  // Regroupement par boutique, dans l'ordre d'apparition au panier.
  const byShop = new Map<string, DeliveryQuoteLine[]>();
  for (const line of lines) {
    const key = line.offer.boutiqueId.toString();
    byShop.set(key, [...(byShop.get(key) ?? []), line]);
  }

  const groups = [...byShop.entries()].map(([boutiqueId, group]): DeliveryGroupQuote => {
    const shop = shops.find((s) => s._id.toString() === boutiqueId);
    const base: DeliveryGroupQuote = {
      boutiqueId,
      boutiqueNom: shop?.nom,
      pickupAdresse: shop?.adresse,
      items: group.map((line) => ({
        productBoutiqueId: line.offer._id.toString(),
        productName: line.productName,
        quantity: line.quantity,
      })),
      options: [],
      selectedMethod: null,
      fee: null,
    };

    if (!shop) {
      return { ...base, error: "Cette boutique n'est plus disponible : retirez ses articles du panier." };
    }

    const effective = group.map((line) => resolveEffectiveDelivery(line.offer, shop));
    const common = DELIVERY_MODES.filter((mode) => effective.every((d) => d.modes.includes(mode)));
    const flatRates = effective.map((d) => d.flatRateFee ?? 0);
    const options = common.map((method) => ({
      method,
      fee: method === DeliveryMethod.FLAT_RATE ? Math.max(...flatRates) : 0,
    }));

    if (options.length === 0) {
      return {
        ...base,
        error: `Les articles de ${shop.nom} n'ont aucun mode de livraison en commun : commandez-les séparément.`,
      };
    }

    const requested = selection.byShop?.get(boutiqueId) ?? selection.all;
    const chosen = requested ?? (options.length === 1 ? options[0]!.method : undefined);

    if (!chosen) {
      return { ...base, options, error: `Choisissez un mode de livraison pour ${shop.nom}.` };
    }

    const option = options.find((o) => o.method === chosen);
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

/** Instantané des livraisons d'un devis complet, tel qu'il est figé dans la commande. */
export const toOrderDeliveries = (quote: DeliveryQuote): IOrderDelivery[] =>
  quote.groups.map((g) => ({
    boutiqueId: new Types.ObjectId(g.boutiqueId),
    boutiqueNom: g.boutiqueNom,
    method: g.selectedMethod!,
    fee: g.fee ?? 0,
    // L'adresse de retrait ne sert qu'au retrait.
    ...(g.selectedMethod === DeliveryMethod.PICKUP && g.pickupAdresse ? { pickupAdresse: g.pickupAdresse } : {}),
  }));

/** Mode résumé d'une commande : le mode commun, ou MIXED. */
export const summaryMethod = (methods: DeliveryMode[]): DeliveryMethod =>
  methods.length > 0 && methods.every((m) => m === methods[0]) ? methods[0]! : DeliveryMethod.MIXED;
