// ─────────────────────────────────────────────
//  CART - RESPONSE DTO
// ─────────────────────────────────────────────

import type { ICart } from "../../models/cart.model.js";
import type { IProduct, IProductBoutique } from "../../models/product.model.js";
import { unitPriceFor } from "../helpers/promotion.rules.js";
import { toOfferPricingDto, type OfferPricingDto } from "./product.interfaces.js";

export interface CartItemResponseDto {
  productBoutiqueId: string;
  productId?: string | undefined;
  productName?: string | undefined;
  urlImages: string[];
  price: number;
  discountPrice?: number | undefined;
  /** Prix unitaire en vigueur pour cette quantité : promotion et palier compris. */
  unitPrice: number;
  /** Prix unitaire vu à l'ajout ; différent de unitPrice quand une promotion a commencé ou fini depuis. */
  addedUnitPrice: number;
  priceChanged: boolean;
  /** Économie de la ligne par rapport au prix de base. */
  savings: number;
  pricing?: OfferPricingDto | undefined;
  quantity: number;
  stock: number;
  lineTotal: number; // unitPrice * quantity
}

export interface CartResponseDto {
  id: string;
  userId: string;
  items: CartItemResponseDto[];
  totalItems: number; // somme des quantités
  totalAmount: number; // somme des lineTotal, aux prix en vigueur
  /** Économies du panier par rapport aux prix de base. */
  totalSavings: number;
  createdAt: Date;
  updatedAt: Date;
}

export const toCartResponseDto = (
  cart: ICart,
  productBoutiques: IProductBoutique[] = [],
  products: IProduct[] = []
): CartResponseDto => {
  const items: CartItemResponseDto[] = cart.items.map((item) => {
    const pb = productBoutiques.find(
      (p) => p._id.toString() === item.productBoutiqueId.toString()
    );
    const product = pb
      ? products.find((pr) => pr._id.toString() === pb.productId.toString())
      : undefined;

    // Le prix en vigueur fait foi (le checkout le recalcule) ; le prix vu à
    // l'ajout ne sert qu'à signaler l'écart.
    const unitPrice = pb ? unitPriceFor(pb, item.quantity) : item.price;
    const basePrice = pb?.price ?? unitPrice;

    return {
      productBoutiqueId: item.productBoutiqueId.toString(),
      productId: pb?.productId.toString(),
      productName: product?.name,
      urlImages: pb?.urlImages ?? [],
      price: basePrice,
      discountPrice: pb?.discountPrice ?? undefined,
      unitPrice,
      addedUnitPrice: item.price,
      priceChanged: unitPrice !== item.price,
      savings: Math.max(0, basePrice - unitPrice) * item.quantity,
      pricing: pb ? toOfferPricingDto(pb) : undefined,
      quantity: item.quantity,
      stock: pb?.stock ?? 0,
      lineTotal: unitPrice * item.quantity,
    };
  });

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  return {
    id: cart._id.toString(),
    userId: cart.userId.toString(),
    items,
    totalItems,
    totalAmount: items.reduce((sum, i) => sum + i.lineTotal, 0),
    totalSavings: items.reduce((sum, i) => sum + i.savings, 0),
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
  };
};
