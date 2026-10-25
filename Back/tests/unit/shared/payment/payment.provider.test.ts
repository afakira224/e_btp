import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getPaymentProvider,
  isSandboxPayment,
  sandboxProvider,
} from "../../../../src/shared/payment/payment.provider.js";

// ─────────────────────────────────────────────
//  Choix du prestataire : PAYMENT_PROVIDER, sinon le prestataire simulé hors
//  production et aucun en production — le paiement en ligne y est refusé
//  plutôt que simulé.
// ─────────────────────────────────────────────
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getPaymentProvider", () => {
  it("prend le prestataire simulé par défaut hors production", () => {
    vi.stubEnv("PAYMENT_PROVIDER", undefined);
    vi.stubEnv("NODE_ENV", "development");

    expect(getPaymentProvider()).toBe(sandboxProvider);
    expect(isSandboxPayment()).toBe(true);
  });

  it("n'en prend aucun par défaut en production", () => {
    vi.stubEnv("PAYMENT_PROVIDER", undefined);
    vi.stubEnv("NODE_ENV", "production");

    expect(getPaymentProvider()).toBeNull();
    expect(isSandboxPayment()).toBe(false);
  });

  it("suit PAYMENT_PROVIDER, même en production", () => {
    vi.stubEnv("PAYMENT_PROVIDER", "sandbox");
    vi.stubEnv("NODE_ENV", "production");

    expect(getPaymentProvider()).toBe(sandboxProvider);
  });

  it("n'en prend aucun pour un nom inconnu ou vide", () => {
    vi.stubEnv("NODE_ENV", "development");

    vi.stubEnv("PAYMENT_PROVIDER", "orange-money");
    expect(getPaymentProvider()).toBeNull();

    vi.stubEnv("PAYMENT_PROVIDER", "");
    expect(getPaymentProvider()).toBeNull();
  });
});

describe("sandboxProvider", () => {
  it("renvoie vers la page de paiement factice du front, avec une référence unique", async () => {
    vi.stubEnv("APP_URL", "https://e-btp.test");

    const first = await sandboxProvider.initiate({ orderId: "abc", reference: "CMD-42", amount: 75_000 });
    const second = await sandboxProvider.initiate({ orderId: "abc", reference: "CMD-42", amount: 75_000 });

    expect(first.redirectUrl).toBe("https://e-btp.test/paiement/abc");
    expect(first.providerRef).toMatch(/^SBX-[0-9a-f-]{36}$/);
    expect(second.providerRef).not.toBe(first.providerRef);
  });

  it("rembourse instantanément", async () => {
    await expect(
      sandboxProvider.refund({ providerRef: "SBX-1", amount: 75_000, reference: "CMD-42-1" })
    ).resolves.toEqual({ status: "refunded" });
  });
});
