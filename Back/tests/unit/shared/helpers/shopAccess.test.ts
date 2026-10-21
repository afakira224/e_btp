import { describe, it, expect } from "vitest";
import { canManageShop } from "../../../../src/shared/helpers/shopAccess.js";
import { EntityType } from "../../../../src/models/user.model.js";
import { makeShop, oid } from "../../../helpers/factories.js";

describe("canManageShop", () => {
  const ownerId = oid();
  const shop = makeShop({ ownerId });

  it("autorise le gérant de la boutique", () => {
    expect(canManageShop({ id: ownerId.toString(), entityType: EntityType.SHOP }, shop)).toBe(true);
  });

  it("autorise un administrateur", () => {
    expect(canManageShop({ id: oid().toString(), entityType: EntityType.ADMIN }, shop)).toBe(true);
  });

  it("refuse le gérant d'une autre boutique", () => {
    expect(canManageShop({ id: oid().toString(), entityType: EntityType.SHOP }, shop)).toBe(false);
  });

  it("refuse un client, même s'il porte l'identifiant du gérant", () => {
    expect(canManageShop({ id: ownerId.toString(), entityType: EntityType.USER }, shop)).toBe(false);
  });

  it("refuse sans identité", () => {
    expect(canManageShop(undefined, shop)).toBe(false);
  });
});
