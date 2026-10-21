import { describe, it, expect } from "vitest";
import {
  addressIdParam,
  createAddressForm,
  listAddressesForm,
  updateAddressForm,
} from "../../../../src/shared/forms/address.form.js";
import { VALID_OBJECT_ID, runValidation } from "../../../helpers/validation.js";

const validBody = {
  userId: VALID_OBJECT_ID,
  telephone: "620123456",
  adresse: "Rue KA-020",
  ville: "Conakry",
};

describe("createAddressForm", () => {
  it("accepte une adresse minimale valide", async () => {
    const { isValid } = await runValidation(createAddressForm, { body: validBody });

    expect(isValid).toBe(true);
  });

  it("accepte une adresse complète", async () => {
    const { isValid } = await runValidation(createAddressForm, {
      body: {
        ...validBody,
        label: "Maison",
        destinataire: "Mamadou Diallo",
        commune: "Ratoma",
        pays: "Guinée",
        isDefault: true,
      },
    });

    expect(isValid).toBe(true);
  });

  it("exige userId, telephone, adresse et ville", async () => {
    const { isValid, errors } = await runValidation(createAddressForm, { body: {} });

    expect(isValid).toBe(false);
    expect(errors).toEqual(
      expect.arrayContaining([
        "L'identifiant utilisateur est requis.",
        "Le téléphone est requis.",
        "L'adresse est requise.",
        "La ville est requise.",
      ])
    );
  });

  it.each(["12345678", "1234567890123"])(
    "rejette un téléphone hors de 9 à 12 caractères (%s)",
    async (telephone) => {
      const { isValid, errors } = await runValidation(createAddressForm, {
        body: { ...validBody, telephone },
      });

      expect(isValid).toBe(false);
      expect(errors).toContain("Entre 9 et 12 caractères.");
    }
  );

  it.each(["620123456", "224620123456"])("accepte le téléphone %s", async (telephone) => {
    const { isValid } = await runValidation(createAddressForm, {
      body: { ...validBody, telephone },
    });

    expect(isValid).toBe(true);
  });

  it("rejette une adresse de plus de 255 caractères", async () => {
    const { isValid } = await runValidation(createAddressForm, {
      body: { ...validBody, adresse: "a".repeat(256) },
    });

    expect(isValid).toBe(false);
  });

  it("nettoie les espaces autour des champs texte", async () => {
    const { req } = await runValidation(createAddressForm, {
      body: { ...validBody, ville: "  Conakry  ", adresse: "  Rue KA-020  " },
    });

    expect(req.body.ville).toBe("Conakry");
    expect(req.body.adresse).toBe("Rue KA-020");
  });

  it("convertit isDefault en booléen", async () => {
    const { isValid, req } = await runValidation(createAddressForm, {
      body: { ...validBody, isDefault: "true" },
    });

    expect(isValid).toBe(true);
    expect(req.body.isDefault).toBe(true);
  });

  it("rejette un isDefault non booléen", async () => {
    const { isValid, errors } = await runValidation(createAddressForm, {
      body: { ...validBody, isDefault: "peut-être" },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("isDefault doit être un booléen.");
  });

  it("rejette une adresse composée uniquement d'espaces", async () => {
    const { isValid, errors } = await runValidation(createAddressForm, {
      body: { ...validBody, adresse: "     " },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("L'adresse est requise.");
  });
});

describe("updateAddressForm", () => {
  it("accepte une mise à jour partielle", async () => {
    const { isValid } = await runValidation(updateAddressForm, {
      params: { id: VALID_OBJECT_ID },
      body: { ville: "Kindia" },
    });

    expect(isValid).toBe(true);
  });

  it("accepte un corps vide", async () => {
    const { isValid } = await runValidation(updateAddressForm, {
      params: { id: VALID_OBJECT_ID },
      body: {},
    });

    expect(isValid).toBe(true);
  });

  it("rejette une ville explicitement vidée", async () => {
    const { isValid, errors } = await runValidation(updateAddressForm, {
      params: { id: VALID_OBJECT_ID },
      body: { ville: "   " },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("La ville ne peut pas être vide.");
  });

  it("rejette un identifiant d'adresse invalide", async () => {
    const { isValid, errors } = await runValidation(updateAddressForm, {
      params: { id: "abc" },
      body: {},
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Identifiant d'adresse invalide.");
  });
});

describe("listAddressesForm", () => {
  it("accepte un userId valide en query", async () => {
    const { isValid } = await runValidation(listAddressesForm, {
      query: { userId: VALID_OBJECT_ID },
    });

    expect(isValid).toBe(true);
  });

  it("exige le paramètre userId", async () => {
    const { isValid, errors } = await runValidation(listAddressesForm, { query: {} });

    expect(isValid).toBe(false);
    expect(errors).toContain("Le paramètre userId est requis.");
  });

  it("rejette un userId mal formé", async () => {
    const { isValid, errors } = await runValidation(listAddressesForm, {
      query: { userId: "abc" },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Identifiant utilisateur invalide.");
  });
});

describe("addressIdParam", () => {
  it("accepte un ObjectId valide", async () => {
    const { isValid } = await runValidation(addressIdParam, { params: { id: VALID_OBJECT_ID } });

    expect(isValid).toBe(true);
  });
});
