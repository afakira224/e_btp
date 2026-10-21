import { formatPrice } from "../../product";

// ─────────────────────────────────────────────
//  Livraison — miroir de Back/src/models/delivery.model.ts et des DTO de
//  Back/src/shared/interfaces/Delivery.interfaces.ts.
//
//  Le front n'est jamais la source de vérité des frais : il affiche ceux que
//  le serveur calcule (options, devis du panier, instantané de commande) et
//  n'envoie que des modes, jamais de montant.
//
//  Les montants sont des entiers en GNF : le franc guinéen n'a pas de
//  subdivision, aucun calcul ne passe par un nombre à virgule.
// ─────────────────────────────────────────────

export const DeliveryMode = {
  PICKUP: "pickup",
  FREE: "free",
  FLAT_RATE: "flat_rate",
} as const;

export type DeliveryMode = (typeof DeliveryMode)[keyof typeof DeliveryMode];

/** Les trois modes, dans l'ordre d'affichage du back. */
export const DELIVERY_MODES: readonly DeliveryMode[] = [
  DeliveryMode.PICKUP,
  DeliveryMode.FREE,
  DeliveryMode.FLAT_RATE,
];

export const DELIVERY_MODE_LABELS: Record<DeliveryMode, string> = {
  pickup: "Retrait en boutique",
  free: "Livraison gratuite",
  flat_rate: "Livraison à prix fixe",
};

/** Ce que chaque mode promet au client, en une ligne. */
export const DELIVERY_MODE_HINTS: Record<DeliveryMode, string> = {
  pickup: "Le client récupère sa commande à l'adresse de la boutique. Aucun frais.",
  free: "La boutique livre sans frais pour le client.",
  flat_rate: "Un tarif unique par livraison, fixé par la boutique.",
};

export const CURRENCY = "GNF";

/** Un mode proposé et ses frais, calculés par le serveur. */
export interface DeliveryOption {
  method: DeliveryMode;
  fee: number;
}

/** Réglages de livraison tels que le back les expose (DeliverySettingsDto). */
export interface DeliverySettings {
  modes: DeliveryMode[];
  /** Tarif du prix fixe ; null quand ce mode n'est pas actif. */
  flatRateFee: number | null;
  options: DeliveryOption[];
  currency: string;
}

/** Livraison qui s'applique à une offre, et d'où elle vient (EffectiveDeliveryDto). */
export interface EffectiveDelivery extends DeliverySettings {
  source: "shop" | "product";
}

/** GET / PUT /shops/:id/delivery : réglages de la boutique et leur portée. */
export interface ShopDeliveryOverview extends DeliverySettings {
  boutiqueId: string;
  adresse?: string | undefined;
  /** Produits qui suivent ces réglages. */
  inheritingProducts: number;
  /** Produits personnalisés, que ces réglages ne touchent pas. */
  customProducts: number;
}

/** Ce que le vendeur envoie : des modes et un tarif, rien d'autre. */
export interface DeliverySettingsInput {
  modes: DeliveryMode[];
  flatRateFee: number | null;
}

/** Champ `delivery` d'une offre envoyée au back. */
export type ProductDeliveryInput =
  | { useShopSettings: true }
  | ({ useShopSettings: false } & DeliverySettingsInput);

// ─────────────────────────────────────────────
//  Devis du panier — POST /cart/:userId/delivery-quote
//  Une livraison par boutique ; ses modes sont ceux que tous ses articles
//  acceptent.
// ─────────────────────────────────────────────
export interface DeliveryGroupQuote {
  boutiqueId: string;
  boutiqueNom?: string | undefined;
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
  currency: string;
  subtotal: number;
  total: number;
}

/** Choix du client : un mode par boutique. */
export type DeliverySelection = Readonly<Record<string, DeliveryMode>>;

// ─────────────────────────────────────────────
//  Lectures utiles à l'affichage
// ─────────────────────────────────────────────

export const isDeliveryMode = (value: unknown): value is DeliveryMode =>
  (DELIVERY_MODES as readonly unknown[]).includes(value);

/** « Gratuit » plutôt que « 0 GNF » : c'est ce que le client veut lire. */
export const formatFee = (fee: number): string => (fee > 0 ? formatPrice(fee) : "Gratuit");

/** « Retrait en boutique · Livraison à prix fixe (25 000 GNF) » */
export const describeOptions = (options: readonly DeliveryOption[]): string =>
  options
    .map((option) =>
      option.method === DeliveryMode.FLAT_RATE
        ? `${DELIVERY_MODE_LABELS[option.method]} (${formatPrice(option.fee)})`
        : DELIVERY_MODE_LABELS[option.method]
    )
    .join(" · ");
