// ─────────────────────────────────────────────
//  PRODUCT - RESPONSE DTO

import type { IShop } from "../../models/boutique.model.js";
import type { ICategorie } from "../../models/categorie.model.js";
import type { IFamille } from "../../models/famille.model.js";
import type { IProduct, IProductBoutique } from "../../models/product.model.js";
import type { ISousCategorie } from "../../models/sousCategorie.model.js";
import { toCategorieResponseDto, type CategorieResponseDto } from "./Categorie.interfaces.js";
import { toFamilleResponseDto, type FamilleResponseDto } from "./Famille.interfaces.js";
import { toShopResponseDto, type ShopResponseDto } from "./Shop.interfaces.js";
import { toEffectiveDeliveryDto, type EffectiveDeliveryDto } from "./Delivery.interfaces.js";
import { toSousCategorieResponseDto, type SousCategorieResponseDto } from "./SousCategorie.interfaces.js";
import { discountedPrice, unitPriceFor } from "../helpers/promotion.rules.js";

// ─────────────────────────────────────────────
export interface ProductResponseDto {
  id: string;
  name: string;
  description: string;
  urlVideo?: string | undefined;
  urlImages: string[];

  familles: FamilleResponseDto[];
  categories: CategorieResponseDto[];
  sousCategories: SousCategorieResponseDto[];

  createdAt: Date;
  updatedAt: Date;
}

export const toProductResponseDto = (product: IProduct,familles:IFamille[] =[],categories:ICategorie[] =[],sousCategories:ISousCategorie[] =[]): ProductResponseDto => ({
  id: product._id.toString(),
  name: product.name,
  description: product.description,
  urlVideo: product.urlVideo,
  urlImages: product.urlImages,
  familles: familles.filter(f=> f._id.toString() === product.familleId.toString()).map(fm => toFamilleResponseDto(fm)),
  categories: categories.filter(c => c._id.toString() == product.categoryId.toString()).map(ct => toCategorieResponseDto(ct)),
  sousCategories: sousCategories.filter(s=> s._id.toString() == product.sousCategoryId.toString()).map(sc=> toSousCategorieResponseDto(sc)),
  createdAt: product.createdAt,
  updatedAt: product.updatedAt,
});

// ─────────────────────────────────────────────
//  PRIX D'UNE OFFRE
//  Calculé par le serveur : le front affiche, il ne compare pas lui-même
//  price et discountPrice.
// ─────────────────────────────────────────────
export interface OfferPricingDto {
  /** Prix de base de l'offre, avant promotion. */
  basePrice: number;
  /** Prix d'une unité, promotion comprise. */
  price: number;
  /** Prix barré, le plus bas des 30 derniers jours : présent seulement quand la remise affichée atteint 5 %. */
  referencePrice?: number | undefined;
  percent?: number | undefined;
  endsAt?: Date | undefined;
  promotion?: { id: string; type: string; label: string; flash: boolean; campaignId?: string | undefined } | undefined;
  /** Prix par quantité : le prix unitaire à partir de chaque palier. */
  tiers: { minQuantity: number; percent: number; unitPrice: number }[];
}

export const toOfferPricingDto = (offer: Pick<IProductBoutique, "price" | "discountPrice" | "promo" | "quantityTiers" | "stock">): OfferPricingDto => {
  const promo = offer.promo;
  // Une offre en rupture ne s'affiche plus « en promotion ».
  const shown = !!promo && promo.percent > 0 && offer.stock > 0;
  return {
    basePrice: offer.price,
    price: unitPriceFor(offer, 1),
    ...(shown ? { referencePrice: promo.referencePrice, percent: promo.percent } : {}),
    ...(promo
      ? {
          endsAt: promo.endsAt,
          promotion: {
            id: String(promo.promotionId),
            type: promo.type,
            label: promo.label,
            flash: promo.flash,
            ...(promo.campaignId ? { campaignId: String(promo.campaignId) } : {}),
          },
        }
      : {}),
    tiers: (offer.quantityTiers ?? []).map((tier) => ({
      minQuantity: tier.minQuantity,
      percent: tier.percent,
      unitPrice: Math.min(unitPriceFor(offer, 1), discountedPrice(offer.price, undefined, tier.percent)),
    })),
  };
};

// ─────────────────────────────────────────────
//  PRODUCT BOUTIQUE - RESPONSE DTO
// ─────────────────────────────────────────────
export interface ProductBoutiqueResponseDto {
  id: string;

  boutique?: ShopResponseDto | undefined;
  product?: ProductResponseDto | undefined;

  productId: string;

  urlImages: string[];
  price: number;
  /** Prix promotionnel en vigueur (calculé) ; `pricing` dit tout le reste. */
  discountPrice?: number | undefined;
  pricing: OfferPricingDto;
  stock: number;
  isFeatured: boolean;
  /** Produit phare de la vitrine (1 à 6). */
  featuredRank?: number | undefined;
  tags: string[];
  rating?: number | undefined;
  reviewsCount?: number | undefined;

  /**
   * Livraison effective : celle de la boutique ou celle propre à l'offre.
   * Absente quand la boutique n'est pas résolue (elle est indispensable au calcul).
   */
  delivery?: EffectiveDeliveryDto | undefined;

  /** Présent seulement quand la modération a masqué l'offre (lu par sa boutique). */
  hidden?: { at: Date; reason?: string | undefined } | undefined;

  createdAt: Date;
  updatedAt: Date;
}

export const toProductBoutiqueResponseDto = (
  productBoutique: IProductBoutique,
  boutique?: IShop,
  product?: IProduct,
  familles: IFamille[] = [],
  categories: ICategorie[] = [],
  sousCategories: ISousCategorie[] = []
): ProductBoutiqueResponseDto => ({
  id: productBoutique._id.toString(),
  productId: productBoutique.productId.toString(),
    boutique: boutique
    ? toShopResponseDto(boutique)
    : undefined,
  product: product
    ? toProductResponseDto(
        product,
        familles,
        categories,
        sousCategories
      )
    : undefined,
  urlImages: productBoutique.urlImages,
  price: productBoutique.price,
  discountPrice: productBoutique.discountPrice ?? undefined,
  pricing: toOfferPricingDto(productBoutique),
  stock: productBoutique.stock,
  isFeatured: productBoutique.isFeatured,
  ...(productBoutique.featuredRank ? { featuredRank: productBoutique.featuredRank } : {}),
  tags: productBoutique.tags,
  rating: productBoutique.rating,
  reviewsCount: productBoutique.reviewsCount,
  delivery: boutique ? toEffectiveDeliveryDto(productBoutique, boutique) : undefined,
  ...(productBoutique.hiddenAt
    ? { hidden: { at: productBoutique.hiddenAt, reason: productBoutique.hiddenReason ?? undefined } }
    : {}),
  createdAt: productBoutique.createdAt,
  updatedAt: productBoutique.updatedAt,
});