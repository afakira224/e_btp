// ─────────────────────────────────────────────
//  WISHLIST - RESPONSE DTO
// ─────────────────────────────────────────────

import type { IWishlist } from "../../models/wishlist.model.js";
import type { IProduct, IProductBoutique } from "../../models/product.model.js";
import type { IShop } from "../../models/boutique.model.js";
import type { IFamille } from "../../models/famille.model.js";
import type { ICategorie } from "../../models/categorie.model.js";
import type { ISousCategorie } from "../../models/sousCategorie.model.js";
import {
  toProductBoutiqueResponseDto,
  type ProductBoutiqueResponseDto,
} from "./product.interfaces.js";

export interface WishlistItemResponseDto {
  productBoutiqueId: string;
  productBoutique?: ProductBoutiqueResponseDto | undefined;
}

export interface WishlistResponseDto {
  id: string;
  userId: string;
  items: WishlistItemResponseDto[];
  totalItems: number;
  createdAt: Date;
  updatedAt: Date;
}

// La wishlist ne stocke que des IDs : le contrôleur résout les documents associés.
export const toWishlistResponseDto = (
  wishlist: IWishlist,
  productBoutiques: IProductBoutique[] = [],
  shops: IShop[] = [],
  products: IProduct[] = [],
  familles: IFamille[] = [],
  categories: ICategorie[] = [],
  sousCategories: ISousCategorie[] = []
): WishlistResponseDto => {
  const items: WishlistItemResponseDto[] = wishlist.items.map((item) => {
    const pb = productBoutiques.find(
      (p) => p._id.toString() === item.productBoutiqueId.toString()
    );
    const shop = pb
      ? shops.find((s) => s._id.toString() === pb.boutiqueId.toString())
      : undefined;
    const product = pb
      ? products.find((pr) => pr._id.toString() === pb.productId.toString())
      : undefined;

    return {
      productBoutiqueId: item.productBoutiqueId.toString(),
      productBoutique: pb
        ? toProductBoutiqueResponseDto(pb, shop, product, familles, categories, sousCategories)
        : undefined,
    };
  });

  return {
    id: wishlist._id.toString(),
    userId: wishlist.userId.toString(),
    items,
    totalItems: items.length,
    createdAt: wishlist.createdAt,
    updatedAt: wishlist.updatedAt,
  };
};
