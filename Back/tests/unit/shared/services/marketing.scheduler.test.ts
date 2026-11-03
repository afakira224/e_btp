import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../src/models/priceHistory.model.js", async () => {
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { PriceHistory: mockModel() };
});

vi.mock("../../../../src/shared/services/pricing.service.js", () => ({
  recomputeAllPromotedOffers: vi.fn(async () => 0),
  recomputeSalesCounts: vi.fn(async () => 0),
  runPromotionTick: vi.fn(async () => ({ started: 0, ended: 0, offers: 0 })),
}));

vi.mock("../../../../src/shared/services/boost.service.js", () => ({
  grantMonthlyCredits: vi.fn(async () => 0),
  runBoostTick: vi.fn(async () => 0),
}));

import { PriceHistory } from "../../../../src/models/priceHistory.model.js";
import logger from "../../../../src/shared/logger/logger.js";
import { recomputeSalesCounts } from "../../../../src/shared/services/pricing.service.js";
import { grantMonthlyCredits } from "../../../../src/shared/services/boost.service.js";
import { runMarketingDaily } from "../../../../src/shared/services/marketing.scheduler.js";

const PriceHistoryMock = PriceHistory as unknown as Record<string, any>;
const NOW = new Date("2026-11-01T03:00:00.000Z");
const DAY = 24 * 3600 * 1000;

beforeEach(() => {
  vi.mocked(grantMonthlyCredits).mockResolvedValue(0);
});

describe("runMarketingDaily", () => {
  it("recalcule les meilleures ventes, purge l'historique des prix de plus de 90 jours et verse les crédits du mois", async () => {
    vi.mocked(grantMonthlyCredits).mockResolvedValueOnce(12);

    await runMarketingDaily(NOW);

    expect(recomputeSalesCounts).toHaveBeenCalledWith(NOW);
    expect(PriceHistoryMock.deleteMany).toHaveBeenCalledWith({ to: { $lt: new Date(NOW.getTime() - 90 * DAY) } });
    expect(grantMonthlyCredits).toHaveBeenCalledWith(NOW);
    expect(logger.info).toHaveBeenCalledWith("Crédits de boost offerts à 12 boutique(s)");
  });

  it("ne journalise rien quand aucun crédit n'est versé", async () => {
    await runMarketingDaily(NOW);

    expect(logger.info).not.toHaveBeenCalled();
  });
});
