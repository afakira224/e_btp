import { describe, it, expect } from "vitest";
import { isShopSuspended } from "../../../../src/shared/helpers/moderation.helper.js";

const NOW = new Date("2026-10-25T10:00:00.000Z");

describe("isShopSuspended", () => {
  it("laisse commander chez une boutique jamais suspendue", () => {
    expect(isShopSuspended({ suspendedUntil: null }, NOW)).toBe(false);
    expect(isShopSuspended({}, NOW)).toBe(false);
  });

  it("refuse les commandes jusqu'à la fin de la suspension", () => {
    expect(isShopSuspended({ suspendedUntil: new Date(NOW.getTime() + 1) }, NOW)).toBe(true);
    expect(isShopSuspended({ suspendedUntil: new Date("9999-12-31T00:00:00.000Z") }, NOW)).toBe(true);
  });

  it("rouvre la boutique dès l'échéance passée", () => {
    expect(isShopSuspended({ suspendedUntil: NOW }, NOW)).toBe(false);
    expect(isShopSuspended({ suspendedUntil: new Date(NOW.getTime() - 1) }, NOW)).toBe(false);
  });

  it("compare à l'instant présent par défaut", () => {
    expect(isShopSuspended({ suspendedUntil: new Date(Date.now() + 60_000) })).toBe(true);
    expect(isShopSuspended({ suspendedUntil: new Date(Date.now() - 60_000) })).toBe(false);
  });
});
