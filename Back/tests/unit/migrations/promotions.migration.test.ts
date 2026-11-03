import { describe, it, expect, vi, beforeEach } from "vitest";

// La migration importe la connexion : elle ne doit jamais s'ouvrir en test.
vi.mock("../../../src/db/db.js", () => ({ DB_CONNECT: vi.fn() }));

vi.mock("../../../src/models/priceHistory.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  const PriceHistory = mockModel();
  PriceHistory.insertMany = vi.fn(async (docs: unknown[]) => docs);
  return { PriceHistory };
});

vi.mock("../../../src/models/product.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/product.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, Product: mockModel(), productBoutique: mockModel() };
});

vi.mock("../../../src/models/promotion.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/promotion.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, Promotion: mockModel() };
});

vi.mock("../../../src/shared/services/pricing.service.js", () => ({
  recomputeAllPromotedOffers: vi.fn(async () => 3),
  recomputeSalesCounts: vi.fn(async () => 0),
}));

import { PriceHistory } from "../../../src/models/priceHistory.model.js";
import { productBoutique } from "../../../src/models/product.model.js";
import { DiscountType, Promotion, PromotionScope, PromotionStatus, PromotionType } from "../../../src/models/promotion.model.js";
import { recomputeAllPromotedOffers, recomputeSalesCounts } from "../../../src/shared/services/pricing.service.js";
import { migrateManualDiscounts } from "../../../src/migrations/promotions.migration.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { makeProductBoutique, oid } from "../../helpers/factories.js";

const PriceHistoryMock = PriceHistory as unknown as Record<string, any>;
const PbMock = productBoutique as unknown as Record<string, any>;
const PromotionMock = Promotion as unknown as Record<string, any>;

const NOW = new Date("2026-10-25T10:00:00.000Z");
const DAY = 24 * 3600 * 1000;

beforeEach(() => {
  PbMock.find.mockReturnValue(mockQuery([]));
  PriceHistoryMock.distinct.mockReturnValue(mockQuery([]));
});

describe("migrateManualDiscounts", () => {
  it("convertit un prix remisé écrit à la main en remise produit de 30 jours, du même pourcentage", async () => {
    const offer = makeProductBoutique({ price: 10_000, discountPrice: 7_500, promo: null });
    PbMock.find.mockReturnValueOnce(mockQuery([offer]));

    const result = await migrateManualDiscounts(NOW);

    expect(PbMock.find.mock.calls[0]![0]).toEqual({ discountPrice: { $ne: null }, promo: null });
    expect(PromotionMock.create).toHaveBeenCalledWith({
      boutiqueId: offer.boutiqueId,
      status: PromotionStatus.ACTIVE,
      nom: "Remise de 25 %",
      type: PromotionType.PRODUCT_DISCOUNT,
      scope: PromotionScope.PRODUCT_BOUTIQUE,
      discountType: DiscountType.PERCENTAGE,
      discountValue: 25,
      startDate: NOW,
      endDate: new Date(NOW.getTime() + 30 * DAY),
      productBoutiqueIds: [offer._id],
      actif: true,
    });
    expect(result).toMatchObject({ promotions: 1, priced: 3 });
    expect(recomputeAllPromotedOffers).toHaveBeenCalledWith(NOW);
    expect(recomputeSalesCounts).toHaveBeenCalledWith(NOW);
  });

  it("plafonne la remise convertie à 70 %, ignore un prix remisé qui ne baisse pas le prix", async () => {
    PbMock.find.mockReturnValueOnce(
      mockQuery([
        makeProductBoutique({ price: 10_000, discountPrice: 1_000 }),
        makeProductBoutique({ price: 10_000, discountPrice: 10_000 }),
        makeProductBoutique({ price: 10_000, discountPrice: 9_990 }),
      ])
    );

    const result = await migrateManualDiscounts(NOW);

    expect(result.promotions).toBe(1);
    expect(PromotionMock.create.mock.calls[0]![0]).toMatchObject({ nom: "Remise de 90 %", discountValue: 70 });
  });

  it("donne aux offres sans historique leur prix actuel comme premier prix connu", async () => {
    const known = makeProductBoutique({ price: 5_000 });
    const fresh = makeProductBoutique({ price: 8_000, createdAt: new Date("2026-03-01T00:00:00.000Z") });
    PbMock.find.mockReturnValueOnce(mockQuery([])).mockReturnValueOnce(mockQuery([known, fresh]));
    PriceHistoryMock.distinct.mockReturnValue(mockQuery([known._id]));

    const result = await migrateManualDiscounts(NOW);

    expect(PriceHistoryMock.insertMany).toHaveBeenCalledWith(
      [{ productBoutiqueId: fresh._id, price: 8_000, from: new Date("2026-03-01T00:00:00.000Z"), to: null }],
      { ordered: false }
    );
    expect(result.histories).toBe(1);
  });

  it("écrit l'historique par lots de 5 000", async () => {
    const offers = Array.from({ length: 5_001 }, () => ({ _id: oid(), price: 1_000, createdAt: NOW }));
    PbMock.find.mockReturnValueOnce(mockQuery([])).mockReturnValueOnce(mockQuery(offers));

    await migrateManualDiscounts(NOW);

    expect(PriceHistoryMock.insertMany).toHaveBeenCalledTimes(2);
    expect(PriceHistoryMock.insertMany.mock.calls[0]![0]).toHaveLength(5_000);
    expect(PriceHistoryMock.insertMany.mock.calls[1]![0]).toHaveLength(1);
  });
});
