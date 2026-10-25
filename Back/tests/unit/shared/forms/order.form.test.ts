import { describe, it, expect } from "vitest";
import { createOrderForm, orderIdParam } from "../../../../src/shared/forms/order.form.js";
import { PaymentMethod } from "../../../../src/models/order.model.js";
import { VALID_OBJECT_ID, runValidation } from "../../../helpers/validation.js";

describe("createOrderForm", () => {
  it("accepte un checkout sans téléphone ni adresse", async () => {
    const { isValid } = await runValidation(createOrderForm, {
      params: { userId: VALID_OBJECT_ID },
      body: {},
    });

    expect(isValid).toBe(true);
  });

  it("accepte un checkout complet", async () => {
    const { isValid } = await runValidation(createOrderForm, {
      params: { userId: VALID_OBJECT_ID },
      body: { telephone: "620123456", adresse: "Conakry, Ratoma" },
    });

    expect(isValid).toBe(true);
  });

  it("rejette un userId invalide", async () => {
    const { isValid, errors } = await runValidation(createOrderForm, {
      params: { userId: "abc" },
      body: {},
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Identifiant utilisateur invalide.");
  });

  it("rejette un téléphone trop court", async () => {
    const { isValid, errors } = await runValidation(createOrderForm, {
      params: { userId: VALID_OBJECT_ID },
      body: { telephone: "62012" },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Entre 9 et 12 caractères.");
  });

  it("rejette une adresse de plus de 255 caractères", async () => {
    const { isValid, errors } = await runValidation(createOrderForm, {
      params: { userId: VALID_OBJECT_ID },
      body: { adresse: "a".repeat(256) },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Maximum 255 caractères.");
  });

  it("nettoie les espaces autour de l'adresse", async () => {
    const { req } = await runValidation(createOrderForm, {
      params: { userId: VALID_OBJECT_ID },
      body: { adresse: "  Conakry  " },
    });

    expect(req.body.adresse).toBe("Conakry");
  });

  it.each(Object.values(PaymentMethod))("accepte le mode de paiement %s", async (paymentMethod) => {
    const { isValid } = await runValidation(createOrderForm, {
      params: { userId: VALID_OBJECT_ID },
      body: { paymentMethod },
    });

    expect(isValid).toBe(true);
  });

  it("rejette un mode de paiement inconnu", async () => {
    const { isValid, errors } = await runValidation(createOrderForm, {
      params: { userId: VALID_OBJECT_ID },
      body: { paymentMethod: "cheque" },
    });

    expect(isValid).toBe(false);
    expect(errors.join(" ")).toContain("Mode de paiement invalide");
  });
});

describe("orderIdParam", () => {
  it("accepte un ObjectId valide", async () => {
    const { isValid } = await runValidation(orderIdParam, { params: { id: VALID_OBJECT_ID } });

    expect(isValid).toBe(true);
  });

  it("rejette un paramètre manquant", async () => {
    const { isValid } = await runValidation(orderIdParam, { params: {} });

    expect(isValid).toBe(false);
  });
});
