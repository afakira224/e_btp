import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import { PromotionStatus, PromotionType } from "../../../../src/models/promotion.model.js";
import { BoostKind, BoostStatus } from "../../../../src/models/boost.model.js";
import { NO_END } from "../../../../src/shared/helpers/promotion.rules.js";
import { toShopPromotionDto } from "../../../../src/shared/interfaces/ShopPromotion.interfaces.js";
import { BOOST_KIND_LABELS, BOOST_STATUS_LABELS, toBoostDto } from "../../../../src/shared/interfaces/Boost.interfaces.js";
import { EMPTY_TOTALS } from "../../../../src/shared/services/boost.service.js";
import { CREATED_AT, UPDATED_AT, makeBoost, makeShopPromotion, oid } from "../../../helpers/factories.js";

const NOW = new Date("2026-10-25T10:00:00.000Z");
const DAY = 24 * 3600 * 1000;
const at = (ms: number) => new Date(NOW.getTime() + ms);

// ─────────────────────────────────────────────
describe("toShopPromotionDto", () => {
  it("donne l'état calculé, ses libellés et les actions permises", () => {
    const shopId = oid();
    const offerId = oid();
    const promo = makeShopPromotion({
      boutiqueId: shopId,
      productBoutiqueIds: [offerId],
      status: PromotionStatus.SCHEDULED,
      startDate: at(-DAY),
      endDate: at(5 * DAY),
      description: "Tout le ciment",
    });

    const dto = toShopPromotionDto(promo, NOW, {
      offers: [{ id: String(offerId), name: "Ciment", price: 95_000 }],
      stats: { orders: 1, units: 2, revenue: 150_000, discount: 40_000 },
    });

    expect(dto).toEqual({
      id: String(promo._id),
      boutiqueId: String(shopId),
      type: PromotionType.PRODUCT_DISCOUNT,
      typeLabel: "Remise produit",
      nom: "Remise d'octobre",
      description: "Tout le ciment",
      // Programmée en base, mais sa date est venue : en cours.
      status: PromotionStatus.ACTIVE,
      statusLabel: "En cours",
      discountType: "percentage",
      discountValue: 20,
      startDate: at(-DAY),
      endDate: at(5 * DAY),
      productBoutiqueIds: [String(offerId)],
      offers: [{ id: String(offerId), name: "Ciment", price: 95_000 }],
      code: null,
      minAmount: 0,
      maxDiscount: null,
      usageLimit: null,
      usedCount: 0,
      perCustomerLimit: null,
      stackable: true,
      tiers: [],
      flashQuantity: null,
      flashSold: 0,
      campaignId: null,
      stopReason: null,
      availableActions: ["pause", "extend", "stop"],
      stats: { orders: 1, units: 2, revenue: 150_000, discount: 40_000 },
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    });
  });

  it("n'a pas de fin pour un prix par quantité, et expose ses paliers", () => {
    const dto = toShopPromotionDto(
      makeShopPromotion({ type: PromotionType.QUANTITY_TIERS, endDate: NO_END, startDate: at(-DAY), tiers: [{ minQuantity: 3, discountValue: 10 }] }),
      NOW
    );

    expect(dto.endDate).toBeNull();
    expect(dto.typeLabel).toBe("Prix par quantité");
    expect(dto.tiers).toEqual([{ minQuantity: 3, discountValue: 10 }]);
    expect(dto.availableActions).toEqual(["pause", "stop"]);
  });

  it("expose la cible d'une promotion boutique, la campagne et le motif d'arrêt", () => {
    const familleId = oid();
    const campaignId = new Types.ObjectId();
    const dto = toShopPromotionDto(
      makeShopPromotion({
        type: PromotionType.SHOP_DISCOUNT,
        productBoutiqueIds: [],
        target: { familleIds: [familleId], categoryIds: [], excludedOfferIds: [] },
        campaignId,
        status: PromotionStatus.STOPPED,
        stopReason: "Promotions suspendues par la modération.",
      }),
      NOW
    );

    expect(dto).toMatchObject({
      target: { familleIds: [String(familleId)], categoryIds: [], excludedOfferIds: [] },
      campaignId: String(campaignId),
      status: PromotionStatus.STOPPED,
      statusLabel: "Arrêtée",
      stopReason: "Promotions suspendues par la modération.",
      availableActions: [],
      offers: [],
    });
    expect(dto).not.toHaveProperty("stats");
  });

  it("omet une description vide", () => {
    expect(toShopPromotionDto(makeShopPromotion({ description: "" }), NOW)).not.toHaveProperty("description");
  });
});

// ─────────────────────────────────────────────
describe("toBoostDto", () => {
  it("nomme chaque sorte et chaque état", () => {
    expect(BOOST_KIND_LABELS).toEqual({ promotion: "Boost de promotion", product: "Boost de produit" });
    expect(BOOST_STATUS_LABELS).toEqual({ active: "En cours", paused: "En pause", ended: "Terminé", stopped: "Arrêté" });
  });

  it("donne le budget restant, le taux de visite et le coût par vente", () => {
    const boost = makeBoost({ reserved: 50_000, spent: 12_499.6 });

    const dto = toBoostDto(boost, { impressions: 2_000, reach: 800, visits: 50, carts: 6, orders: 4, revenue: 300_000, spent: 12_499.6 });

    expect(dto).toMatchObject({
      id: String(boost._id),
      kind: BoostKind.PRODUCT,
      kindLabel: "Boost de produit",
      spent: 12_500,
      remaining: 37_500,
      status: BoostStatus.ACTIVE,
      statusLabel: "En cours",
      availableActions: ["pause", "stop"],
      totals: { impressions: 2_000, visits: 50, spent: 12_500, visitRate: 2.5, costPerSale: 3_125 },
      audience: { mode: "auto", communes: [], villes: [], customerTypes: [], interestFamilleIds: [], relation: "all" },
    });
    expect(dto).not.toHaveProperty("promotion");
    expect(dto).not.toHaveProperty("daily");
  });

  it("n'a plus de budget restant ni d'action une fois terminé", () => {
    const dto = toBoostDto(makeBoost({ status: BoostStatus.ENDED, reserved: 50_000, spent: 10_000, refunded: 40_000 }), EMPTY_TOTALS);

    expect(dto).toMatchObject({ remaining: 0, refunded: 40_000, availableActions: [], statusLabel: "Terminé", totals: { visitRate: 0, costPerSale: null } });
  });

  it("propose de reprendre un boost en pause", () => {
    expect(toBoostDto(makeBoost({ status: BoostStatus.PAUSED }), EMPTY_TOTALS).availableActions).toEqual(["resume", "stop"]);
  });

  it("ajoute la promotion boostée et les statistiques du jour, arrondies", () => {
    const promotion = { id: String(oid()), nom: "Remise d'octobre", endDate: at(DAY) };

    const dto = toBoostDto(makeBoost({ kind: BoostKind.PROMOTION }), EMPTY_TOTALS, {
      promotion,
      daily: [{ day: "2026-10-24", ...EMPTY_TOTALS, impressions: 10, spent: 2.5 }],
    });

    expect(dto.promotion).toEqual(promotion);
    expect(dto.daily).toEqual([{ day: "2026-10-24", ...EMPTY_TOTALS, impressions: 10, spent: 3 }]);
  });
});
