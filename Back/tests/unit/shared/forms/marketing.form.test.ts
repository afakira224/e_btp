import { describe, it, expect } from "vitest";
import {
  boostForm,
  boostIdParam,
  boostSettingsForm,
  campaignEntryForm,
  campaignForm,
  campaignUpdateForm,
  featuredForm,
  promotionActionForm,
  rechargeForm,
  sandboxCreditsForm,
  shopIdParam,
  shopPromotionForm,
  shopPromotionUpdateForm,
} from "../../../../src/shared/forms/marketing.form.js";
import { runValidation, VALID_OBJECT_ID } from "../../../helpers/validation.js";

const params = { id: VALID_OBJECT_ID };

// ─────────────────────────────────────────────
describe("shopPromotionForm", () => {
  const valid = { type: "product_discount", nom: "Remise d'octobre", discountValue: "20", productBoutiqueIds: [VALID_OBJECT_ID] };

  it("accepte une promotion valide et convertit les nombres", async () => {
    const { isValid, req } = await runValidation(shopPromotionForm, { params, body: valid });

    expect(isValid).toBe(true);
    expect(req.body.discountValue).toBe(20);
  });

  it("refuse une boutique, un type et un nom invalides", async () => {
    const { errors } = await runValidation(shopPromotionForm, { params: { id: "x" }, body: { type: "bogus", nom: "A" } });

    expect(errors).toEqual([
      "Boutique invalide.",
      "Type invalide. Valeurs acceptées : product_discount, shop_discount, coupon, flash_sale, quantity_tiers, free_shipping.",
      "Le nom fait de 2 à 80 caractères.",
    ]);
  });

  it("borne les listes d'offres, de familles et d'exclusions", async () => {
    const many = (n: number) => Array.from({ length: n }, () => VALID_OBJECT_ID);
    const { errors } = await runValidation(shopPromotionForm, {
      params,
      body: { ...valid, productBoutiqueIds: many(51), familleIds: many(21), excludedOfferIds: ["x"] },
    });

    expect(errors).toEqual(["Offres : 50 au plus.", "Familles : 20 au plus.", "Offres exclues : identifiant invalide."]);
  });

  it("met le code en majuscules et en contrôle la forme", async () => {
    const ok = await runValidation(shopPromotionForm, { params, body: { ...valid, type: "coupon", code: " kaloum10 " } });
    expect(ok.isValid).toBe(true);
    expect(ok.req.body.code).toBe("KALOUM10");

    const ko = await runValidation(shopPromotionForm, { params, body: { ...valid, type: "coupon", code: "K-10" } });
    expect(ko.errors).toEqual(["Le code fait de 4 à 20 lettres ou chiffres."]);
  });

  it("contrôle les montants, limites et options", async () => {
    const { errors } = await runValidation(shopPromotionForm, {
      params,
      body: {
        ...valid,
        discountType: "gift",
        minAmount: "-1",
        maxDiscount: "0",
        usageLimit: "0",
        perCustomerLimit: "11",
        stackable: "peut-être",
        flashQuantity: "0",
        launch: "later",
        startDate: "demain",
      },
    });

    expect(errors).toEqual([
      "Type de remise invalide.",
      "Date de début invalide.",
      "Montant minimum invalide.",
      "Plafond invalide.",
      "Nombre d'utilisations invalide.",
      "Utilisations par client : 1 à 10.",
      "Cumulable : vrai ou faux.",
      "Quantité flash invalide.",
      "Lancement : now, schedule ou draft.",
    ]);
  });

  it("accepte une date vide (lancement immédiat) et convertit les options", async () => {
    const { isValid, req } = await runValidation(shopPromotionForm, {
      params,
      body: { ...valid, startDate: "", endDate: "2026-12-01T00:00:00.000Z", stackable: "false", perCustomerLimit: "3", launch: "now" },
    });

    expect(isValid).toBe(true);
    expect(req.body.stackable).toBe(false);
    expect(req.body.perCustomerLimit).toBe(3);
  });

  it("contrôle les paliers : 3 au plus, dès 2 unités, 1 à 70 %", async () => {
    const ok = await runValidation(shopPromotionForm, { params, body: { ...valid, type: "quantity_tiers", tiers: [{ minQuantity: "3", discountValue: "10" }] } });
    expect(ok.isValid).toBe(true);
    expect(ok.req.body.tiers).toEqual([{ minQuantity: 3, discountValue: 10 }]);

    const ko = await runValidation(shopPromotionForm, {
      params,
      body: {
        ...valid,
        tiers: [
          { minQuantity: 1, discountValue: 80 },
          { minQuantity: 3, discountValue: 10 },
          { minQuantity: 4, discountValue: 15 },
          { minQuantity: 5, discountValue: 20 },
        ],
      },
    });
    expect(ko.errors).toEqual(["3 paliers au plus.", "Un palier commence à 2 unités au moins.", "Remise d'un palier : 1 à 70 %."]);
  });

  it("exige en plus une promotion valide pour la modification", async () => {
    const { errors } = await runValidation(shopPromotionUpdateForm, { params: { ...params, promotionId: "x" }, body: valid });

    expect(errors).toEqual(["Promotion invalide."]);
  });
});

describe("promotionActionForm", () => {
  it("accepte une prolongation et le lancement immédiat", async () => {
    const { isValid, req } = await runValidation(promotionActionForm, { params, body: { endDate: "2026-12-01T00:00:00.000Z", now: "true" } });

    expect(isValid).toBe(true);
    expect(req.body.now).toBe(true);
  });

  it("refuse une promotion ou une date invalide", async () => {
    const { errors } = await runValidation(promotionActionForm, { params: { id: "x" }, body: { endDate: "bientôt" } });

    expect(errors).toEqual(["Promotion invalide.", "Date de fin invalide."]);
  });
});

describe("featuredForm", () => {
  it.each([1, 6, "3", null])("accepte le rang %s", async (rank) => {
    expect((await runValidation(featuredForm, { params, body: { rank } })).isValid).toBe(true);
  });

  it.each([0, 7, 2.5, "premier", undefined])("refuse le rang %s", async (rank) => {
    const { errors } = await runValidation(featuredForm, { params, body: { rank } });

    expect(errors).toEqual(["Rang de 1 à 6, ou null pour retirer le produit."]);
  });

  it("refuse un produit invalide", async () => {
    expect((await runValidation(featuredForm, { params: { id: "x" }, body: { rank: 1 } })).errors).toEqual(["Produit invalide."]);
  });
});

// ─────────────────────────────────────────────
describe("campagnes", () => {
  const valid = { nom: "Soldes", startDate: "2026-11-01T00:00:00.000Z", endDate: "2026-11-20T00:00:00.000Z", minDiscount: "10" };

  it("accepte une campagne valide", async () => {
    const { isValid, req } = await runValidation(campaignForm, { body: { ...valid, familleIds: [VALID_OBJECT_ID], image: null } });

    expect(isValid).toBe(true);
    expect(req.body.minDiscount).toBe(10);
  });

  it("refuse les champs requis manquants et une remise minimale hors 5–70 %", async () => {
    const { errors } = await runValidation(campaignForm, { body: { minDiscount: "80" } });

    expect(errors).toEqual(expect.arrayContaining(["Le nom fait de 2 à 80 caractères.", "Date de début invalide.", "Date de fin invalide.", "Remise minimale : 5 à 70 %."]));
  });

  // Régression corrigée (marketing.form.ts, campaignForm et shopPromotionForm, champ « nom ») :
  // isString() n'a pas de withMessage, donc un nom absent ajoute le message
  // générique anglais « Invalid value » à la réponse 422.
  it("ne renvoie jamais le message générique anglais pour un nom absent", async () => {
    const campaign = await runValidation(campaignForm, { body: { ...valid, nom: undefined } });
    const promotion = await runValidation(shopPromotionForm, { params, body: { type: "coupon" } });

    expect([...campaign.errors, ...promotion.errors]).not.toContain("Invalid value");
  });

  it("n'exige rien d'autre que l'identifiant à la modification", async () => {
    expect((await runValidation(campaignUpdateForm, { params, body: { actif: "false" } })).req.body.actif).toBe(false);
    expect((await runValidation(campaignUpdateForm, { params: { id: "x" }, body: {} })).errors).toEqual(["Campagne invalide."]);
    expect((await runValidation(campaignUpdateForm, { params, body: { minDiscount: 3 } })).isValid).toBe(false);
  });

  it("contrôle une inscription : boutique, 1 à 50 offres, remise de 5 à 70 %", async () => {
    const ok = await runValidation(campaignEntryForm, {
      params,
      body: { boutiqueId: VALID_OBJECT_ID, productBoutiqueIds: [VALID_OBJECT_ID], discountValue: "15", confirmHighDiscount: "true" },
    });
    expect(ok.isValid).toBe(true);
    expect(ok.req.body).toMatchObject({ discountValue: 15, confirmHighDiscount: true });

    const ko = await runValidation(campaignEntryForm, { params, body: { boutiqueId: "x", productBoutiqueIds: [], discountValue: "4" } });
    expect(ko.errors).toEqual(["Boutique invalide.", "Choisissez de 1 à 50 offres.", "Remise : 5 à 70 %."]);
  });
});

// ─────────────────────────────────────────────
describe("boostForm", () => {
  const valid = { kind: "product", productBoutiqueIds: [VALID_OBJECT_ID], dailyBudget: "10000", days: "7" };

  it("accepte un boost valide et convertit budget et durée", async () => {
    const { isValid, req } = await runValidation(boostForm, { params, body: valid });

    expect(isValid).toBe(true);
    expect(req.body).toMatchObject({ dailyBudget: 10_000, days: 7 });
  });

  it("accepte un boost de promotion sans produit, et une promotion vide", async () => {
    expect((await runValidation(boostForm, { params, body: { ...valid, kind: "promotion", productBoutiqueIds: undefined, promotionId: VALID_OBJECT_ID } })).isValid).toBe(true);
    expect((await runValidation(boostForm, { params, body: { ...valid, promotionId: "" } })).isValid).toBe(true);
  });

  it("refuse une sorte, un objectif, un budget et une durée invalides", async () => {
    const { errors } = await runValidation(boostForm, {
      params,
      body: { kind: "story", goal: "likes", dailyBudget: "0", days: "31", productBoutiqueIds: Array.from({ length: 11 }, () => VALID_OBJECT_ID) },
    });

    expect(errors).toEqual([
      "Choisissez un boost de promotion ou de produit.",
      "Produits : 10 au plus.",
      "Objectif : visits ou views.",
      "Budget par jour invalide.",
      "Un boost dure de 1 à 30 jours.",
    ]);
  });

  it("contrôle l'audience", async () => {
    const { errors } = await runValidation(boostForm, { params, body: { ...valid, audience: "tout le monde" } });
    expect(errors).toEqual(["Audience invalide."]);

    const custom = await runValidation(boostForm, {
      params,
      body: { ...valid, audience: { mode: "manual", communes: Array.from({ length: 21 }, () => "Ratoma"), interestFamilleIds: ["x"], relation: "friends" } },
    });
    expect(custom.isValid).toBe(false);
    expect(custom.errors).toContain("Audience : auto ou custom.");
  });
});

describe("identifiants, crédits et réglages", () => {
  it("contrôle les identifiants de boutique et de boost", async () => {
    expect((await runValidation(shopIdParam, { params: { id: "x" } })).errors).toEqual(["Boutique invalide."]);
    expect((await runValidation(boostIdParam, { params: { id: "x" } })).errors).toEqual(["Boost invalide."]);
  });

  it.each([
    ["999", false],
    ["1000", true],
    ["10000000", true],
    ["10000001", false],
  ])("recharge de %s GNF → valide : %s", async (amount, valid) => {
    const { isValid, errors } = await runValidation(rechargeForm, { params, body: { amount } });

    expect(isValid).toBe(valid);
    if (!valid) expect(errors).toEqual(["Recharge de 1 000 à 10 000 000 GNF."]);
  });

  it("contrôle le règlement simulé d'une recharge", async () => {
    expect((await runValidation(sandboxCreditsForm, { params: { ...params, purchaseId: VALID_OBJECT_ID }, body: { outcome: "paid" } })).isValid).toBe(true);
    expect((await runValidation(sandboxCreditsForm, { params: { ...params, purchaseId: "x" }, body: { outcome: "maybe" } })).errors).toEqual([
      "Recharge invalide.",
      "Issue : paid ou failed.",
    ]);
  });

  it("contrôle les réglages des boosts", async () => {
    const ok = await runValidation(boostSettingsForm, { body: { costPerVisit: "800", monthlyCredits: "0", minVisitsPerDay: "10" } });
    expect(ok.isValid).toBe(true);
    expect(ok.req.body).toMatchObject({ costPerVisit: 800, monthlyCredits: 0, minVisitsPerDay: 10 });

    expect((await runValidation(boostSettingsForm, { body: { costPerVisit: "0" } })).isValid).toBe(false);
    expect((await runValidation(boostSettingsForm, { body: { minVisitsPerDay: "1001" } })).isValid).toBe(false);
  });
});
