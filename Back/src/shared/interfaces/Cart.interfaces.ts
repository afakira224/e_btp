// ─────────────────────────────────────────────
//  CART - RESPONSE DTO
// ─────────────────────────────────────────────

import type { ICart } from "../../models/cart.model.js";
import type { IProduct, IProductBoutique } from "../../models/product.model.js";

export interface CartItemResponseDto {
  productBoutiqueId: string;
  productId?: string | undefined;
  productName?: string | undefined;
  urlImages: string[];
  price: number;
  discountPrice?: number | undefined;
  unitPrice: number; // discountPrice si présent, sinon price
  quantity: number;
  stock: number;
  lineTotal: number; // unitPrice * quantity
}

export interface CartResponseDto {
  id: string;
  userId: string;
  items: CartItemResponseDto[];
  totalItems: number; // somme des quantités
  totalAmount: number; // somme des lineTotal
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

    // unitPrice = prix figé dans le panier ; price/discountPrice = prix courants (indicatifs).
    const unitPrice = item.price;

    return {
      productBoutiqueId: item.productBoutiqueId.toString(),
      productId: pb?.productId.toString(),
      productName: product?.name,
      urlImages: pb?.urlImages ?? [],
      price: pb?.price ?? unitPrice,
      discountPrice: pb?.discountPrice,
      unitPrice,
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
    totalAmount: cart.amount,
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
  };
};
