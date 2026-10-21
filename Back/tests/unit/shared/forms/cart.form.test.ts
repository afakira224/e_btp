import { describe, it, expect } from "vitest";
import {
  addToCartForm,
  cartItemParams,
  updateCartItemForm,
  userIdParam,
} from "../../../../src/shared/forms/cart.form.js";
import { VALID_OBJECT_ID, runValidation } from "../../../helpers/validation.js";

const OTHER_ID = "507f191e810c19729de860ea";

describe("userIdParam", () => {
  it("accepte un ObjectId valide", async () => {
    const { isValid } = await runValidation(userIdParam, { params: { userId: VALID_OBJECT_ID } });

    expect(isValid).toBe(true);
  });

  it("rejette un identifiant non ObjectId", async () => {
    const { isValid, errors } = await runValidation(userIdParam, { params: { userId: "abc" } });

    expect(isValid).toBe(false);
    expect(errors).toContain("Identifiant utilisateur invalide.");
  });

  it("rejette un paramètre manquant", async () => {
    const { isValid } = await runValidation(userIdParam, { params: {} });

    expect(isValid).toBe(false);
  });
});

describe("addToCartForm", () => {
  const base = {
    params: { userId: VALID_OBJECT_ID },
    body: { productBoutiqueId: OTHER_ID },
  };

  it("accepte une requête minimale sans quantité", async () => {
    const { isValid } = await runValidation(addToCartForm, base);

    expect(isValid).toBe(true);
  });

  it("accepte une quantité entière positive et la convertit en nombre", async () => {
    const { isValid, req } = await runValidation(addToCartForm, {
      ...base,
      body: { ...base.body, quantity: "3" },
    });

    expect(isValid).toBe(true);
    expect(req.body.quantity).toBe(3);
  });

  it("exige productBoutiqueId", async () => {
    const { isValid, errors } = await runValidation(addToCartForm, {
      params: base.params,
      body: {},
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("L'identifiant du produit en boutique est requis.");
  });

  it("rejette un productBoutiqueId mal formé", async () => {
    const { isValid, errors } = await runValidation(addToCartForm, {
      ...base,
      body: { productBoutiqueId: "pas-un-id" },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Identifiant de produit en boutique invalide.");
  });

  it("rejette une quantité nulle ou négative", async () => {
    for (const quantity of [0, -5]) {
      const { isValid, errors } = await runValidation(addToCartForm, {
        ...base,
        body: { ...base.body, quantity },
      });

      expect(isValid).toBe(false);
      expect(errors).toContain("La quantité doit être un entier supérieur ou égal à 1.");
    }
  });

  it("rejette une quantité non entière", async () => {
    const { isValid } = await runValidation(addToCartForm, {
      ...base,
      body: { ...base.body, quantity: 2.5 },
    });

    expect(isValid).toBe(false);
  });

  it("remonte toutes les erreurs d'un coup", async () => {
    const { errors } = await runValidation(addToCartForm, {
      params: { userId: "nope" },
      body: { productBoutiqueId: "nope", quantity: 0 },
    });

    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("updateCartItemForm", () => {
  const base = {
    params: { userId: VALID_OBJECT_ID, productBoutiqueId: OTHER_ID },
    body: { quantity: 2 },
  };

  it("accepte une quantité valide", async () => {
    const { isValid } = await runValidation(updateCartItemForm, base);

    expect(isValid).toBe(true);
  });

  it("accepte la quantité 0 (retrait de l'article)", async () => {
    const { isValid, req } = await runValidation(updateCartItemForm, {
      ...base,
      body: { quantity: 0 },
    });

    expect(isValid).toBe(true);
    expect(req.body.quantity).toBe(0);
  });

  it("exige la quantité", async () => {
    const { isValid, errors } = await runValidation(updateCartItemForm, {
      params: base.params,
      body: {},
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("La quantité est requise.");
  });

  it("rejette une quantité négative", async () => {
    const { isValid, errors } = await runValidation(updateCartItemForm, {
      ...base,
      body: { quantity: -1 },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain(
      "La quantité doit être un entier positif (0 pour retirer l'article)."
    );
  });

  it("valide les deux paramètres d'URL", async () => {
    const { isValid, errors } = await runValidation(updateCartItemForm, {
      params: { userId: "x", productBoutiqueId: "y" },
      body: { quantity: 1 },
    });

    expect(isValid).toBe(false);
    expect(errors).toEqual(
      expect.arrayContaining([
        "Identifiant utilisateur invalide.",
        "Identifiant de produit en boutique invalide.",
      ])
    );
  });
});

describe("cartItemParams", () => {
  it("accepte deux ObjectId valides", async () => {
    const { isValid } = await runValidation(cartItemParams, {
      params: { userId: VALID_OBJECT_ID, productBoutiqueId: OTHER_ID },
    });

    expect(isValid).toBe(true);
  });

  it("rejette un productBoutiqueId invalide", async () => {
    const { isValid, errors } = await runValidation(cartItemParams, {
      params: { userId: VALID_OBJECT_ID, productBoutiqueId: "123" },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Identifiant de produit en boutique invalide.");
  });
});
