import { describe, it, expect } from "vitest";
import {
  applyCouponForm,
  createPromotionForm,
  promotionIdParam,
  updatePromotionForm,
} from "../../../../src/shared/forms/promotion.form.js";
import {
  DiscountType,
  PromotionScope,
  PromotionType,
} from "../../../../src/models/promotion.model.js";
import { VALID_OBJECT_ID, runValidation } from "../../../helpers/validation.js";

const validBody = {
  nom: "Promo rentrée",
  type: PromotionType.COUPON,
  scope: PromotionScope.CART,
  discountValue: 10,
  startDate: "2026-09-01T00:00:00.000Z",
  endDate: "2026-09-30T23:59:59.000Z",
};

describe("createPromotionForm", () => {
  it("accepte une promotion minimale valide", async () => {
    const { isValid } = await runValidation(createPromotionForm, { body: validBody });

    expect(isValid).toBe(true);
  });

  it("convertit les dates ISO en objets Date", async () => {
    const { req } = await runValidation(createPromotionForm, { body: validBody });

    expect(req.body.startDate).toBeInstanceOf(Date);
    expect(req.body.endDate).toBeInstanceOf(Date);
  });

  it("convertit discountValue en nombre", async () => {
    const { req } = await runValidation(createPromotionForm, {
      body: { ...validBody, discountValue: "15.5" },
    });

    expect(req.body.discountValue).toBe(15.5);
  });

  it("exige un nom d'au moins 2 caractères", async () => {
    const { isValid, errors } = await runValidation(createPromotionForm, {
      body: { ...validBody, nom: "A" },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Entre 2 et 100 caractères.");
  });

  it("exige un nom non vide", async () => {
    const { isValid, errors } = await runValidation(createPromotionForm, {
      body: { ...validBody, nom: "   " },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Le nom de la promotion est requis.");
  });

  it.each(Object.values(PromotionType))("accepte le type %s", async (type) => {
    const { isValid } = await runValidation(createPromotionForm, {
      body: { ...validBody, type },
    });

    expect(isValid).toBe(true);
  });

  it("rejette un type inconnu", async () => {
    const { isValid, errors } = await runValidation(createPromotionForm, {
      body: { ...validBody, type: "mega_sale" },
    });

    expect(isValid).toBe(false);
    expect(errors.join(" ")).toContain("Type invalide");
  });

  it.each(Object.values(PromotionScope))("accepte la cible %s", async (scope) => {
    const { isValid } = await runValidation(createPromotionForm, {
      body: { ...validBody, scope },
    });

    expect(isValid).toBe(true);
  });

  it("rejette une cible inconnue", async () => {
    const { isValid, errors } = await runValidation(createPromotionForm, {
      body: { ...validBody, scope: "boutique" },
    });

    expect(isValid).toBe(false);
    expect(errors.join(" ")).toContain("Cible invalide");
  });

  it.each(Object.values(DiscountType))("accepte le type de réduction %s", async (discountType) => {
    const { isValid } = await runValidation(createPromotionForm, {
      body: { ...validBody, discountType },
    });

    expect(isValid).toBe(true);
  });

  it("rejette une valeur de réduction nulle ou négative", async () => {
    for (const discountValue of [0, -10]) {
      const { isValid, errors } = await runValidation(createPromotionForm, {
        body: { ...validBody, discountValue },
      });

      expect(isValid).toBe(false);
      expect(errors).toContain("La réduction doit être un nombre supérieur à 0.");
    }
  });

  it("exige des dates au format ISO8601", async () => {
    const { isValid, errors } = await runValidation(createPromotionForm, {
      body: { ...validBody, startDate: "01/09/2026" },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Date de début invalide (format ISO8601 attendu).");
  });

  it("exige la date de fin", async () => {
    const body: Record<string, unknown> = { ...validBody };
    delete body.endDate;

    const { isValid, errors } = await runValidation(createPromotionForm, { body });

    expect(isValid).toBe(false);
    expect(errors).toContain("La date de fin est requise.");
  });

  it("accepte une liste de produits ciblés valide", async () => {
    const { isValid } = await runValidation(createPromotionForm, {
      body: { ...validBody, productBoutiqueIds: [VALID_OBJECT_ID] },
    });

    expect(isValid).toBe(true);
  });

  it("rejette un identifiant de produit ciblé invalide", async () => {
    const { isValid, errors } = await runValidation(createPromotionForm, {
      body: { ...validBody, productBoutiqueIds: ["pas-un-id"] },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Identifiant de produit en boutique invalide.");
  });

  it("rejette productBoutiqueIds s'il n'est pas un tableau", async () => {
    const { isValid, errors } = await runValidation(createPromotionForm, {
      body: { ...validBody, productBoutiqueIds: VALID_OBJECT_ID },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("productBoutiqueIds doit être un tableau.");
  });

  it("rejette un code de moins de 3 caractères", async () => {
    const { isValid, errors } = await runValidation(createPromotionForm, {
      body: { ...validBody, code: "AB" },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Le code doit faire entre 3 et 40 caractères.");
  });

  it("rejette une limite d'utilisation inférieure à 1", async () => {
    const { isValid, errors } = await runValidation(createPromotionForm, {
      body: { ...validBody, usageLimit: 0 },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("La limite d'utilisation doit être un entier ≥ 1.");
  });

  it("accepte un plafond de réduction et un montant minimum positifs", async () => {
    const { isValid, req } = await runValidation(createPromotionForm, {
      body: { ...validBody, maxDiscount: "5000", minAmount: "1000" },
    });

    expect(isValid).toBe(true);
    expect(req.body.maxDiscount).toBe(5000);
    expect(req.body.minAmount).toBe(1000);
  });

  it("rejette un montant minimum négatif", async () => {
    const { isValid, errors } = await runValidation(createPromotionForm, {
      body: { ...validBody, minAmount: -1 },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Le montant minimum doit être positif.");
  });
});

describe("updatePromotionForm", () => {
  it("accepte une mise à jour partielle", async () => {
    const { isValid } = await runValidation(updatePromotionForm, {
      params: { id: VALID_OBJECT_ID },
      body: { discountValue: 25 },
    });

    expect(isValid).toBe(true);
  });

  it("accepte un corps vide", async () => {
    const { isValid } = await runValidation(updatePromotionForm, {
      params: { id: VALID_OBJECT_ID },
      body: {},
    });

    expect(isValid).toBe(true);
  });

  it("rejette un nom explicitement vidé", async () => {
    const { isValid, errors } = await runValidation(updatePromotionForm, {
      params: { id: VALID_OBJECT_ID },
      body: { nom: "  " },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Le nom ne peut pas être vide.");
  });

  it("rejette un identifiant de promotion invalide", async () => {
    const { isValid, errors } = await runValidation(updatePromotionForm, {
      params: { id: "abc" },
      body: {},
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Identifiant de promotion invalide.");
  });
});

describe("applyCouponForm", () => {
  it("accepte un userId et un code", async () => {
    const { isValid } = await runValidation(applyCouponForm, {
      body: { userId: VALID_OBJECT_ID, code: "RENTREE10" },
    });

    expect(isValid).toBe(true);
  });

  it("exige le code du coupon", async () => {
    const { isValid, errors } = await runValidation(applyCouponForm, {
      body: { userId: VALID_OBJECT_ID },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Le code du coupon est requis.");
  });

  it("rejette un code composé uniquement d'espaces", async () => {
    const { isValid } = await runValidation(applyCouponForm, {
      body: { userId: VALID_OBJECT_ID, code: "   " },
    });

    expect(isValid).toBe(false);
  });

  it("rejette un userId invalide", async () => {
    const { isValid, errors } = await runValidation(applyCouponForm, {
      body: { userId: "abc", code: "RENTREE10" },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Identifiant utilisateur invalide.");
  });
});

describe("promotionIdParam", () => {
  it("accepte un ObjectId valide", async () => {
    const { isValid } = await runValidation(promotionIdParam, {
      params: { id: VALID_OBJECT_ID },
    });

    expect(isValid).toBe(true);
  });
});
