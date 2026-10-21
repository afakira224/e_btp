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
//  PRODUCT BOUTIQUE - RESPONSE DTO
// ─────────────────────────────────────────────
export interface ProductBoutiqueResponseDto {
  id: string;

  boutique?: ShopResponseDto | undefined;
  product?: ProductResponseDto | undefined;

  productId: string;

  urlImages: string[];
  price: number;
  discountPrice?: number | undefined;
  stock: number;
  isFeatured: boolean;
  tags: string[];
  rating?: number | undefined;
  reviewsCount?: number | undefined;

  /**
   * Livraison effective : celle de la boutique ou celle propre à l'offre.
   * Absente quand la boutique n'est pas résolue (elle est indispensable au calcul).
   */
  delivery?: EffectiveDeliveryDto | undefined;

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
  discountPrice: productBoutique.discountPrice,
  stock: productBoutique.stock,
  isFeatured: productBoutique.isFeatured,
  tags: productBoutique.tags,
  rating: productBoutique.rating,
  reviewsCount: productBoutique.reviewsCount,
  delivery: boutique ? toEffectiveDeliveryDto(productBoutique, boutique) : undefined,
  createdAt: productBoutique.createdAt,
  updatedAt: productBoutique.updatedAt,
});