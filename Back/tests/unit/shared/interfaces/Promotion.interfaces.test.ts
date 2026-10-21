import { describe, it, expect } from "vitest";
import {
  computePromotionDiscount,
  isPromotionActive,
  toPromotionResponseDto,
  type DiscountableItem,
} from "../../../../src/shared/interfaces/Promotion.interfaces.js";
import {
  DiscountType,
  PromotionScope,
  PromotionType,
} from "../../../../src/models/promotion.model.js";
import { makePromotion, oid } from "../../../helpers/factories.js";

describe("computePromotionDiscount", () => {
  const pb1 = oid();
  const pb2 = oid();

  // 2 x 1000 + 1 x 500 = 2500
  const items: DiscountableItem[] = [
    { productBoutiqueId: pb1, price: 1000, quantity: 2 },
    { productBoutiqueId: pb2, price: 500, quantity: 1 },
  ];

  describe("cible = panier entier", () => {
    it("applique un pourcentage sur le total du panier", () => {
      const promo = makePromotion({ scope: PromotionScope.CART, discountValue: 10 });

      expect(computePromotionDiscount(promo, items)).toBe(250);
    });

    it("applique un montant fixe indépendamment du total", () => {
      const promo = makePromotion({
        scope: PromotionScope.CART,
        discountType: DiscountType.FIXED,
        discountValue: 700,
      });

      expect(computePromotionDiscount(promo, items)).toBe(700);
    });

    it("plafonne la réduction à maxDiscount", () => {
      const promo = makePromotion({
        scope: PromotionScope.CART,
        discountValue: 20, // 20% de 2500 = 500
        maxDiscount: 300,
      });

      expect(computePromotionDiscount(promo, items)).toBe(300);
    });

    it("respecte un maxDiscount à 0 (et non traité comme absent)", () => {
      const promo = makePromotion({
        scope: PromotionScope.CART,
        discountValue: 50,
        maxDiscount: 0,
      });

      expect(computePromotionDiscount(promo, items)).toBe(0);
    });

    it("ne dépasse jamais le montant du panier", () => {
      const promo = makePromotion({
        scope: PromotionScope.CART,
        discountType: DiscountType.FIXED,
        discountValue: 999_999,
      });

      expect(computePromotionDiscount(promo, items)).toBe(2500);
    });

    it("arrondit à l'entier le plus proche", () => {
      const promo = makePromotion({ scope: PromotionScope.CART, discountValue: 10 });

      // 10% de 999 = 99.9 → 100
      expect(
        computePromotionDiscount(promo, [{ productBoutiqueId: pb1, price: 999, quantity: 1 }])
      ).toBe(100);
    });

    it("renvoie 0 pour un panier vide", () => {
      const promo = makePromotion({ scope: PromotionScope.CART, discountValue: 10 });

      expect(computePromotionDiscount(promo, [])).toBe(0);
    });
  });

  describe("cible = produits en boutique", () => {
    it("ne prend en compte que les lignes ciblées", () => {
      const promo = makePromotion({
        scope: PromotionScope.PRODUCT_BOUTIQUE,
        productBoutiqueIds: [pb1],
        discountValue: 10, // 10% de (2 x 1000) = 200
      });

      expect(computePromotionDiscount(promo, items)).toBe(200);
    });

    it("renvoie 0 si aucun article du panier n'est ciblé", () => {
      const promo = makePromotion({
        scope: PromotionScope.PRODUCT_BOUTIQUE,
        productBoutiqueIds: [oid()],
        discountValue: 50,
      });

      expect(computePromotionDiscount(promo, items)).toBe(0);
    });

    it("compare les identifiants sous forme de chaîne (ObjectId ou string)", () => {
      const promo = makePromotion({
        scope: PromotionScope.PRODUCT_BOUTIQUE,
        productBoutiqueIds: [pb2],
        discountType: DiscountType.FIXED,
        discountValue: 100,
      });

      const stringItems: DiscountableItem[] = [
        { productBoutiqueId: pb2.toString(), price: 500, quantity: 1 },
      ];

      expect(computePromotionDiscount(promo, stringItems)).toBe(100);
    });

    it("plafonne un montant fixe à la base des lignes ciblées", () => {
      const promo = makePromotion({
        scope: PromotionScope.PRODUCT_BOUTIQUE,
        productBoutiqueIds: [pb2], // base = 500
        discountType: DiscountType.FIXED,
        discountValue: 900,
      });

      expect(computePromotionDiscount(promo, items)).toBe(500);
    });
  });
});

describe("isPromotionActive", () => {
  const start = new Date("2026-03-01T00:00:00.000Z");
  const end = new Date("2026-03-31T23:59:59.000Z");
  const inside = new Date("2026-03-15T12:00:00.000Z");

  const promo = (over: Record<string, unknown> = {}) =>
    makePromotion({ startDate: start, endDate: end, ...over });

  it("est active dans la fenêtre de dates", () => {
    expect(isPromotionActive(promo(), inside)).toBe(true);
  });

  it("est inactive si le drapeau actif est faux", () => {
    expect(isPromotionActive(promo({ actif: false }), inside)).toBe(false);
  });

  it("est inactive avant la date de début", () => {
    expect(isPromotionActive(promo(), new Date("2026-02-28T23:59:59.000Z"))).toBe(false);
  });

  it("est inactive après la date de fin", () => {
    expect(isPromotionActive(promo(), new Date("2026-04-01T00:00:00.000Z"))).toBe(false);
  });

  it("est active exactement à la date de début (bornes incluses)", () => {
    expect(isPromotionActive(promo(), start)).toBe(true);
  });

  it("est active exactement à la date de fin (bornes incluses)", () => {
    expect(isPromotionActive(promo(), end)).toBe(true);
  });

  it("est inactive quand la limite d'utilisation est atteinte", () => {
    expect(isPromotionActive(promo({ usageLimit: 5, usedCount: 5 }), inside)).toBe(false);
  });

  it("reste active tant que la limite n'est pas atteinte", () => {
    expect(isPromotionActive(promo({ usageLimit: 5, usedCount: 4 }), inside)).toBe(true);
  });

  it("ignore usedCount quand usageLimit est null (illimité)", () => {
    expect(isPromotionActive(promo({ usageLimit: null, usedCount: 9999 }), inside)).toBe(true);
  });
});

describe("toPromotionResponseDto", () => {
  it("mappe les champs et sérialise les identifiants", () => {
    const pbId = oid();
    const promo = makePromotion({
      type: PromotionType.FLASH_SALE,
      scope: PromotionScope.PRODUCT_BOUTIQUE,
      productBoutiqueIds: [pbId],
      code: null,
    });

    const dto = toPromotionResponseDto(promo, new Date("2026-06-01T00:00:00.000Z"));

    expect(dto.id).toBe(promo._id.toString());
    expect(dto.productBoutiqueIds).toEqual([pbId.toString()]);
    expect(dto.type).toBe(PromotionType.FLASH_SALE);
    expect(dto.scope).toBe(PromotionScope.PRODUCT_BOUTIQUE);
    expect(dto.code).toBeNull();
  });

  it("calcule isActive à la date fournie", () => {
    const promo = makePromotion({
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T00:00:00.000Z"),
    });

    expect(toPromotionResponseDto(promo, new Date("2026-03-10T00:00:00.000Z")).isActive).toBe(true);
    expect(toPromotionResponseDto(promo, new Date("2026-05-10T00:00:00.000Z")).isActive).toBe(false);
  });

  it("conserve actif et isActive comme deux informations distinctes", () => {
    // Promotion marquée active mais dont la fenêtre est passée.
    const promo = makePromotion({
      actif: true,
      startDate: new Date("2025-01-01T00:00:00.000Z"),
      endDate: new Date("2025-01-31T00:00:00.000Z"),
    });

    const dto = toPromotionResponseDto(promo, new Date("2026-01-01T00:00:00.000Z"));

    expect(dto.actif).toBe(true);
    expect(dto.isActive).toBe(false);
  });
});
