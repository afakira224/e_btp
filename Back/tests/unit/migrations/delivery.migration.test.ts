import { describe, it, expect, vi } from "vitest";

// La migration importe la connexion : elle ne doit jamais s'ouvrir en test.
vi.mock("../../../src/db/db.js", () => ({ DB_CONNECT: vi.fn() }));

import {
  deliveryMigrationSteps,
  runDeliveryMigration,
  type MigrationStep,
} from "../../../src/migrations/delivery.migration.js";

describe("migration de la livraison", () => {
  it("ne cible que les documents qui n'ont pas encore le champ (idempotente)", () => {
    for (const step of deliveryMigrationSteps()) {
      const field = step.label.startsWith("Commandes") ? "deliveries" : "delivery";
      expect(step.filter[field]).toEqual({ $exists: false });
      expect(step.update).toHaveProperty("$set");
      expect(step.update).not.toHaveProperty("$unset");
    }
  });

  it("reproduit l'offre d'avant pour les boutiques avec adresse", () => {
    const [withAddress] = deliveryMigrationSteps();

    expect(withAddress!.update).toEqual({
      $set: { delivery: { modes: ["pickup", "flat_rate"], flatRateFee: 25_000 } },
    });
  });

  it("ne propose pas le retrait aux boutiques sans adresse", () => {
    const [, withoutAddress] = deliveryMigrationSteps();

    expect(withoutAddress!.update).toEqual({
      $set: { delivery: { modes: ["flat_rate"], flatRateFee: 25_000 } },
    });
  });

  it("fait hériter les offres existantes de leur boutique", () => {
    const offers = deliveryMigrationSteps()[2]!;

    expect(offers.update).toEqual({
      $set: { delivery: { useShopSettings: true, modes: [], flatRateFee: null } },
    });
  });

  it("applique chaque étape et rend compte des documents modifiés", async () => {
    const step = (modifiedCount: number): MigrationStep => ({
      label: `étape ${modifiedCount}`,
      model: { updateMany: vi.fn().mockResolvedValue({ modifiedCount }) } as any,
      filter: { delivery: { $exists: false } },
      update: { $set: {} },
    });
    const steps = [step(3), step(0)];

    const report = await runDeliveryMigration(steps);

    expect(steps[0]!.model.updateMany).toHaveBeenCalledWith(steps[0]!.filter, steps[0]!.update);
    expect(report).toEqual([
      { label: "étape 3", modified: 3 },
      { label: "étape 0", modified: 0 },
    ]);
  });
});
