import type { EffectiveDelivery } from "../../delivery";
import type { Shop } from "../../shop";
import type { Categorie, Famille, SousCategorie } from "../../taxonomy";

// ─────────────────────────────────────────────
//  Produit et offre boutique.
//
//  Miroir strict des DTO de retour du back
//  (Back/src/shared/interfaces/product.interfaces.ts). Deux points à ne pas
//  confondre avec les modèles Mongoose :
//
//   • le DTO expose `id`, pas `_id` ;
//   • il **imbrique** la taxonomie et la boutique au lieu de transmettre
//     des identifiants. `ProductResponseDto` porte `familles`,
//     `categories` et `sousCategories` — des tableaux, alimentés par
//     filtrage sur l'identifiant correspondant, donc d'au plus un élément
//     en pratique.
//
//  Les DTO déclarent `Date` ; sérialisés en JSON, les horodatages arrivent
//  ici en chaînes.
// ─────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  description: string;
  urlVideo?: string | undefined;
  urlImages: string[];

  familles: Famille[];
  categories: Categorie[];
  sousCategories: SousCategorie[];

  createdAt: string;
  updatedAt: string;
}

/**
 * Prix d'une offre, calculé par le serveur (OfferPricingDto) : le prix
 * promotionnel en vigueur, le prix barré (le plus bas des 30 derniers jours,
 * présent seulement à partir de 5 % de remise), la fin de la promotion et
 * le prix par quantité.
 */
export interface OfferPricing {
  basePrice: number;
  price: number;
  referencePrice?: number | undefined;
  percent?: number | undefined;
  endsAt?: string | undefined;
  promotion?: { id: string; type: string; label: string; flash: boolean; campaignId?: string | undefined } | undefined;
  tiers: { minQuantity: number; percent: number; unitPrice: number }[];
}

/** Place sponsorisée : un boost de la boutique la paie. */
export interface Sponsored {
  boostId: string;
  kind: "promotion" | "product";
  /** « Pourquoi je vois ceci ? » */
  why: string;
}

export interface ProductBoutique {
  id: string;

  /** Absents quand l'appelant n'a pas demandé la jointure. */
  boutique?: Shop | undefined;
  product?: Product | undefined;

  productId: string;

  urlImages: string[];
  price: number;
  /** Absent — et non `null` — quand il n'y a pas de remise. */
  /** Absent ou null quand l'offre n'est pas remisée (le back envoie null). */
  discountPrice?: number | null | undefined;
  /** Calculé par le serveur ; absent seulement d'un DTO antérieur aux promotions. */
  pricing?: OfferPricing | undefined;
  stock: number;
  isFeatured: boolean;
  /** Produit phare de la vitrine (1 à 6). */
  featuredRank?: number | undefined;
  /** Présent sur une place sponsorisée. */
  sponsored?: Sponsored | undefined;
  tags: string[];
  rating?: number | undefined;
  reviewsCount?: number | undefined;

  /**
   * Livraison effective : celle de la boutique (`source: "shop"`) ou celle
   * propre à l'offre (`source: "product"`). Absente quand le back n'a pas
   * résolu la boutique, indispensable au calcul.
   */
  delivery?: EffectiveDelivery | undefined;

  /** Présent seulement quand la modération a masqué l'offre : lu par sa boutique. */
  hidden?: { at: string; reason?: string | undefined } | undefined;

  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────
//  Accès aux parties imbriquées.
//  `product` et `boutique` sont facultatifs dans le DTO : ces lecteurs
//  concentrent l'incertitude ici plutôt que dans chaque composant.
// ─────────────────────────────────────────────

export const productName = (offer: ProductBoutique): string =>
  offer.product?.name ?? "Produit";

export const productDescription = (offer: ProductBoutique): string =>
  offer.product?.description ?? "";

export const shopName = (offer: ProductBoutique): string =>
  offer.boutique?.nom ?? "Boutique";

/** Première image de l'offre, sinon celle de la fiche produit. */
export const productImage = (offer: ProductBoutique): string | undefined =>
  offer.urlImages[0] ?? offer.product?.urlImages[0];

export const familleOf = (offer: ProductBoutique): Famille | undefined =>
  offer.product?.familles[0];

export const categorieOf = (offer: ProductBoutique): Categorie | undefined =>
  offer.product?.categories[0];

export const sousCategorieOf = (offer: ProductBoutique): SousCategorie | undefined =>
  offer.product?.sousCategories[0];

// ─────────────────────────────────────────────
//  Règles de prix
// ─────────────────────────────────────────────

/** Prix réellement payé pour une unité : celui que le serveur a calculé. */
export const effectivePrice = (offer: ProductBoutique): number =>
  offer.pricing?.price ??
  (offer.discountPrice != null && offer.discountPrice < offer.price ? offer.discountPrice : offer.price);

/**
 * Prix barré : le prix de référence (le plus bas des 30 derniers jours),
 * seulement quand la remise affichée atteint 5 %. Un prix monté puis
 * « barré » n'en montre donc aucun.
 */
export const referencePrice = (offer: ProductBoutique): number | null =>
  offer.pricing ? (offer.pricing.referencePrice ?? null) : hasLegacyDiscount(offer) ? offer.price : null;

const hasLegacyDiscount = (offer: ProductBoutique): boolean =>
  offer.discountPrice != null && offer.discountPrice < offer.price;

/** L'offre s'affiche-t-elle « en promotion » (badge et prix barré) ? */
export const hasDiscount = (offer: ProductBoutique): boolean =>
  offer.pricing ? (offer.pricing.percent ?? 0) > 0 : hasLegacyDiscount(offer);

/** Remise affichée, en pourcentage — jamais affichée si elle est nulle. */
export const discountPercent = (offer: ProductBoutique): number | null => {
  if (offer.pricing) return offer.pricing.percent ? offer.pricing.percent : null;
  if (!hasLegacyDiscount(offer) || offer.price <= 0) return null;
  return Math.round((1 - effectivePrice(offer) / offer.price) * 100);
};

/** Fin de la promotion en cours, si elle en a une (le prix par quantité n'en a pas). */
export const promotionEnd = (offer: ProductBoutique): string | null => {
  const end = offer.pricing?.endsAt;
  return end && new Date(end).getFullYear() < 9000 ? end : null;
};

export const isFlashSale = (offer: ProductBoutique): boolean => !!offer.pricing?.promotion?.flash;

/** Prix d'une unité pour une quantité : le palier atteint, s'il est plus bas. */
export const unitPriceFor = (offer: ProductBoutique, quantity: number): number => {
  const base = effectivePrice(offer);
  const tiers = (offer.pricing?.tiers ?? []).filter((tier) => quantity >= tier.minQuantity);
  return tiers.reduce((lowest, tier) => Math.min(lowest, tier.unitPrice), base);
};

export const isOutOfStock = (offer: ProductBoutique): boolean => offer.stock <= 0;

/** Seuil d'alerte : en dessous, l'urgence est réelle et mérite d'être dite. */
export const isLowStock = (offer: ProductBoutique): boolean =>
  offer.stock > 0 && offer.stock <= 5;

// ─────────────────────────────────────────────
//  Formatage monétaire
//  Le catalogue est en francs guinéens : aucune décimale, séparateur de
//  milliers par espace insécable.
// ─────────────────────────────────────────────
const gnf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export const formatPrice = (amount: number): string => `${gnf.format(amount)} GNF`;

/** Une offre est « nouvelle » si elle a moins de 30 jours. */
export const isNew = (offer: ProductBoutique): boolean => {
  const age = Date.now() - new Date(offer.createdAt).getTime();
  return age < 30 * 24 * 60 * 60 * 1000;
};
