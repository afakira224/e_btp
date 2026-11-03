import { describe, it, expect } from "vitest";
import type { Request } from "express";
import { viewerOf } from "../../../../src/shared/helpers/viewer.helper.js";
import { mockExpressSession } from "../../../helpers/express.mock.js";

const request = (init: { user?: Record<string, unknown>; ip?: string; userAgent?: string }) =>
  ({
    session: mockExpressSession(init.user),
    ip: init.ip,
    get: (name: string) => (name === "user-agent" ? init.userAgent : undefined),
  }) as unknown as Request;

describe("viewerOf", () => {
  it("reconnaît le compte connecté", () => {
    expect(viewerOf(request({ user: { id: "u42", entityType: "user" } }))).toEqual({ key: "user:u42", userId: "u42" });
  });

  it("donne une empreinte anonyme stable, hachée, sans compte", () => {
    const a = viewerOf(request({ ip: "10.0.0.1", userAgent: "Mozilla/5.0" }));
    const again = viewerOf(request({ ip: "10.0.0.1", userAgent: "Mozilla/5.0" }));
    const other = viewerOf(request({ ip: "10.0.0.2", userAgent: "Mozilla/5.0" }));

    expect(a.key).toMatch(/^anon:[0-9a-f]{32}$/);
    expect(a).not.toHaveProperty("userId");
    expect(again.key).toBe(a.key);
    expect(other.key).not.toBe(a.key);
    // Ni l'adresse ni le navigateur n'apparaissent en clair.
    expect(a.key).not.toContain("10.0.0.1");
  });

  it("tolère une requête sans adresse ni navigateur", () => {
    expect(viewerOf({ session: undefined } as unknown as Request).key).toMatch(/^anon:/);
  });
});
