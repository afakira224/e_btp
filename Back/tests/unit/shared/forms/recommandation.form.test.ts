import { describe, it, expect } from "vitest";
import { complementsForm, lireIds, recommandationsForm } from "../../../../src/shared/forms/recommandation.form.js";
import { projetForm, registerForm } from "../../../../src/shared/forms/auth.form.js";
import { VALID_OBJECT_ID, runValidation } from "../../../helpers/validation.js";

const OTHER_ID = "507f191e810c19729de860ea";

describe("recommandationsForm", () => {
  it("accepte une requête sans paramètre (accueil, visiteur sans historique)", async () => {
    const { isValid } = await runValidation(recommandationsForm, { query: {} });

    expect(isValid).toBe(true);
  });

  it("accepte une page connue et une liste de produits vus", async () => {
    const { isValid } = await runValidation(recommandationsForm, {
      query: { page: "nouveautes", vus: `${VALID_OBJECT_ID},${OTHER_ID}`, limit: "8" },
    });

    expect(isValid).toBe(true);
  });

  it("rejette une page inconnue", async () => {
    const { isValid } = await runValidation(recommandationsForm, { query: { page: "panier" } });

    expect(isValid).toBe(false);
  });

  it("rejette un identifiant invalide dans vus", async () => {
    const { isValid, errors } = await runValidation(recommandationsForm, { query: { vus: `${VALID_OBJECT_ID},abc` } });

    expect(isValid).toBe(false);
    expect(errors).toContain("Identifiant invalide dans vus.");
  });

  it("limite l'historique envoyé à 20 produits", async () => {
    const vus = Array.from({ length: 21 }, () => VALID_OBJECT_ID).join(",");
    const { isValid } = await runValidation(recommandationsForm, { query: { vus } });

    expect(isValid).toBe(false);
  });

  it("borne limit entre 1 et 24", async () => {
    expect((await runValidation(recommandationsForm, { query: { limit: "0" } })).isValid).toBe(false);
    expect((await runValidation(recommandationsForm, { query: { limit: "25" } })).isValid).toBe(false);
  });
});

describe("complementsForm", () => {
  it("exige au moins une offre", async () => {
    const { isValid, errors } = await runValidation(complementsForm, { query: {} });

    expect(isValid).toBe(false);
    expect(errors).toContain("Le paramètre offres est requis.");
  });

  it("accepte les offres d'un panier", async () => {
    const { isValid } = await runValidation(complementsForm, { query: { offres: `${VALID_OBJECT_ID},${OTHER_ID}` } });

    expect(isValid).toBe(true);
  });
});

describe("lireIds", () => {
  it("découpe, retire les vides et les doublons", () => {
    expect(lireIds("a,,b,a")).toEqual(["a", "b"]);
    expect(lireIds(undefined)).toEqual([]);
  });
});

describe("projetForm", () => {
  it("accepte des types et un avancement connus", async () => {
    const { isValid } = await runValidation(projetForm, {
      body: { types: ["construction", "renovation"], avancement: "pas_commence" },
    });

    expect(isValid).toBe(true);
  });

  it("accepte un projet vide (effacer sa réponse)", async () => {
    const { isValid } = await runValidation(projetForm, { body: { avancement: null } });

    expect(isValid).toBe(true);
  });

  it("rejette un type ou un avancement inconnu", async () => {
    expect((await runValidation(projetForm, { body: { types: ["chateau"] } })).isValid).toBe(false);
    expect((await runValidation(projetForm, { body: { avancement: "toiture" } })).isValid).toBe(false);
  });
});

describe("registerForm : projet", () => {
  const body = (projet: unknown) => ({
    nom: "Diallo", prenom: "Mamadou", email: "mamadou.diallo@example.com", telephone: "620000000",
    password: "MotDePasse1!", confirmPassword: "MotDePasse1!", role: "user", projet,
  });

  it("valide le projet décrit à l'inscription", async () => {
    const { errors } = await runValidation(registerForm, { body: body({ types: ["chateau"] }) });

    expect(errors.some((e) => e.startsWith("Type de projet invalide"))).toBe(true);
  });

  it("laisse passer une inscription sans projet", async () => {
    const { errors } = await runValidation(registerForm, { body: body(null) });

    expect(errors.some((e) => e.toLowerCase().includes("projet"))).toBe(false);
  });
});
