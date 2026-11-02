import { describe, it, expect } from "vitest";
import {
  createSanctionForm,
  liftSanctionForm,
  listSanctionsForm,
  sanctionIdParam,
} from "../../../../src/shared/forms/sanction.form.js";
import { VALID_OBJECT_ID, runValidation } from "../../../helpers/validation.js";

const validSanction = (over: Record<string, unknown> = {}) => ({
  type: "suspension",
  targetKind: "shop",
  targetId: VALID_OBJECT_ID,
  reason: "Paiements demandés hors plateforme, à plusieurs reprises.",
  days: "7",
  ...over,
});

// ─────────────────────────────────────────────
describe("createSanctionForm", () => {
  it("accepte une mesure complète et convertit la durée en entier", async () => {
    const { isValid, errors, req } = await runValidation(createSanctionForm, { body: validSanction({ ticketId: VALID_OBJECT_ID }) });

    expect(errors).toEqual([]);
    expect(isValid).toBe(true);
    expect(req.body.days).toBe(7);
  });

  it("refuse une mesure, une cible ou un identifiant inconnus", async () => {
    const { errors } = await runValidation(createSanctionForm, {
      body: validSanction({ type: "ban", targetKind: "order", targetId: "kaloum" }),
    });

    expect(errors).toEqual([
      "Mesure invalide. Valeurs acceptées : hide, warning, suspension, block.",
      "Cible invalide. Valeurs acceptées : offer, review, shop, user.",
      "Cible invalide.",
    ]);
  });

  it.each([
    ["trop court", "Abus."],
    ["trop long", "x".repeat(1001)],
  ])("refuse un motif %s", async (_label, reason) => {
    const { errors } = await runValidation(createSanctionForm, { body: validSanction({ reason }) });

    expect(errors).toEqual(["Motivez la mesure : 10 à 1 000 caractères."]);
  });

  it("refuse une demande mal formée et une durée nulle", async () => {
    const { errors } = await runValidation(createSanctionForm, { body: validSanction({ ticketId: "SUP-1", days: "0" }) });

    expect(errors).toEqual(["Demande invalide.", "Durée invalide."]);
  });

  it("accepte une mesure sans durée (la durée se vérifie selon la mesure)", async () => {
    const body = validSanction({ type: "warning" });
    delete (body as Record<string, unknown>).days;

    const { isValid } = await runValidation(createSanctionForm, { body });

    expect(isValid).toBe(true);
  });
});

describe("sanctionIdParam et liftSanctionForm", () => {
  it("exige un identifiant de mesure valide", async () => {
    expect((await runValidation(sanctionIdParam, { params: { id: VALID_OBJECT_ID } })).isValid).toBe(true);
    expect((await runValidation(sanctionIdParam, { params: { id: "42" } })).errors).toEqual(["Identifiant de mesure invalide."]);
  });

  it("accepte une levée motivée ou non, motif borné à 1 000 caractères", async () => {
    const params = { id: VALID_OBJECT_ID };

    expect((await runValidation(liftSanctionForm, { params })).isValid).toBe(true);
    expect((await runValidation(liftSanctionForm, { params, body: { reason: "Annonce corrigée." } })).isValid).toBe(true);
    expect((await runValidation(liftSanctionForm, { params, body: { reason: "x".repeat(1001) } })).errors).toEqual([
      "Maximum 1 000 caractères.",
    ]);
  });
});

describe("listSanctionsForm", () => {
  it("accepte l'historique d'une cible et les mesures à revoir", async () => {
    const { isValid } = await runValidation(listSanctionsForm, {
      query: { targetKind: "offer", targetId: VALID_OBJECT_ID, pending: "true" },
    });

    expect(isValid).toBe(true);
  });

  it("refuse des filtres invalides", async () => {
    const { errors } = await runValidation(listSanctionsForm, { query: { targetKind: "order", targetId: "42", pending: "oui" } });

    expect(errors).toEqual(["Cible invalide.", "Cible invalide.", "pending : vrai ou faux."]);
  });
});
