import { describe, it, expect } from "vitest";
import {
  addToWishlistForm,
  wishlistItemParams,
  wishlistUserIdParam,
} from "../../../../src/shared/forms/wishlist.form.js";
import { VALID_OBJECT_ID, runValidation } from "../../../helpers/validation.js";

const OTHER_ID = "507f191e810c19729de860ea";

describe("wishlistUserIdParam", () => {
  it("accepte un ObjectId valide", async () => {
    const { isValid } = await runValidation(wishlistUserIdParam, {
      params: { userId: VALID_OBJECT_ID },
    });

    expect(isValid).toBe(true);
  });

  it("rejette un identifiant invalide", async () => {
    const { isValid, errors } = await runValidation(wishlistUserIdParam, {
      params: { userId: "abc" },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Identifiant utilisateur invalide.");
  });
});

describe("addToWishlistForm", () => {
  it("accepte une requête valide", async () => {
    const { isValid } = await runValidation(addToWishlistForm, {
      params: { userId: VALID_OBJECT_ID },
      body: { productBoutiqueId: OTHER_ID },
    });

    expect(isValid).toBe(true);
  });

  it("exige productBoutiqueId", async () => {
    const { isValid, errors } = await runValidation(addToWishlistForm, {
      params: { userId: VALID_OBJECT_ID },
      body: {},
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("L'identifiant du produit en boutique est requis.");
  });

  it("rejette un productBoutiqueId mal formé", async () => {
    const { isValid, errors } = await runValidation(addToWishlistForm, {
      params: { userId: VALID_OBJECT_ID },
      body: { productBoutiqueId: "42" },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Identifiant de produit en boutique invalide.");
  });

  it("remonte les erreurs du paramètre et du corps ensemble", async () => {
    const { errors } = await runValidation(addToWishlistForm, {
      params: { userId: "x" },
      body: { productBoutiqueId: "y" },
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        "Identifiant utilisateur invalide.",
        "Identifiant de produit en boutique invalide.",
      ])
    );
  });
});

describe("wishlistItemParams", () => {
  it("accepte deux ObjectId valides", async () => {
    const { isValid } = await runValidation(wishlistItemParams, {
      params: { userId: VALID_OBJECT_ID, productBoutiqueId: OTHER_ID },
    });

    expect(isValid).toBe(true);
  });

  it("rejette un productBoutiqueId invalide", async () => {
    const { isValid, errors } = await runValidation(wishlistItemParams, {
      params: { userId: VALID_OBJECT_ID, productBoutiqueId: "abc" },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Identifiant de produit en boutique invalide.");
  });
});
