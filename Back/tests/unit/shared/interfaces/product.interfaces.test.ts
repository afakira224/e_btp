import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  toOfferPricingDto,
  toProductBoutiqueResponseDto,
  toProductResponseDto,
} from "../../../../src/shared/interfaces/product.interfaces.js";
import {
  CREATED_AT,
  UPDATED_AT,
  makeCategorie,
  makeFamille,
  makeProduct,
  makeProductBoutique,
  makeShop,
  makeSousCategorie,
  oid,
} from "../../../helpers/factories.js";

describe("toProductResponseDto", () => {
  it("mappe le produit et sérialise son identifiant", () => {
    const product = makeProduct();

    const dto = toProductResponseDto(product);

    expect(dto).toMatchObject({
      id: product._id.toString(),
      name: "Galaxy A15",
      description: "Smartphone 128 Go",
      urlImages: ["/uploads/images/2026-01-01/a15.jpg"],
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    });
  });

  it("ne retient que la taxonomie effectivement référencée par le produit", () => {
    const famille = makeFamille();
    const autreFamille = makeFamille({ nom: "Maison" });
    const categorie = makeCategorie({ familleId: famille._id });
    const autreCategorie = makeCategorie({ nom: "Cuisine" });
    const sousCategorie = makeSousCategorie({ categorieId: categorie._id });
    const autreSousCategorie = makeSousCategorie({ nom: "Casseroles" });

    const product = makeProduct({
      familleId: famille._id,
      categoryId: categorie._id,
      sousCategoryId: sousCategorie._id,
    });

    const dto = toProductResponseDto(
      product,
      [autreFamille, famille],
      [autreCategorie, categorie],
      [autreSousCategorie, sousCategorie]
    );

    expect(dto.familles.map((f) => f.nom)).toEqual(["Électronique"]);
    expect(dto.categories.map((c) => c.nom)).toEqual(["Téléphonie"]);
    expect(dto.sousCategories.map((s) => s.nom)).toEqual(["Smartphones"]);
  });

  it("renvoie des listes vides quand aucune taxonomie n'est fournie", () => {
    const dto = toProductResponseDto(makeProduct());

    expect(dto.familles).toEqual([]);
    expect(dto.categories).toEqual([]);
    expect(dto.sousCategories).toEqual([]);
  });
});

describe("toProductBoutiqueResponseDto", () => {
  it("mappe les champs commerciaux du produit en boutique", () => {
    const pb = makeProductBoutique({
      price: 1_500_000,
      discountPrice: 1_350_000,
      stock: 4,
      isFeatured: true,
      tags: ["promo"],
      rating: 4.2,
      reviewsCount: 8,
    });

    const dto = toProductBoutiqueResponseDto(pb);

    expect(dto).toMatchObject({
      id: pb._id.toString(),
      price: 1_500_000,
      discountPrice: 1_350_000,
      stock: 4,
      isFeatured: true,
      tags: ["promo"],
      rating: 4.2,
      reviewsCount: 8,
    });
  });

  it("imbrique la boutique et le produit quand ils sont fournis", () => {
    const shop = makeShop({ nom: "Boutique Madina" });
    const product = makeProduct({ name: "Redmi Note 13" });
    const pb = makeProductBoutique({ boutiqueId: shop._id, productId: product._id });

    const dto = toProductBoutiqueResponseDto(pb, shop, product);

    expect(dto.boutique?.nom).toBe("Boutique Madina");
    expect(dto.boutique?.id).toBe(shop._id.toString());
    expect(dto.product?.name).toBe("Redmi Note 13");
  });

  it("laisse boutique et product indéfinis quand ils ne sont pas fournis", () => {
    const dto = toProductBoutiqueResponseDto(makeProductBoutique());

    expect(dto.boutique).toBeUndefined();
    expect(dto.product).toBeUndefined();
  });

  it("propage la taxonomie au produit imbriqué", () => {
    const famille = makeFamille();
    const product = makeProduct({ familleId: famille._id });
    const pb = makeProductBoutique({ productId: product._id });

    const dto = toProductBoutiqueResponseDto(pb, undefined, product, [famille]);

    expect(dto.product?.familles.map((f) => f.nom)).toEqual(["Électronique"]);
  });
});

// ─────────────────────────────────────────────
describe("toOfferPricingDto", () => {
  const endsAt = new Date("2026-11-01T00:00:00.000Z");
  const promo = (over: Record<string, unknown> = {}) => ({
    promotionId: oid(),
    type: "product_discount",
    label: "Remise d'octobre",
    endsAt,
    referencePrice: 10_000,
    percent: 20,
    flash: false,
    campaignId: null,
    ...over,
  });

  it("donne le prix de base seul sans promotion", () => {
    expect(toOfferPricingDto(makeProductBoutique({ price: 10_000, discountPrice: null, stock: 3 }))).toEqual({ basePrice: 10_000, price: 10_000, tiers: [] });
  });

  it("affiche le prix barré et la remise quand elle atteint 5 %", () => {
    const current = promo();
    const dto = toOfferPricingDto(makeProductBoutique({ price: 10_000, discountPrice: 8_000, stock: 3, promo: current }));

    expect(dto).toEqual({
      basePrice: 10_000,
      price: 8_000,
      referencePrice: 10_000,
      percent: 20,
      endsAt,
      promotion: { id: String(current.promotionId), type: "product_discount", label: "Remise d'octobre", flash: false },
      tiers: [],
    });
  });

  it("garde le prix promotionnel mais cache le prix barré sous 5 % (faux prix barré)", () => {
    const dto = toOfferPricingDto(makeProductBoutique({ price: 10_000, discountPrice: 8_000, stock: 3, promo: promo({ referencePrice: 8_200, percent: 0 }) }));

    expect(dto.price).toBe(8_000);
    expect(dto).not.toHaveProperty("referencePrice");
    expect(dto).not.toHaveProperty("percent");
    expect(dto.promotion).toBeDefined();
  });

  it("n'affiche plus « en promotion » une offre en rupture", () => {
    const dto = toOfferPricingDto(makeProductBoutique({ price: 10_000, discountPrice: 8_000, stock: 0, promo: promo() }));

    expect(dto).not.toHaveProperty("referencePrice");
    expect(dto).not.toHaveProperty("percent");
  });

  it("signale une vente flash et sa campagne", () => {
    const campaignId = new Types.ObjectId();
    const dto = toOfferPricingDto(makeProductBoutique({ price: 10_000, discountPrice: 7_000, stock: 3, promo: promo({ type: "flash_sale", flash: true, campaignId }) }));

    expect(dto.promotion).toMatchObject({ type: "flash_sale", flash: true, campaignId: String(campaignId) });
  });

  it("donne le prix unitaire de chaque palier, jamais plus cher que le prix promotionnel", () => {
    const dto = toOfferPricingDto(
      makeProductBoutique({
        price: 10_000,
        discountPrice: 8_500,
        stock: 30,
        quantityTiers: [
          { minQuantity: 3, percent: 10 },
          { minQuantity: 10, percent: 20 },
        ],
      })
    );

    expect(dto.tiers).toEqual([
      { minQuantity: 3, percent: 10, unitPrice: 8_500 },
      { minQuantity: 10, percent: 20, unitPrice: 8_000 },
    ]);
  });
});

describe("toProductBoutiqueResponseDto — prix et vitrine", () => {
  it("ajoute le prix calculé et le rang de produit phare", () => {
    const dto = toProductBoutiqueResponseDto(makeProductBoutique({ price: 10_000, discountPrice: null, featuredRank: 2 }));

    expect(dto.pricing).toEqual({ basePrice: 10_000, price: 10_000, tiers: [] });
    expect(dto.featuredRank).toBe(2);
    expect(dto.discountPrice).toBeUndefined();
  });

  it("omet le rang d'une offre qui n'est pas produit phare", () => {
    expect(toProductBoutiqueResponseDto(makeProductBoutique({ featuredRank: null }))).not.toHaveProperty("featuredRank");
  });
});
