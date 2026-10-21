import { describe, it, expect } from "vitest";
import {
  createReviewForm,
  productBoutiqueIdParam,
  reviewIdParam,
  updateReviewForm,
} from "../../../../src/shared/forms/review.form.js";
import { VALID_OBJECT_ID, runValidation } from "../../../helpers/validation.js";

const OTHER_ID = "507f191e810c19729de860ea";

describe("createReviewForm", () => {
  const base = {
    body: { userId: VALID_OBJECT_ID, productBoutiqueId: OTHER_ID, rating: 4 },
  };

  it("accepte un avis complet", async () => {
    const { isValid } = await runValidation(createReviewForm, {
      body: { ...base.body, comment: "Livraison rapide" },
    });

    expect(isValid).toBe(true);
  });

  it("accepte un avis sans commentaire", async () => {
    const { isValid } = await runValidation(createReviewForm, base);

    expect(isValid).toBe(true);
  });

  it("convertit la note en entier", async () => {
    const { isValid, req } = await runValidation(createReviewForm, {
      body: { ...base.body, rating: "5" },
    });

    expect(isValid).toBe(true);
    expect(req.body.rating).toBe(5);
  });

  it.each([1, 2, 3, 4, 5])("accepte la note %i", async (rating) => {
    const { isValid } = await runValidation(createReviewForm, {
      body: { ...base.body, rating },
    });

    expect(isValid).toBe(true);
  });

  it.each([0, 6, -1])("rejette la note hors bornes %i", async (rating) => {
    const { isValid, errors } = await runValidation(createReviewForm, {
      body: { ...base.body, rating },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("La note doit être un entier entre 1 et 5.");
  });

  it("rejette une note décimale", async () => {
    const { isValid } = await runValidation(createReviewForm, {
      body: { ...base.body, rating: 3.5 },
    });

    expect(isValid).toBe(false);
  });

  it("exige la note", async () => {
    const { isValid, errors } = await runValidation(createReviewForm, {
      body: { userId: VALID_OBJECT_ID, productBoutiqueId: OTHER_ID },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("La note est requise.");
  });

  it("exige userId et productBoutiqueId", async () => {
    const { errors } = await runValidation(createReviewForm, { body: { rating: 4 } });

    expect(errors).toEqual(
      expect.arrayContaining([
        "L'identifiant utilisateur est requis.",
        "L'identifiant du produit en boutique est requis.",
      ])
    );
  });

  it("accepte un commentaire de 2000 caractères", async () => {
    const { isValid } = await runValidation(createReviewForm, {
      body: { ...base.body, comment: "a".repeat(2000) },
    });

    expect(isValid).toBe(true);
  });

  it("rejette un commentaire de plus de 2000 caractères", async () => {
    const { isValid, errors } = await runValidation(createReviewForm, {
      body: { ...base.body, comment: "a".repeat(2001) },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Maximum 2000 caractères.");
  });

  it("nettoie les espaces autour du commentaire", async () => {
    const { req } = await runValidation(createReviewForm, {
      body: { ...base.body, comment: "   Super produit   " },
    });

    expect(req.body.comment).toBe("Super produit");
  });
});

describe("updateReviewForm", () => {
  it("accepte une mise à jour partielle", async () => {
    const { isValid } = await runValidation(updateReviewForm, {
      params: { id: VALID_OBJECT_ID },
      body: { rating: 5 },
    });

    expect(isValid).toBe(true);
  });

  it("accepte un corps vide (aucun champ modifié)", async () => {
    const { isValid } = await runValidation(updateReviewForm, {
      params: { id: VALID_OBJECT_ID },
      body: {},
    });

    expect(isValid).toBe(true);
  });

  it("rejette un identifiant d'avis invalide", async () => {
    const { isValid, errors } = await runValidation(updateReviewForm, {
      params: { id: "abc" },
      body: {},
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Identifiant d'avis invalide.");
  });

  it("valide la note quand elle est fournie", async () => {
    const { isValid } = await runValidation(updateReviewForm, {
      params: { id: VALID_OBJECT_ID },
      body: { rating: 9 },
    });

    expect(isValid).toBe(false);
  });
});

describe("paramètres simples", () => {
  it("reviewIdParam accepte un ObjectId", async () => {
    const { isValid } = await runValidation(reviewIdParam, { params: { id: VALID_OBJECT_ID } });

    expect(isValid).toBe(true);
  });

  it("productBoutiqueIdParam rejette une valeur invalide", async () => {
    const { isValid } = await runValidation(productBoutiqueIdParam, {
      params: { productBoutiqueId: "42" },
    });

    expect(isValid).toBe(false);
  });
});
