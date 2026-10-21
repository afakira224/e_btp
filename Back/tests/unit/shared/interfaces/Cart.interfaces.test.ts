import { describe, it, expect } from "vitest";
import { toCartResponseDto } from "../../../../src/shared/interfaces/Cart.interfaces.js";
import {
  CREATED_AT,
  UPDATED_AT,
  makeCart,
  makeCartItem,
  makeProduct,
  makeProductBoutique,
  oid,
} from "../../../helpers/factories.js";

describe("toCartResponseDto", () => {
  it("renvoie un panier vide cohérent", () => {
    const cart = makeCart();

    const dto = toCartResponseDto(cart);

    expect(dto).toEqual({
      id: cart._id.toString(),
      userId: cart.userId.toString(),
      items: [],
      totalItems: 0,
      totalAmount: 0,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    });
  });

  it("enrichit chaque ligne avec le produit et le produit en boutique", () => {
    const product = makeProduct({ name: "Galaxy A15" });
    const pb = makeProductBoutique({
      productId: product._id,
      price: 1_500_000,
      discountPrice: 1_350_000,
      stock: 7,
      urlImages: ["/uploads/images/a.jpg"],
    });
    const cart = makeCart({
      items: [makeCartItem({ productBoutiqueId: pb._id, quantity: 2, price: 1_350_000 })],
      amount: 2_700_000,
    });

    const dto = toCartResponseDto(cart, [pb], [product]);

    expect(dto.items).toHaveLength(1);
    expect(dto.items[0]).toEqual({
      productBoutiqueId: pb._id.toString(),
      productId: product._id.toString(),
      productName: "Galaxy A15",
      urlImages: ["/uploads/images/a.jpg"],
      price: 1_500_000,
      discountPrice: 1_350_000,
      unitPrice: 1_350_000,
      quantity: 2,
      stock: 7,
      lineTotal: 2_700_000,
    });
  });

  it("calcule lineTotal à partir du prix figé, pas du prix courant", () => {
    // Le prix boutique a augmenté depuis l'ajout au panier : le panier garde son prix figé.
    const pb = makeProductBoutique({ price: 2_000, discountPrice: 1_900 });
    const cart = makeCart({
      items: [makeCartItem({ productBoutiqueId: pb._id, quantity: 3, price: 1_000 })],
      amount: 3_000,
    });

    const dto = toCartResponseDto(cart, [pb], []);

    expect(dto.items[0]!.unitPrice).toBe(1_000);
    expect(dto.items[0]!.lineTotal).toBe(3_000);
    expect(dto.items[0]!.price).toBe(2_000); // prix courant, indicatif
  });

  it("totalItems est la somme des quantités, pas le nombre de lignes", () => {
    const cart = makeCart({
      items: [
        makeCartItem({ quantity: 2, price: 100 }),
        makeCartItem({ quantity: 5, price: 200 }),
      ],
      amount: 1_200,
    });

    const dto = toCartResponseDto(cart);

    expect(dto.items).toHaveLength(2);
    expect(dto.totalItems).toBe(7);
  });

  it("totalAmount reprend le montant persisté du panier", () => {
    const cart = makeCart({ items: [makeCartItem({ quantity: 1, price: 800 })], amount: 800 });

    expect(toCartResponseDto(cart).totalAmount).toBe(800);
  });

  it("dégrade proprement quand le produit en boutique n'est pas résolu", () => {
    const cart = makeCart({
      items: [makeCartItem({ productBoutiqueId: oid(), quantity: 2, price: 450 })],
      amount: 900,
    });

    const item = toCartResponseDto(cart, [], [])!.items[0]!;

    expect(item.productId).toBeUndefined();
    expect(item.productName).toBeUndefined();
    expect(item.urlImages).toEqual([]);
    expect(item.stock).toBe(0);
    expect(item.price).toBe(450); // repli sur le prix figé
    expect(item.lineTotal).toBe(900);
  });

  it("laisse productName vide quand le produit n'est pas fourni", () => {
    const pb = makeProductBoutique();
    const cart = makeCart({ items: [makeCartItem({ productBoutiqueId: pb._id })] });

    const item = toCartResponseDto(cart, [pb], [])!.items[0]!;

    expect(item.productId).toBe(pb.productId.toString());
    expect(item.productName).toBeUndefined();
  });

  it("associe chaque ligne au bon produit en boutique", () => {
    const pbA = makeProductBoutique({ stock: 1 });
    const pbB = makeProductBoutique({ stock: 99 });
    const cart = makeCart({
      items: [
        makeCartItem({ productBoutiqueId: pbB._id, quantity: 1, price: 10 }),
        makeCartItem({ productBoutiqueId: pbA._id, quantity: 1, price: 20 }),
      ],
    });

    const dto = toCartResponseDto(cart, [pbA, pbB], []);

    expect(dto.items[0]!.stock).toBe(99);
    expect(dto.items[1]!.stock).toBe(1);
  });
});
