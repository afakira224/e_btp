import { Schema, Types } from "mongoose";

// ─────────────────────────────────────────────
//  LIVRAISON
//  Modes de livraison et sous-schémas partagés par la boutique (réglages par
//  défaut), l'offre (héritage ou personnalisation) et la commande (instantané).
//
//  Les montants sont en GNF et toujours entiers : le franc guinéen n'a pas de
//  subdivision en circulation, et un entier JavaScript reste exact jusqu'à
//  2^53. Aucun calcul de frais ne passe par un nombre à virgule.
// ─────────────────────────────────────────────
export const CURRENCY = "GNF";

export enum DeliveryMethod {
  // Modes proposés par les boutiques.
  PICKUP = "pickup", // retrait en boutique : toujours gratuit
  FREE = "free", // livraison offerte : toujours gratuite
  FLAT_RATE = "flat_rate", // livraison à prix fixe : tarif de la boutique ou du produit

  // Commandes passées avant les modes par boutique : lisibles, jamais proposés.
  STANDARD = "standard",
  EXPRESS = "express",

  // Résumé d'une commande dont les boutiques n'ont pas toutes le même mode.
  // Le détail est dans `deliveries`.
  MIXED = "mixed",
}

/** Les trois modes qu'une boutique ou un produit peut proposer, dans l'ordre d'affichage. */
export const DELIVERY_MODES = [
  DeliveryMethod.PICKUP,
  DeliveryMethod.FREE,
  DeliveryMethod.FLAT_RATE,
] as const;

export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const isDeliveryMode = (value: unknown): value is DeliveryMode =>
  (DELIVERY_MODES as readonly unknown[]).includes(value);

export const DELIVERY_MODE_LABELS: Record<DeliveryMode, string> = {
  [DeliveryMethod.PICKUP]: "Retrait en boutique",
  [DeliveryMethod.FREE]: "Livraison gratuite",
  [DeliveryMethod.FLAT_RATE]: "Livraison à prix fixe",
};

/** Frais des anciens modes, conservés pour les commandes passées avant la migration. */
export const LEGACY_DELIVERY_FEES: Record<DeliveryMethod.STANDARD | DeliveryMethod.EXPRESS, number> = {
  [DeliveryMethod.STANDARD]: 25_000,
  [DeliveryMethod.EXPRESS]: 50_000,
};

// Réglages d'une boutique qui n'a jamais configuré sa livraison : ils
// reproduisent l'offre d'avant la migration (retrait gratuit + livraison
// standard à 25 000 GNF), pour que rien ne change tant qu'elle n'y touche pas.
export const DEFAULT_FLAT_RATE_FEE = LEGACY_DELIVERY_FEES[DeliveryMethod.STANDARD];
export const DEFAULT_SHOP_MODES: readonly DeliveryMode[] = [
  DeliveryMethod.PICKUP,
  DeliveryMethod.FLAT_RATE,
];

// ─────────────────────────────────────────────
//  Réglages par défaut d'une boutique
// ─────────────────────────────────────────────
export interface IShopDelivery {
  modes: DeliveryMode[];
  /** Tarif du prix fixe ; null quand ce mode n'est pas actif. */
  flatRateFee: number | null;
}

// ─────────────────────────────────────────────
//  Livraison d'une offre (product_boutique)
//  useShopSettings = true : l'offre suit les réglages courants de sa boutique,
//  modes et flatRateFee sont ignorés (et laissés vides).
//  useShopSettings = false : configuration propre, jamais écrasée par la boutique.
// ─────────────────────────────────────────────
export interface IProductDelivery {
  useShopSettings: boolean;
  modes: DeliveryMode[];
  flatRateFee: number | null;
}

// ─────────────────────────────────────────────
//  Instantané d'une livraison dans une commande : une entrée par boutique.
//  Mode et frais figés au checkout ; les réglages ultérieurs ne les touchent pas.
// ─────────────────────────────────────────────
export interface IOrderDelivery {
  boutiqueId: Types.ObjectId;
  boutiqueNom?: string | undefined;
  method: DeliveryMode;
  fee: number;
  /** Adresse de la boutique au moment de la commande, pour un retrait. */
  pickupAdresse?: string | undefined;
}

const integerFee = {
  validator: (value: number | null | undefined) => value == null || Number.isSafeInteger(value),
  message: "Les frais de livraison doivent être un nombre entier de GNF.",
};

export const shopDeliverySchema = new Schema<IShopDelivery>(
  {
    modes: {
      type: [String],
      enum: DELIVERY_MODES,
      default: () => [...DEFAULT_SHOP_MODES],
    },
    flatRateFee: { type: Number, min: 0, default: DEFAULT_FLAT_RATE_FEE, validate: integerFee },
  },
  { _id: false }
);

export const productDeliverySchema = new Schema<IProductDelivery>(
  {
    useShopSettings: { type: Boolean, default: true },
    modes: { type: [String], enum: DELIVERY_MODES, default: [] },
    flatRateFee: { type: Number, min: 0, default: null, validate: integerFee },
  },
  { _id: false }
);

export const orderDeliverySchema = new Schema<IOrderDelivery>(
  {
    boutiqueId: { type: Schema.Types.ObjectId, ref: "shop", required: true },
    boutiqueNom: { type: String },
    method: { type: String, enum: DELIVERY_MODES, required: true },
    fee: { type: Number, required: true, min: 0, validate: integerFee },
    pickupAdresse: { type: String },
  },
  { _id: false }
);
