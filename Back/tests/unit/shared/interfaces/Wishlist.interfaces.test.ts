import { describe, it, expect } from "vitest";
import { toWishlistResponseDto } from "../../../../src/shared/interfaces/Wishlist.interfaces.js";
import {
  makeCategorie,
  makeFamille,
  makeProduct,
  makeProductBoutique,
  makeShop,
  makeSousCategorie,
  makeWishlist,
  oid,
} from "../../../helpers/factories.js";

describe("toWishlistResponseDto", () => {
  it("renvoie une liste vide cohérente", () => {
    const wishlist = makeWishlist();

    const dto = toWishlistResponseDto(wishlist);

    expect(dto.items).toEqual([]);
    expect(dto.totalItems).toBe(0);
    expect(dto.id).toBe(wishlist._id.toString());
    expect(dto.userId).toBe(wishlist.userId.toString());
  });

  it("totalItems correspond au nombre de favoris", () => {
    const wishlist = makeWishlist({
      items: [{ productBoutiqueId: oid() }, { productBoutiqueId: oid() }],
    });

    expect(toWishlistResponseDto(wishlist).totalItems).toBe(2);
  });

  it("résout le produit en boutique avec sa boutique, son produit et sa taxonomie", () => {
    const famille = makeFamille();
    const categorie = makeCategorie({ familleId: famille._id });
    const sousCategorie = makeSousCategorie({ categorieId: categorie._id });
    const shop = makeShop();
    const product = makeProduct({
      name: "Galaxy A15",
      familleId: famille._id,
      categoryId: categorie._id,
      sousCategoryId: sousCategorie._id,
    });
    const pb = makeProductBoutique({ boutiqueId: shop._id, productId: product._id });

    const wishlist = makeWishlist({ items: [{ productBoutiqueId: pb._id }] });

    const dto = toWishlistResponseDto(
      wishlist,
      [pb],
      [shop],
      [product],
      [famille],
      [categorie],
      [sousCategorie]
    );

    const item = dto.items[0]!;
    expect(item.productBoutiqueId).toBe(pb._id.toString());
    expect(item.productBoutique?.id).toBe(pb._id.toString());
    expect(item.productBoutique?.boutique?.nom).toBe("Boutique Kaloum");
    expect(item.productBoutique?.product?.name).toBe("Galaxy A15");
    expect(item.productBoutique?.product?.familles).toHaveLength(1);
    expect(item.productBoutique?.product?.categories).toHaveLength(1);
    expect(item.productBoutique?.product?.sousCategories).toHaveLength(1);
  });

  it("laisse productBoutique indéfini quand la référence n'est pas résolue", () => {
    const wishlist = makeWishlist({ items: [{ productBoutiqueId: oid() }] });

    const item = toWishlistResponseDto(wishlist, [], [], [])!.items[0]!;

    expect(item.productBoutique).toBeUndefined();
    expect(item.productBoutiqueId).toEqual(expect.any(String));
  });

  it("laisse boutique et product indéfinis quand seuls les product_boutique sont fournis", () => {
    const pb = makeProductBoutique();
    const wishlist = makeWishlist({ items: [{ productBoutiqueId: pb._id }] });

    const item = toWishlistResponseDto(wishlist, [pb])!.items[0]!;

    expect(item.productBoutique).toBeDefined();
    expect(item.productBoutique?.boutique).toBeUndefined();
    expect(item.productBoutique?.product).toBeUndefined();
  });
});
