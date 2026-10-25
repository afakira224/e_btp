import { describe, it, expect } from "vitest";
import {
  createShopRequestForm,
  listShopRequestsForm,
  rejectShopRequestForm,
  shopRequestIdParam,
} from "../../../../src/shared/forms/shopRequest.form.js";
import { VALID_OBJECT_ID, runValidation } from "../../../helpers/validation.js";

const OTHER_OBJECT_ID = "507f191e810c19729de860ea";

/** Questionnaire complet d'un particulier, tel que l'envoie le profil. */
const validBody = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  nom: "Quincaillerie Kipé",
  description: "Quincaillerie générale : visserie, outillage à main, serrurerie.",
  familleIds: [VALID_OBJECT_ID, OTHER_OBJECT_ID],
  sellerType: "particulier",
  experience: "1_3_ans",
  catalogSize: "moins_50",
  hasPhysicalStore: true,
  adresse: "Kipé, Ratoma, Conakry",
  email: "contact@kipe.gn",
  message: "Nous livrons déjà les chantiers du quartier.",
  acceptTerms: true,
  ...over,
});

/** Retire un champ du questionnaire valide. */
const without = (field: string): Record<string, unknown> => {
  const body = validBody();
  delete body[field];
  return body;
};

describe("createShopRequestForm", () => {
  it("accepte un questionnaire complet", async () => {
    const { isValid, errors } = await runValidation(createShopRequestForm, { body: validBody() });

    expect(errors).toEqual([]);
    expect(isValid).toBe(true);
  });

  it("accepte un questionnaire sans email ni message", async () => {
    const body = validBody();
    delete body.email;
    delete body.message;

    const { isValid } = await runValidation(createShopRequestForm, { body });

    expect(isValid).toBe(true);
  });

  it.each([
    ["nom", "Le nom de la boutique est requis."],
    ["description", "La présentation de la boutique est requise."],
    ["familleIds", "Choisissez au moins un domaine d'activité."],
    ["sellerType", "Précisez si vous vendez en tant que particulier ou entreprise."],
    ["experience", "Indiquez l'ancienneté de votre activité."],
    ["catalogSize", "Indiquez le nombre de produits que vous comptez vendre."],
    ["hasPhysicalStore", "Indiquez si vous disposez d'un point de vente."],
    ["adresse", "L'adresse de la boutique est requise."],
    ["acceptTerms", "Vous devez accepter les conditions de vente de la plateforme."],
  ])("exige le champ %s", async (field, message) => {
    const { isValid, errors } = await runValidation(createShopRequestForm, { body: without(field) });

    expect(isValid).toBe(false);
    expect(errors).toContain(message);
  });

  it("rejette un nom composé uniquement d'espaces", async () => {
    const { isValid, errors } = await runValidation(createShopRequestForm, {
      body: validBody({ nom: "    " }),
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Le nom de la boutique est requis.");
  });

  it.each(["A", "a".repeat(101)])("rejette un nom hors de 2 à 100 caractères (%#)", async (nom) => {
    const { isValid, errors } = await runValidation(createShopRequestForm, { body: validBody({ nom }) });

    expect(isValid).toBe(false);
    expect(errors).toContain("Le nom de la boutique doit compter entre 2 et 100 caractères.");
  });

  it.each(["Trop courte", "a".repeat(1001)])(
    "rejette une présentation hors de 20 à 1000 caractères (%#)",
    async (description) => {
      const { isValid, errors } = await runValidation(createShopRequestForm, {
        body: validBody({ description }),
      });

      expect(isValid).toBe(false);
      expect(errors).toContain("La présentation doit compter entre 20 et 1000 caractères.");
    }
  );

  it.each(["Kipé", "a".repeat(256)])("rejette une adresse hors de 5 à 255 caractères (%#)", async (adresse) => {
    const { isValid, errors } = await runValidation(createShopRequestForm, {
      body: validBody({ adresse }),
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("L'adresse doit compter entre 5 et 255 caractères.");
  });

  it("nettoie les espaces autour du nom, de la présentation et de l'adresse", async () => {
    const { req } = await runValidation(createShopRequestForm, {
      body: validBody({
        nom: "  Quincaillerie Kipé  ",
        description: "  Quincaillerie générale : visserie, outillage à main.  ",
        adresse: "  Kipé, Ratoma  ",
      }),
    });

    expect(req.body.nom).toBe("Quincaillerie Kipé");
    expect(req.body.description).toBe("Quincaillerie générale : visserie, outillage à main.");
    expect(req.body.adresse).toBe("Kipé, Ratoma");
  });

  // ── Domaines d'activité ──────────────────────
  it("rejette une liste de domaines vide", async () => {
    const { isValid, errors } = await runValidation(createShopRequestForm, {
      body: validBody({ familleIds: [] }),
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Choisissez au moins un domaine d'activité.");
  });

  it("rejette plus de 20 domaines", async () => {
    const { isValid, errors } = await runValidation(createShopRequestForm, {
      body: validBody({ familleIds: Array.from({ length: 21 }, () => VALID_OBJECT_ID) }),
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Choisissez au moins un domaine d'activité.");
  });

  it("rejette des domaines qui ne sont pas une liste", async () => {
    const { isValid, errors } = await runValidation(createShopRequestForm, {
      body: validBody({ familleIds: VALID_OBJECT_ID }),
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Choisissez au moins un domaine d'activité.");
  });

  it("rejette un identifiant de domaine mal formé", async () => {
    const { isValid, errors } = await runValidation(createShopRequestForm, {
      body: validBody({ familleIds: [VALID_OBJECT_ID, "abc"] }),
    });

    expect(isValid).toBe(false);
    expect(errors).toEqual(["Domaine d'activité invalide."]);
  });

  // ── Statut du vendeur et registre du commerce ─
  it("rejette un statut de vendeur inconnu", async () => {
    const { isValid, errors } = await runValidation(createShopRequestForm, {
      body: validBody({ sellerType: "association" }),
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Statut invalide. Valeurs acceptées : particulier, entreprise.");
  });

  it("n'exige pas de RCCM d'un particulier", async () => {
    const { isValid, errors } = await runValidation(createShopRequestForm, {
      body: validBody({ sellerType: "particulier" }),
    });

    expect(errors).toEqual([]);
    expect(isValid).toBe(true);
  });

  it("ne contrôle pas le RCCM envoyé par un particulier", async () => {
    const { isValid } = await runValidation(createShopRequestForm, {
      body: validBody({ sellerType: "particulier", rccm: "x" }),
    });

    expect(isValid).toBe(true);
  });

  it("exige le RCCM d'une entreprise", async () => {
    const { isValid, errors } = await runValidation(createShopRequestForm, {
      body: validBody({ sellerType: "entreprise" }),
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Le numéro RCCM est requis pour une entreprise.");
  });

  it("rejette un RCCM d'entreprise composé uniquement d'espaces", async () => {
    const { isValid, errors } = await runValidation(createShopRequestForm, {
      body: validBody({ sellerType: "entreprise", rccm: "   " }),
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Le numéro RCCM est requis pour une entreprise.");
  });

  it.each(["GN.1", "G".repeat(51)])("rejette un RCCM hors de 5 à 50 caractères (%#)", async (rccm) => {
    const { isValid, errors } = await runValidation(createShopRequestForm, {
      body: validBody({ sellerType: "entreprise", rccm }),
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Le numéro RCCM doit compter entre 5 et 50 caractères.");
  });

  it("accepte une entreprise avec son RCCM, nettoyé des espaces", async () => {
    const { isValid, req } = await runValidation(createShopRequestForm, {
      body: validBody({ sellerType: "entreprise", rccm: "  GN.TCC.2024.B.01234  " }),
    });

    expect(isValid).toBe(true);
    expect(req.body.rccm).toBe("GN.TCC.2024.B.01234");
  });

  // ── Ancienneté et taille du catalogue ────────
  it("rejette une ancienneté inconnue", async () => {
    const { isValid, errors } = await runValidation(createShopRequestForm, {
      body: validBody({ experience: "20_ans" }),
    });

    expect(isValid).toBe(false);
    expect(errors).toContain(
      "Ancienneté invalide. Valeurs acceptées : debutant, 1_3_ans, 3_10_ans, plus_10_ans."
    );
  });

  it("rejette une taille de catalogue inconnue", async () => {
    const { isValid, errors } = await runValidation(createShopRequestForm, {
      body: validBody({ catalogSize: "enorme" }),
    });

    expect(isValid).toBe(false);
    expect(errors).toContain(
      "Taille de catalogue invalide. Valeurs acceptées : moins_50, 50_200, plus_200."
    );
  });

  // ── Point de vente ───────────────────────────
  it.each([
    [true, true],
    ["true", true],
    [false, false],
    ["false", false],
  ])("convertit hasPhysicalStore %j en booléen %j", async (hasPhysicalStore, expected) => {
    const { isValid, req } = await runValidation(createShopRequestForm, {
      body: validBody({ hasPhysicalStore }),
    });

    expect(isValid).toBe(true);
    expect(req.body.hasPhysicalStore).toBe(expected);
  });

  it("rejette un hasPhysicalStore non booléen", async () => {
    const { isValid, errors } = await runValidation(createShopRequestForm, {
      body: validBody({ hasPhysicalStore: "peut-être" }),
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Indiquez si vous disposez d'un point de vente.");
  });

  // ── Email et message ─────────────────────────
  it("accepte un email vide", async () => {
    const { isValid } = await runValidation(createShopRequestForm, { body: validBody({ email: "" }) });

    expect(isValid).toBe(true);
  });

  it("rejette un email mal formé", async () => {
    const { isValid, errors } = await runValidation(createShopRequestForm, {
      body: validBody({ email: "pas-un-email" }),
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Email de la boutique invalide.");
  });

  it("normalise l'email de la boutique", async () => {
    const { isValid, req } = await runValidation(createShopRequestForm, {
      body: validBody({ email: "  Contact@Kipe.GN " }),
    });

    expect(isValid).toBe(true);
    expect(req.body.email).toBe("contact@kipe.gn");
  });

  it("accepte un message nul", async () => {
    const { isValid } = await runValidation(createShopRequestForm, { body: validBody({ message: null }) });

    expect(isValid).toBe(true);
  });

  it("rejette un message de plus de 1000 caractères", async () => {
    const { isValid, errors } = await runValidation(createShopRequestForm, {
      body: validBody({ message: "a".repeat(1001) }),
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Le message ne peut dépasser 1000 caractères.");
  });

  // ── Conditions de vente ──────────────────────
  it.each([true, "true"])("accepte acceptTerms = %j", async (acceptTerms) => {
    const { isValid } = await runValidation(createShopRequestForm, { body: validBody({ acceptTerms }) });

    expect(isValid).toBe(true);
  });

  it.each([false, "false", "oui", 1, null])("rejette acceptTerms = %j", async (acceptTerms) => {
    const { isValid, errors } = await runValidation(createShopRequestForm, {
      body: validBody({ acceptTerms }),
    });

    expect(isValid).toBe(false);
    expect(errors).toEqual(["Vous devez accepter les conditions de vente de la plateforme."]);
  });
});

describe("rejectShopRequestForm", () => {
  it("accepte un motif argumenté", async () => {
    const { isValid } = await runValidation(rejectShopRequestForm, {
      body: { reason: "Le numéro RCCM fourni ne correspond à aucune entreprise." },
    });

    expect(isValid).toBe(true);
  });

  it("exige un motif", async () => {
    const { isValid, errors } = await runValidation(rejectShopRequestForm, { body: {} });

    expect(isValid).toBe(false);
    expect(errors).toContain("Le motif du refus est requis.");
  });

  it("rejette un motif composé uniquement d'espaces", async () => {
    const { isValid, errors } = await runValidation(rejectShopRequestForm, { body: { reason: "      " } });

    expect(isValid).toBe(false);
    expect(errors).toContain("Le motif du refus est requis.");
  });

  it.each(["Incomplet", "a".repeat(501)])("rejette un motif hors de 10 à 500 caractères (%#)", async (reason) => {
    const { isValid, errors } = await runValidation(rejectShopRequestForm, { body: { reason } });

    expect(isValid).toBe(false);
    expect(errors).toEqual(["Le motif doit compter entre 10 et 500 caractères."]);
  });

  it.each(["a".repeat(10), "a".repeat(500)])("accepte un motif aux bornes (%#)", async (reason) => {
    const { isValid } = await runValidation(rejectShopRequestForm, { body: { reason } });

    expect(isValid).toBe(true);
  });

  it("nettoie les espaces autour du motif", async () => {
    const { req } = await runValidation(rejectShopRequestForm, {
      body: { reason: "   Nom de boutique trompeur.   " },
    });

    expect(req.body.reason).toBe("Nom de boutique trompeur.");
  });
});

describe("listShopRequestsForm", () => {
  it("accepte une requête sans filtre", async () => {
    const { isValid } = await runValidation(listShopRequestsForm, { query: {} });

    expect(isValid).toBe(true);
  });

  it.each(["pending", "approved", "rejected", "cancelled"])("accepte le statut %s", async (status) => {
    const { isValid } = await runValidation(listShopRequestsForm, {
      query: { status, search: "Kipé", page: "2", limit: "20" },
    });

    expect(isValid).toBe(true);
  });

  it("rejette un statut inconnu", async () => {
    const { isValid, errors } = await runValidation(listShopRequestsForm, { query: { status: "archived" } });

    expect(isValid).toBe(false);
    expect(errors).toContain(
      "Statut invalide. Valeurs acceptées : pending, approved, rejected, cancelled."
    );
  });

  it("rejette une recherche de plus de 100 caractères", async () => {
    const { isValid, errors } = await runValidation(listShopRequestsForm, {
      query: { search: "a".repeat(101) },
    });

    expect(isValid).toBe(false);
    expect(errors).toContain("Recherche limitée à 100 caractères.");
  });

  it.each(["0", "-1", "abc"])("rejette la page %s", async (page) => {
    const { isValid, errors } = await runValidation(listShopRequestsForm, { query: { page } });

    expect(isValid).toBe(false);
    expect(errors).toContain("La page doit être un entier positif.");
  });

  it.each(["0", "101", "abc"])("rejette la limite %s", async (limit) => {
    const { isValid, errors } = await runValidation(listShopRequestsForm, { query: { limit } });

    expect(isValid).toBe(false);
    expect(errors).toContain("La limite doit être comprise entre 1 et 100.");
  });

  it.each(["1", "100"])("accepte la limite %s", async (limit) => {
    const { isValid } = await runValidation(listShopRequestsForm, { query: { limit } });

    expect(isValid).toBe(true);
  });
});

describe("shopRequestIdParam", () => {
  it("accepte un ObjectId valide", async () => {
    const { isValid } = await runValidation(shopRequestIdParam, { params: { id: VALID_OBJECT_ID } });

    expect(isValid).toBe(true);
  });

  it.each(["abc", "mine", ""])("rejette l'identifiant %j", async (id) => {
    const { isValid, errors } = await runValidation(shopRequestIdParam, { params: { id } });

    expect(isValid).toBe(false);
    expect(errors).toEqual(["Identifiant de demande invalide."]);
  });
});
