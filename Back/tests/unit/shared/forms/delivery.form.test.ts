import { describe, it, expect } from "vitest";
import {
  deliveryQuoteForm,
  productDeliveryFields,
  shopDeliveryForm,
} from "../../../../src/shared/forms/delivery.form.js";
import { createOrderForm } from "../../../../src/shared/forms/order.form.js";
import { createProductBoutiqueForm } from "../../../../src/shared/forms/product.form.js";
import { VALID_OBJECT_ID, runValidation } from "../../../helpers/validation.js";

const FEE_MESSAGE = "Le tarif de livraison doit être un nombre entier positif de GNF.";

describe("shopDeliveryForm", () => {
  const run = (body: Record<string, unknown>) =>
    runValidation(shopDeliveryForm, { params: { id: VALID_OBJECT_ID }, body });

  it("accepte plusieurs modes et un tarif entier", async () => {
    const { isValid, req } = await run({ modes: ["pickup", "flat_rate"], flatRateFee: "25000" });

    expect(isValid).toBe(true);
    expect(req.body.flatRateFee).toBe(25_000);
  });

  it("accepte un tarif absent ou nul quand le prix fixe n'est pas demandé", async () => {
    expect((await run({ modes: ["free"] })).isValid).toBe(true);
    expect((await run({ modes: ["free"], flatRateFee: null })).isValid).toBe(true);
  });

  it.each([-1, 2500.5, "abc"])("rejette le tarif %s", async (flatRateFee) => {
    const { isValid, errors } = await run({ modes: ["flat_rate"], flatRateFee });

    expect(isValid).toBe(false);
    expect(errors).toContain(FEE_MESSAGE);
  });

  it("rejette un mode inconnu, y compris les anciens modes", async () => {
    const { isValid, errors } = await run({ modes: ["pickup", "express"] });

    expect(isValid).toBe(false);
    expect(errors).toContain("Mode de livraison invalide. Valeurs autorisées : pickup, free, flat_rate.");
  });

  it("exige la liste des modes", async () => {
    const { isValid } = await run({ flatRateFee: 25_000 });

    expect(isValid).toBe(false);
  });

  it("rejette un identifiant de boutique invalide", async () => {
    const { errors } = await runValidation(shopDeliveryForm, { params: { id: "abc" }, body: { modes: ["free"] } });

    expect(errors).toContain("Identifiant de boutique invalide.");
  });
});

describe("productDeliveryFields", () => {
  it("lit la livraison envoyée en JSON dans un multipart/form-data", async () => {
    const { isValid, req } = await runValidation(productDeliveryFields, {
      body: { delivery: '{"useShopSettings":false,"modes":["flat_rate"],"flatRateFee":"40000"}' },
    });

    expect(isValid).toBe(true);
    expect(req.body.delivery).toEqual({ useShopSettings: false, modes: ["flat_rate"], flatRateFee: 40_000 });
  });

  it("accepte le retour à l'héritage", async () => {
    const { isValid, req } = await runValidation(productDeliveryFields, {
      body: { delivery: { useShopSettings: "true" } },
    });

    expect(isValid).toBe(true);
    expect(req.body.delivery.useShopSettings).toBe(true);
  });

  it("rejette un objet illisible", async () => {
    const { errors } = await runValidation(productDeliveryFields, { body: { delivery: "{pas du json" } });

    expect(errors).toContain("delivery doit être un objet { useShopSettings, modes?, flatRateFee? }.");
  });

  it("rejette un tarif négatif", async () => {
    const { errors } = await runValidation(productDeliveryFields, {
      body: { delivery: { useShopSettings: false, modes: ["flat_rate"], flatRateFee: -5 } },
    });

    expect(errors).toContain(FEE_MESSAGE);
  });

  it("est branché sur le formulaire de création d'offre", async () => {
    const { errors } = await runValidation(createProductBoutiqueForm, {
      body: {
        boutiqueId: VALID_OBJECT_ID,
        productId: VALID_OBJECT_ID,
        price: 1_000,
        stock: 1,
        delivery: { useShopSettings: false, modes: ["teleport"] },
      },
    });

    expect(errors).toContain("Mode de livraison invalide. Valeurs autorisées : pickup, free, flat_rate.");
  });
});

describe("choix de livraison du client", () => {
  it("accepte un mode par boutique", async () => {
    const { isValid } = await runValidation(deliveryQuoteForm, {
      params: { userId: VALID_OBJECT_ID },
      body: { deliveries: [{ boutiqueId: VALID_OBJECT_ID, method: "pickup" }] },
    });

    expect(isValid).toBe(true);
  });

  it("refuse les anciens modes au checkout", async () => {
    const { isValid, errors } = await runValidation(createOrderForm, {
      params: { userId: VALID_OBJECT_ID },
      body: { deliveryMethod: "standard" },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Mode de livraison invalide. Valeurs autorisées : pickup, free, flat_rate.");
  });

  it("refuse une livraison sans boutique valide", async () => {
    const { errors } = await runValidation(createOrderForm, {
      params: { userId: VALID_OBJECT_ID },
      body: { deliveries: [{ boutiqueId: "abc", method: "free" }] },
    });

    expect(errors).toContain("Identifiant de boutique invalide dans deliveries.");
  });
});
