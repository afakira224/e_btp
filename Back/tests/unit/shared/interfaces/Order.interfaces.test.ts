import { describe, it, expect } from "vitest";
import { toOrderResponseDto } from "../../../../src/shared/interfaces/Order.interfaces.js";
import { OrderStatus } from "../../../../src/models/order.model.js";
import {
  makeCategorie,
  makeFamille,
  makeOrder,
  makeOrderItem,
  makeProduct,
  makeProductBoutique,
  makeShop,
  makeSousCategorie,
  oid,
} from "../../../helpers/factories.js";

describe("toOrderResponseDto", () => {
  it("mappe les champs monétaires et le statut sans les recalculer", () => {
    const order = makeOrder({
      status: OrderStatus.CONFIRMED,
      subtotal: 10_000,
      discountAmount: 1_500,
      amount: 8_500,
      promotionCode: "RENTREE10",
      reference: "CMD-42",
    });

    const dto = toOrderResponseDto(order);

    expect(dto).toMatchObject({
      id: order._id.toString(),
      userId: order.userId.toString(),
      reference: "CMD-42",
      status: OrderStatus.CONFIRMED,
      subtotal: 10_000,
      discountAmount: 1_500,
      promotionCode: "RENTREE10",
      amount: 8_500,
    });
  });

  it("calcule lineTotal et totalItems à partir des lignes figées", () => {
    const order = makeOrder({
      items: [
        makeOrderItem({ price: 1_000, quantity: 3 }),
        makeOrderItem({ price: 250, quantity: 2 }),
      ],
    });

    const dto = toOrderResponseDto(order);

    expect(dto.items.map((i) => i.lineTotal)).toEqual([3_000, 500]);
    expect(dto.totalItems).toBe(5);
  });

  it("enrichit chaque ligne avec la boutique, le produit et sa taxonomie", () => {
    const famille = makeFamille();
    const categorie = makeCategorie({ familleId: famille._id });
    const sousCategorie = makeSousCategorie({ categorieId: categorie._id });
    const shop = makeShop({ nom: "Boutique Madina" });
    const product = makeProduct({
      name: "Redmi Note 13",
      familleId: famille._id,
      categoryId: categorie._id,
      sousCategoryId: sousCategorie._id,
    });
    const pb = makeProductBoutique({ boutiqueId: shop._id, productId: product._id });

    const order = makeOrder({
      items: [
        makeOrderItem({
          productBoutiqueId: pb._id,
          boutiqueId: shop._id,
          productId: product._id,
          price: 900,
          quantity: 1,
        }),
      ],
    });

    const item = toOrderResponseDto(
      order,
      [pb],
      [shop],
      [product],
      [famille],
      [categorie],
      [sousCategorie]
    ).items[0]!;

    expect(item.boutique?.nom).toBe("Boutique Madina");
    expect(item.product?.name).toBe("Redmi Note 13");
    expect(item.productBoutique.id).toBe(pb._id.toString());
    expect(item.productBoutique.boutique?.nom).toBe("Boutique Madina");
  });

  it("laisse boutique et product indéfinis quand la ligne ne les référence pas", () => {
    const pb = makeProductBoutique();
    const order = makeOrder({
      items: [
        makeOrderItem({
          productBoutiqueId: pb._id,
          boutiqueId: undefined,
          productId: undefined,
        }),
      ],
    });

    const item = toOrderResponseDto(order, [pb])!.items[0]!;

    expect(item.boutique).toBeUndefined();
    expect(item.product).toBeUndefined();
    expect(item.productBoutique).toBeDefined();
  });

  it("renvoie une commande sans ligne quand items est vide", () => {
    const dto = toOrderResponseDto(makeOrder({ items: [] }));

    expect(dto.items).toEqual([]);
    expect(dto.totalItems).toBe(0);
  });

  it("conserve la quantité et le prix figés de la commande, pas ceux de la boutique", () => {
    // Le prix boutique a changé depuis la commande : la commande reste un instantané.
    const pb = makeProductBoutique({ price: 5_000, discountPrice: 4_000 });
    const order = makeOrder({
      items: [makeOrderItem({ productBoutiqueId: pb._id, price: 1_000, quantity: 2 })],
    });

    const item = toOrderResponseDto(order, [pb])!.items[0]!;

    expect(item.price).toBe(1_000);
    expect(item.lineTotal).toBe(2_000);
    expect(item.productBoutique.price).toBe(5_000); // prix courant, indicatif
  });

  it("associe chaque ligne au bon product_boutique", () => {
    const pbA = makeProductBoutique({ stock: 1 });
    const pbB = makeProductBoutique({ stock: 42 });
    const order = makeOrder({
      items: [
        makeOrderItem({ productBoutiqueId: pbB._id, boutiqueId: undefined, productId: undefined }),
        makeOrderItem({ productBoutiqueId: pbA._id, boutiqueId: undefined, productId: undefined }),
      ],
    });

    const dto = toOrderResponseDto(order, [pbA, pbB]);

    expect(dto.items[0]!.productBoutique.stock).toBe(42);
    expect(dto.items[1]!.productBoutique.stock).toBe(1);
  });

  it("ignore les lignes dont le product_boutique n'est plus résolvable sans planter", () => {
    const order = makeOrder({
      items: [makeOrderItem({ productBoutiqueId: oid(), boutiqueId: undefined, productId: undefined })],
    });

    expect(() => toOrderResponseDto(order, [])).not.toThrow();
    expect(toOrderResponseDto(order, []).items[0]!.productBoutique).toBeUndefined();
  });
});
