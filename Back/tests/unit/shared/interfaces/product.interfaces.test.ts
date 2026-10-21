import { describe, it, expect } from "vitest";
import {
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
