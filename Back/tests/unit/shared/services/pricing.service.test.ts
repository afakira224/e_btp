import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

// Seuls les modèles Mongoose sont simulés : enums et constantes restent réels.
vi.mock("../../../../src/models/priceHistory.model.js", async () => {
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { PriceHistory: mockModel() };
});

vi.mock("../../../../src/models/product.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/product.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, Product: mockModel(), productBoutique: mockModel() };
});

vi.mock("../../../../src/models/promotion.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/promotion.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, Promotion: mockModel() };
});

vi.mock("../../../../src/models/shopOrder.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/shopOrder.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, ShopOrder: mockModel() };
});

vi.mock("../../../../src/models/order.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/order.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, Order: mockModel() };
});

import { PriceHistory } from "../../../../src/models/priceHistory.model.js";
import { Product, productBoutique } from "../../../../src/models/product.model.js";
import { DiscountType, Promotion, PromotionScope, PromotionStatus, PromotionType } from "../../../../src/models/promotion.model.js";
import { ShopOrder, ShopOrderStatus } from "../../../../src/models/shopOrder.model.js";
import { Order, OrderStatus } from "../../../../src/models/order.model.js";
import {
  computePricing,
  customerUsedCode,
  evaluateCoupon,
  liveFreeShipping,
  priceLines,
  promotionsFor,
  recomputeAllPromotedOffers,
  recomputeForPromotion,
  recomputeOfferPricing,
  recomputeSalesCounts,
  recordPrice,
  referencePrices,
  runPromotionTick,
  targetsOffer,
  type CouponLine,
} from "../../../../src/shared/services/pricing.service.js";
import { NO_END } from "../../../../src/shared/helpers/promotion.rules.js";
import { mockQuery } from "../../../helpers/model.mock.js";
import { mockSession } from "../../../helpers/express.mock.js";
import { makeProduct, makeProductBoutique, makePromotion, makeShopPromotion, oid } from "../../../helpers/factories.js";

const PriceHistoryMock = PriceHistory as unknown as Record<string, any>;
const ProductMock = Product as unknown as Record<string, any>;
const PbMock = productBoutique as unknown as Record<string, any>;
const PromotionMock = Promotion as unknown as Record<string, any>;
const ShopOrderMock = ShopOrder as unknown as Record<string, any>;
const OrderMock = Order as unknown as Record<string, any>;

const T = PromotionType;
const S = PromotionStatus;
const NOW = new Date("2026-10-25T10:00:00.000Z");
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(NOW.getTime() + ms);
const OPEN = { startDate: at(-DAY), endDate: at(5 * DAY) };

beforeEach(() => {
  PriceHistoryMock.find.mockReturnValue(mockQuery([]));
  PromotionMock.find.mockReturnValue(mockQuery([]));
  PbMock.find.mockReturnValue(mockQuery([]));
  ProductMock.find.mockReturnValue(mockQuery([]));
  ShopOrderMock.aggregate.mockResolvedValue([]);
});

/** Une offre de 10 000 et sa boutique. */
const offerOf = (over: Record<string, unknown> = {}) => makeProductBoutique({ price: 10_000, discountPrice: null, ...over });

/** Remise produit de la boutique de l'offre. */
const discountOn = (offer: { _id: unknown; boutiqueId: unknown }, value: number, over: Record<string, unknown> = {}) =>
  makeShopPromotion({ ...OPEN, boutiqueId: offer.boutiqueId, productBoutiqueIds: [offer._id], discountValue: value, ...over });

// ─────────────────────────────────────────────
describe("recordPrice", () => {
  it("clôt le prix en cours puis ouvre le nouveau, dans la session", async () => {
    const id = oid();
    const session = mockSession() as any;

    await recordPrice(id, 12_000, NOW, session);

    expect(PriceHistoryMock.updateMany).toHaveBeenCalledWith({ productBoutiqueId: id, to: null }, { $set: { to: NOW } }, { session });
    expect(PriceHistoryMock.create).toHaveBeenCalledWith([{ productBoutiqueId: id, price: 12_000, from: NOW, to: null }], { session });
    expect(PriceHistoryMock.updateMany.mock.invocationCallOrder[0]).toBeLessThan(PriceHistoryMock.create.mock.invocationCallOrder[0]);
  });

  it("accepte un identifiant en texte, sans session", async () => {
    const id = oid();

    await recordPrice(String(id), 5_000, NOW);

    expect(PriceHistoryMock.create).toHaveBeenCalledWith([expect.objectContaining({ productBoutiqueId: id, price: 5_000 })], {});
  });
});

describe("referencePrices", () => {
  it("retient le plus bas prix des 30 derniers jours, prix courant compris", async () => {
    const offer = offerOf({ price: 12_000 });
    PriceHistoryMock.find.mockReturnValue(
      mockQuery([
        { productBoutiqueId: offer._id, price: 10_000 },
        { productBoutiqueId: offer._id, price: 15_000 },
      ])
    );

    const references = await referencePrices([offer], NOW);

    expect(references.get(String(offer._id))).toBe(10_000);
    const filter = PriceHistoryMock.find.mock.calls[0]![0];
    expect(filter.$or).toEqual([{ to: null }, { to: { $gte: at(-30 * DAY) } }]);
  });

  it("garde le prix courant quand il est le plus bas, ou sans historique", async () => {
    const cheap = offerOf({ price: 8_000 });
    const fresh = offerOf({ price: 9_000 });
    PriceHistoryMock.find.mockReturnValue(mockQuery([{ productBoutiqueId: cheap._id, price: 11_000 }]));

    const references = await referencePrices([cheap, fresh], NOW);

    expect(references.get(String(cheap._id))).toBe(8_000);
    expect(references.get(String(fresh._id))).toBe(9_000);
  });

  it("ne lit rien sans offre", async () => {
    expect((await referencePrices([], NOW)).size).toBe(0);
    expect(PriceHistoryMock.find).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("promotionsFor", () => {
  it("cherche les promotions de prix et de paliers en vigueur qui visent ces offres ou leur boutique", async () => {
    const offer = offerOf();
    const query = mockQuery([]);
    PromotionMock.find.mockReturnValue(query);
    const session = mockSession() as any;

    await promotionsFor([offer], NOW, session);

    const filter = PromotionMock.find.mock.calls[0]![0];
    expect(filter).toMatchObject({
      type: { $in: [T.PRODUCT_DISCOUNT, T.SHOP_DISCOUNT, T.FLASH_SALE, T.QUANTITY_TIERS] },
      actif: true,
      status: { $nin: [S.DRAFT, S.PAUSED, S.STOPPED] },
      startDate: { $lte: NOW },
      endDate: { $gte: NOW },
    });
    expect(filter.$or[0].productBoutiqueIds.$in).toEqual([offer._id]);
    expect(filter.$or[1].type).toBe(T.SHOP_DISCOUNT);
    expect(filter.$or[1].boutiqueId.$in.map(String)).toEqual([String(offer.boutiqueId)]);
    expect(query.session).toHaveBeenCalledWith(session);
  });

  it("écarte une vente flash épuisée renvoyée par la base", async () => {
    const offer = offerOf();
    const soldOut = discountOn(offer, 30, { type: T.FLASH_SALE, flashQuantity: 5, flashSold: 5 });
    const live = discountOn(offer, 10);
    PromotionMock.find.mockReturnValue(mockQuery([soldOut, live]));

    expect(await promotionsFor([offer], NOW)).toEqual([live]);
  });

  it("ne lit rien sans offre", async () => {
    expect(await promotionsFor([], NOW)).toEqual([]);
    expect(PromotionMock.find).not.toHaveBeenCalled();
  });
});

describe("targetsOffer", () => {
  const product = makeProduct();
  const offer = offerOf({ productId: product._id });

  it("ne laisse jamais une promotion de boutique viser l'offre d'une autre", () => {
    expect(targetsOffer(discountOn(offer, 20, { boutiqueId: oid() }), offer, product)).toBe(false);
    expect(targetsOffer(makeShopPromotion({ type: T.SHOP_DISCOUNT, boutiqueId: oid() }), offer, product)).toBe(false);
  });

  it("vise les offres nommées d'une remise produit", () => {
    expect(targetsOffer(discountOn(offer, 20), offer, product)).toBe(true);
    expect(targetsOffer(discountOn(offerOf({ boutiqueId: offer.boutiqueId }), 20), offer, product)).toBe(false);
  });

  it("laisse une promotion de la plateforme viser l'offre de n'importe quelle boutique", () => {
    expect(targetsOffer(makePromotion({ type: T.FLASH_SALE, productBoutiqueIds: [offer._id] }), offer, product)).toBe(true);
  });

  describe("promotion boutique", () => {
    const shopDiscount = (target?: Record<string, unknown>) =>
      makeShopPromotion({ type: T.SHOP_DISCOUNT, boutiqueId: offer.boutiqueId, productBoutiqueIds: [], target });

    it("vise toute la boutique sans famille ni catégorie", () => {
      expect(targetsOffer(shopDiscount(), offer, product)).toBe(true);
      expect(targetsOffer(shopDiscount({ familleIds: [], categoryIds: [], excludedOfferIds: [] }), offer, undefined)).toBe(true);
    });

    it("vise une famille ou une catégorie", () => {
      expect(targetsOffer(shopDiscount({ familleIds: [product.familleId], categoryIds: [], excludedOfferIds: [] }), offer, product)).toBe(true);
      expect(targetsOffer(shopDiscount({ familleIds: [], categoryIds: [product.categoryId], excludedOfferIds: [] }), offer, product)).toBe(true);
      expect(targetsOffer(shopDiscount({ familleIds: [oid()], categoryIds: [oid()], excludedOfferIds: [] }), offer, product)).toBe(false);
    });

    it("ne vise pas une offre dont le produit est inconnu quand une famille est demandée", () => {
      expect(targetsOffer(shopDiscount({ familleIds: [product.familleId], categoryIds: [], excludedOfferIds: [] }), offer, null)).toBe(false);
    });

    it("écarte les offres exclues", () => {
      expect(targetsOffer(shopDiscount({ familleIds: [], categoryIds: [], excludedOfferIds: [offer._id] }), offer, product)).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────
describe("computePricing", () => {
  const price = (promotions: unknown[], over: Record<string, unknown> = {}) => {
    const offer = (over.offer as any) ?? offerOf();
    return computePricing({ offer, promotions: promotions as any, reference: 10_000, now: NOW, ...over });
  };

  it("sans promotion, ne donne ni prix promotionnel ni paliers", () => {
    expect(price([])).toEqual({ discountPrice: null, promo: null, quantityTiers: [], promotion: null, tiersPromotion: null });
  });

  it("donne le meilleur prix des remises en cours, jamais leur somme", () => {
    const offer = offerOf();
    const ten = discountOn(offer, 10);
    const thirty = discountOn(offer, 30);
    const flash = discountOn(offer, 20, { type: T.FLASH_SALE });

    const pricing = price([ten, thirty, flash], { offer });

    expect(pricing.discountPrice).toBe(7_000);
    expect(pricing.promotion).toBe(thirty);
  });

  it("à prix égal, retient la promotion qui finit la première", () => {
    const offer = offerOf();
    const late = discountOn(offer, 20, { endDate: at(5 * DAY) });
    const soon = discountOn(offer, 20, { endDate: at(2 * DAY) });

    expect(price([late, soon], { offer }).promotion).toBe(soon);
  });

  it("écrit l'instantané de la promotion : prix barré de référence, remise affichée, vente flash, campagne", () => {
    const offer = offerOf();
    const campaignId = oid();
    const flash = discountOn(offer, 25, { type: T.FLASH_SALE, nom: "Flash du soir", campaignId });

    const pricing = price([flash], { offer, reference: 9_000 });

    expect(pricing.promo).toEqual({
      promotionId: flash._id,
      type: T.FLASH_SALE,
      label: "Flash du soir",
      endsAt: flash.endDate,
      referencePrice: 9_000,
      percent: 16, // 7 500 sous 9 000
      flash: true,
      campaignId,
    });
  });

  it("n'affiche aucune remise quand le prix de référence des 30 jours la rend inférieure à 5 %", () => {
    // Le prix est monté de 7 600 à 10 000, puis « remisé » de 20 % : 8 000, au-dessus du plus bas des 30 jours.
    const offer = offerOf();
    const pricing = price([discountOn(offer, 20)], { offer, reference: 7_600 });

    expect(pricing.discountPrice).toBe(8_000);
    expect(pricing.promo!.percent).toBe(0);
    expect(pricing.promo!.referencePrice).toBe(7_600);
  });

  it("ignore les promotions qui ne visent pas l'offre, épuisées, en pause, ou écartées", () => {
    const offer = offerOf();
    const other = discountOn(offerOf(), 50);
    const paused = discountOn(offer, 40, { status: S.PAUSED });
    const soldOut = discountOn(offer, 30, { type: T.FLASH_SALE, flashQuantity: 2, flashSold: 2 });
    const excluded = discountOn(offer, 25);
    const kept = discountOn(offer, 10);

    const pricing = price([other, paused, soldOut, excluded, kept], { offer, excluded: new Set([String(excluded._id)]) });

    expect(pricing.promotion).toBe(kept);
    expect(pricing.discountPrice).toBe(9_000);
  });

  it("applique une promotion boutique selon la famille du produit", () => {
    const product = makeProduct();
    const offer = offerOf({ productId: product._id });
    const shopWide = makeShopPromotion({
      ...OPEN,
      type: T.SHOP_DISCOUNT,
      boutiqueId: offer.boutiqueId,
      productBoutiqueIds: [],
      discountValue: 15,
      target: { familleIds: [product.familleId], categoryIds: [], excludedOfferIds: [] },
    });

    expect(price([shopWide], { offer, product }).discountPrice).toBe(8_500);
    expect(price([shopWide], { offer, product: makeProduct() }).discountPrice).toBeNull();
  });

  it("recopie les paliers du dernier prix par quantité lancé, triés par quantité", () => {
    const offer = offerOf();
    const older = discountOn(offer, 0, { type: T.QUANTITY_TIERS, startDate: at(-3 * DAY), endDate: NO_END, tiers: [{ minQuantity: 2, discountValue: 5 }] });
    const newer = discountOn(offer, 0, {
      type: T.QUANTITY_TIERS,
      startDate: at(-DAY),
      endDate: NO_END,
      tiers: [{ minQuantity: 10, discountValue: 20 }, { minQuantity: 5, discountValue: 10 }],
    });

    const pricing = price([older, newer], { offer });

    expect(pricing.tiersPromotion).toBe(newer);
    expect(pricing.quantityTiers).toEqual([{ minQuantity: 5, percent: 10 }, { minQuantity: 10, percent: 20 }]);
    // Un prix par quantité ne fixe pas le prix unitaire.
    expect(pricing.discountPrice).toBeNull();
  });

  it("ignore une remise qui ne baisse pas le prix", () => {
    const offer = offerOf();
    expect(price([discountOn(offer, 0)], { offer }).discountPrice).toBeNull();
  });
});

// ─────────────────────────────────────────────
describe("recomputeOfferPricing", () => {
  it("n'écrit que les offres dont le prix change", async () => {
    const changed = offerOf();
    const same = offerOf({ boutiqueId: changed.boutiqueId });
    PbMock.find.mockReturnValue(mockQuery([changed, same]));
    const promo = discountOn(changed, 20);
    PromotionMock.find.mockReturnValue(mockQuery([promo]));

    const count = await recomputeOfferPricing({ offerIds: [changed._id, same._id] }, NOW);

    expect(count).toBe(1);
    const [writes] = PbMock.bulkWrite.mock.calls[0]!;
    expect(writes).toHaveLength(1);
    expect(writes[0].updateOne.filter).toEqual({ _id: changed._id });
    expect(writes[0].updateOne.update.$set).toMatchObject({ discountPrice: 8_000, quantityTiers: [] });
    expect(writes[0].updateOne.update.$set.promo).toMatchObject({ promotionId: promo._id, percent: 20, referencePrice: 10_000 });
  });

  it("retire le prix promotionnel d'une offre dont la promotion est finie", async () => {
    const offer = offerOf({ discountPrice: 8_000, promo: { promotionId: oid(), type: T.PRODUCT_DISCOUNT, label: "x", endsAt: NOW, referencePrice: 10_000, percent: 20, flash: false } });
    PbMock.find.mockReturnValue(mockQuery([offer]));

    await recomputeOfferPricing({ offerIds: [offer._id] }, NOW);

    expect(PbMock.bulkWrite.mock.calls[0]![0][0].updateOne.update.$set).toEqual({ discountPrice: null, promo: null, quantityTiers: [] });
  });

  it("n'écrit rien quand rien ne change", async () => {
    PbMock.find.mockReturnValue(mockQuery([offerOf()]));

    expect(await recomputeOfferPricing({ offerIds: [oid()] }, NOW)).toBe(0);
    expect(PbMock.bulkWrite).not.toHaveBeenCalled();
  });

  it("filtre par boutique, et ne fait rien sans filtre", async () => {
    const shopId = oid();
    await recomputeOfferPricing({ boutiqueId: String(shopId) }, NOW);
    expect(PbMock.find).toHaveBeenCalledWith({ boutiqueId: shopId });

    expect(await recomputeOfferPricing({}, NOW)).toBe(0);
    expect(PbMock.find).toHaveBeenCalledTimes(1);
  });
});

describe("recomputeForPromotion", () => {
  it("recalcule toute la boutique pour une promotion boutique, sinon les offres nommées", async () => {
    const shopId = oid();
    const ids = [oid(), oid()];

    await recomputeForPromotion({ type: T.SHOP_DISCOUNT, boutiqueId: shopId, productBoutiqueIds: [] } as any, NOW);
    await recomputeForPromotion({ type: T.PRODUCT_DISCOUNT, boutiqueId: shopId, productBoutiqueIds: ids } as any, NOW);

    expect(PbMock.find.mock.calls[0]![0]).toEqual({ boutiqueId: shopId });
    expect(PbMock.find.mock.calls[1]![0]).toEqual({ _id: { $in: ids } });
  });
});

describe("recomputeAllPromotedOffers", () => {
  it("recalcule les offres qui portent une promotion et celles que vise une promotion en cours", async () => {
    const promoted = offerOf();
    const live = makeShopPromotion({ ...OPEN, productBoutiqueIds: [oid()] });
    PbMock.find.mockReturnValueOnce(mockQuery([promoted]));
    PromotionMock.find.mockReturnValueOnce(mockQuery([live]));

    await recomputeAllPromotedOffers(NOW);

    expect(PbMock.find.mock.calls[0]![0]).toEqual({ $or: [{ promo: { $ne: null } }, { "quantityTiers.0": { $exists: true } }] });
    expect(PbMock.find.mock.calls[1]![0]).toEqual({ _id: { $in: [promoted._id] } });
    expect(PbMock.find.mock.calls[2]![0]).toEqual({ _id: { $in: live.productBoutiqueIds } });
  });
});

// ─────────────────────────────────────────────
describe("priceLines", () => {
  const flashOn = (offer: { _id: unknown; boutiqueId: unknown }, over: Record<string, unknown>) =>
    discountOn(offer, 30, { type: T.FLASH_SALE, nom: "Flash", flashQuantity: 10, flashSold: 0, ...over });

  it("donne le prix de base sans promotion", async () => {
    const offer = offerOf();

    const [line] = await priceLines([{ offer, quantity: 2 }], NOW);

    expect(line).toEqual({ unitPrice: 10_000, basePrice: 10_000, promotionId: null, promotionLabel: undefined, flashPromotionId: undefined, promoted: false });
  });

  it("rattache la ligne à sa remise", async () => {
    const offer = offerOf();
    const promo = discountOn(offer, 20, { nom: "Remise d'octobre" });
    PromotionMock.find.mockReturnValue(mockQuery([promo]));

    const [line] = await priceLines([{ offer, quantity: 1 }], NOW);

    expect(line).toMatchObject({ unitPrice: 8_000, basePrice: 10_000, promotionId: promo._id, promotionLabel: "Remise d'octobre", promoted: true });
    expect(line!.flashPromotionId).toBeUndefined();
  });

  it("lit les promotions et l'historique dans la session du checkout", async () => {
    const session = mockSession() as any;
    const promotionQuery = mockQuery([]);
    const historyQuery = mockQuery([]);
    PromotionMock.find.mockReturnValue(promotionQuery);
    PriceHistoryMock.find.mockReturnValue(historyQuery);

    await priceLines([{ offer: offerOf(), quantity: 1 }], NOW, session);

    expect(promotionQuery.session).toHaveBeenCalledWith(session);
    expect(historyQuery.session).toHaveBeenCalledWith(session);
  });

  it("sert le prix flash tant que la quantité suffit, et le signale", async () => {
    const offer = offerOf();
    const flash = flashOn(offer, { flashSold: 7 });
    PromotionMock.find.mockReturnValue(mockQuery([flash]));

    const [line] = await priceLines([{ offer, quantity: 3 }], NOW);

    expect(line).toMatchObject({ unitPrice: 7_000, flashPromotionId: String(flash._id), promotionId: flash._id });
  });

  it("retombe sur la meilleure autre remise quand la quantité flash ne suffit pas", async () => {
    const offer = offerOf();
    const flash = flashOn(offer, { flashSold: 8 });
    const discount = discountOn(offer, 10);
    PromotionMock.find.mockReturnValue(mockQuery([flash, discount]));

    const [line] = await priceLines([{ offer, quantity: 3 }], NOW);

    expect(line).toMatchObject({ unitPrice: 9_000, promotionId: discount._id });
    expect(line!.flashPromotionId).toBeUndefined();
  });

  it("retombe sur le prix de base sans autre remise", async () => {
    const offer = offerOf();
    PromotionMock.find.mockReturnValue(mockQuery([flashOn(offer, { flashSold: 9 })]));

    const [line] = await priceLines([{ offer, quantity: 2 }], NOW);

    expect(line).toMatchObject({ unitPrice: 10_000, promotionId: null, promoted: false });
  });

  it("décompte la quantité flash d'une ligne à l'autre", async () => {
    const a = offerOf();
    const b = offerOf({ boutiqueId: a.boutiqueId });
    const flash = discountOn(a, 30, { type: T.FLASH_SALE, productBoutiqueIds: [a._id, b._id], flashQuantity: 5, flashSold: 0 });
    PromotionMock.find.mockReturnValue(mockQuery([flash]));

    const lines = await priceLines(
      [
        { offer: a, quantity: 3 },
        { offer: b, quantity: 3 },
      ],
      NOW
    );

    expect(lines.map((line) => line.unitPrice)).toEqual([7_000, 10_000]);
    expect(lines[0]!.flashPromotionId).toBe(String(flash._id));
    expect(lines[1]!.flashPromotionId).toBeUndefined();
  });

  it("garde le prix flash d'une vente sans quantité limitée", async () => {
    const offer = offerOf();
    PromotionMock.find.mockReturnValue(mockQuery([flashOn(offer, { flashQuantity: null })]));

    const [line] = await priceLines([{ offer, quantity: 50 }], NOW);

    expect(line!.unitPrice).toBe(7_000);
  });

  it("attribue la ligne au palier quand il bat la remise", async () => {
    const offer = offerOf();
    const discount = discountOn(offer, 10);
    const tiers = discountOn(offer, 0, { type: T.QUANTITY_TIERS, nom: "Par 5", endDate: NO_END, tiers: [{ minQuantity: 5, discountValue: 20 }] });
    PromotionMock.find.mockReturnValue(mockQuery([discount, tiers]));

    const [few] = await priceLines([{ offer, quantity: 2 }], NOW);
    const [many] = await priceLines([{ offer, quantity: 5 }], NOW);

    expect(few).toMatchObject({ unitPrice: 9_000, promotionId: discount._id });
    expect(many).toMatchObject({ unitPrice: 8_000, promotionId: tiers._id, promotionLabel: "Par 5", promoted: true });
  });

  it("ne compte pas une vente flash battue par le palier", async () => {
    const offer = offerOf();
    const flash = flashOn(offer, { discountValue: 10 });
    const tiers = discountOn(offer, 0, { type: T.QUANTITY_TIERS, endDate: NO_END, tiers: [{ minQuantity: 2, discountValue: 25 }] });
    PromotionMock.find.mockReturnValue(mockQuery([flash, tiers]));

    const [line] = await priceLines([{ offer, quantity: 2 }], NOW);

    expect(line).toMatchObject({ unitPrice: 7_500, promotionId: tiers._id });
    expect(line!.flashPromotionId).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
describe("recomputeSalesCounts", () => {
  it("compte les unités livrées sur 30 jours et remet à zéro les autres offres", async () => {
    const a = oid();
    const b = oid();
    ShopOrderMock.aggregate.mockResolvedValueOnce([
      { _id: a, units: 12 },
      { _id: b, units: 3 },
    ]);

    expect(await recomputeSalesCounts(NOW)).toBe(2);

    const [pipeline] = ShopOrderMock.aggregate.mock.calls[0]!;
    expect(pipeline[0].$match).toEqual({
      status: { $in: [ShopOrderStatus.DELIVERED, ShopOrderStatus.COMPLETED] },
      statusHistory: { $elemMatch: { status: ShopOrderStatus.DELIVERED, changedAt: { $gte: at(-30 * DAY) } } },
    });
    const [writes] = PbMock.bulkWrite.mock.calls[0]!;
    expect(writes).toEqual([
      { updateOne: { filter: { _id: a }, update: { $set: { salesCount30d: 12 } } } },
      { updateOne: { filter: { _id: b }, update: { $set: { salesCount30d: 3 } } } },
      { updateMany: { filter: { salesCount30d: { $gt: 0 }, _id: { $nin: [a, b] } }, update: { $set: { salesCount30d: 0 } } } },
    ]);
  });
});

// ─────────────────────────────────────────────
describe("runPromotionTick", () => {
  const since = at(-60 * 1000);

  it("démarre une promotion programmée dont la date est venue et recalcule ses offres", async () => {
    const scheduled = makeShopPromotion({ status: S.SCHEDULED, startDate: at(-30 * 1000), endDate: at(DAY) });
    PromotionMock.find.mockReturnValueOnce(mockQuery([scheduled]));

    const summary = await runPromotionTick(since, NOW);

    expect(PromotionMock.find.mock.calls[0]![0]).toEqual({ status: S.SCHEDULED, startDate: { $lte: NOW } });
    expect(scheduled.status).toBe(S.ACTIVE);
    expect(scheduled.save).toHaveBeenCalled();
    expect(summary).toMatchObject({ started: 1, ended: 0 });
    expect(PbMock.find).toHaveBeenCalledWith({ _id: { $in: scheduled.productBoutiqueIds } });
  });

  it("termine d'office une promotion programmée dont la fin est déjà passée", async () => {
    const late = makeShopPromotion({ status: S.SCHEDULED, startDate: at(-2 * DAY), endDate: at(-DAY) });
    PromotionMock.find.mockReturnValueOnce(mockQuery([late]));

    await runPromotionTick(since, NOW);

    expect(late.status).toBe(S.ENDED);
  });

  it("termine une promotion échue ou dont la quantité flash est vendue", async () => {
    const over = makeShopPromotion({ status: S.ACTIVE, endDate: at(-1) });
    PromotionMock.find.mockReturnValueOnce(mockQuery([])).mockReturnValueOnce(mockQuery([over]));

    const summary = await runPromotionTick(since, NOW);

    const filter = PromotionMock.find.mock.calls[1]![0];
    expect(filter.status).toEqual({ $in: [S.ACTIVE, S.PAUSED] });
    expect(filter.$or[0]).toEqual({ endDate: { $lt: NOW } });
    expect(filter.$or[1].$expr).toBeDefined();
    expect(over.status).toBe(S.ENDED);
    expect(summary.ended).toBe(1);
  });

  it("recalcule les offres des promotions dont une date a été franchie, même sans état propre", async () => {
    const platform = makePromotion({ type: T.FLASH_SALE, productBoutiqueIds: [oid()], startDate: at(-30 * 1000), endDate: at(DAY) });
    PromotionMock.find
      .mockReturnValueOnce(mockQuery([]))
      .mockReturnValueOnce(mockQuery([]))
      .mockReturnValueOnce(mockQuery([platform]));

    await runPromotionTick(since, NOW);

    const crossed = PromotionMock.find.mock.calls[2]![0];
    expect(crossed.$or).toEqual([
      { startDate: { $gt: since, $lte: NOW } },
      { endDate: { $gte: since, $lt: NOW } },
      { type: T.FLASH_SALE, updatedAt: { $gt: since, $lte: NOW } },
    ]);
    expect(PbMock.find).toHaveBeenCalledWith({ _id: { $in: platform.productBoutiqueIds } });
  });

  it("ne recalcule qu'une fois une promotion trouvée par plusieurs requêtes", async () => {
    const promo = makeShopPromotion({ status: S.SCHEDULED, startDate: at(-30 * 1000), endDate: at(DAY) });
    PromotionMock.find
      .mockReturnValueOnce(mockQuery([promo]))
      .mockReturnValueOnce(mockQuery([]))
      .mockReturnValueOnce(mockQuery([promo]));

    await runPromotionTick(since, NOW);

    expect(PbMock.find).toHaveBeenCalledTimes(1);
  });

  it("ne recalcule aucune offre pour un code qui démarre", async () => {
    const code = makeShopPromotion({ type: T.COUPON, status: S.SCHEDULED, productBoutiqueIds: [], startDate: at(-30 * 1000), endDate: at(DAY) });
    PromotionMock.find.mockReturnValueOnce(mockQuery([code]));

    const summary = await runPromotionTick(since, NOW);

    expect(code.status).toBe(S.ACTIVE);
    expect(summary.offers).toBe(0);
    expect(PbMock.find).not.toHaveBeenCalled();
  });

  // Régression corrigée (pricing.service.ts, runPromotionTick) : seules les promotions
  // « active » sont terminées. Une promotion mise en pause puis échue reste
  // « paused » pour toujours : elle reste dans l'onglet « En cours » et compte
  // dans le plafond des 20 promotions (promotionContext). Ce test garde le
  // correctif.
  it("termine aussi une promotion en pause dont la fin est passée", async () => {
    await runPromotionTick(since, NOW);

    const filter = PromotionMock.find.mock.calls[1]![0];
    expect(filter.status).toEqual({ $in: [S.ACTIVE, S.PAUSED] });
  });
});

// ─────────────────────────────────────────────
describe("liveFreeShipping", () => {
  const freeFrom = (boutiqueId: unknown, minAmount: number, over: Record<string, unknown> = {}) =>
    makeShopPromotion({ ...OPEN, type: T.FREE_SHIPPING, scope: PromotionScope.CART, nom: `Dès ${minAmount}`, minAmount, boutiqueId, productBoutiqueIds: [], ...over });

  it("retient, par boutique, le seuil le plus bas des livraisons offertes en cours", async () => {
    const a = oid();
    const b = oid();
    const low = freeFrom(a, 50_000);
    PromotionMock.find.mockReturnValue(mockQuery([freeFrom(a, 100_000), low, freeFrom(b, 80_000)]));

    const rules = await liveFreeShipping([a, b], NOW);

    expect(rules.get(String(a))).toEqual({ minAmount: 50_000, promotionId: String(low._id), label: "Dès 50000" });
    expect(rules.get(String(b))!.minAmount).toBe(80_000);
    const filter = PromotionMock.find.mock.calls[0]![0];
    expect(filter).toMatchObject({ type: T.FREE_SHIPPING, actif: true, status: { $nin: [S.DRAFT, S.PAUSED, S.STOPPED] } });
  });

  it("écarte une livraison offerte qui n'est plus en cours", async () => {
    const a = oid();
    PromotionMock.find.mockReturnValue(mockQuery([freeFrom(a, 10_000, { endDate: at(-1) })]));

    expect((await liveFreeShipping([a], NOW)).size).toBe(0);
  });

  it("ne lit rien sans boutique", async () => {
    expect((await liveFreeShipping([], NOW)).size).toBe(0);
    expect(PromotionMock.find).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("evaluateCoupon", () => {
  const shopA = oid();
  const shopB = oid();
  const line = (over: Partial<CouponLine> = {}): CouponLine => ({
    productBoutiqueId: oid(),
    boutiqueId: shopA,
    price: 10_000,
    quantity: 1,
    promoted: false,
    ...over,
  });
  const coupon = (over: Record<string, unknown> = {}) =>
    makePromotion({ ...OPEN, code: "KALOUM10", discountValue: 10, ...over });

  it("refuse un code expiré, épuisé, en pause, ou qui n'est pas un code", () => {
    const message = "Ce coupon n'est pas valide (inactif, expiré ou épuisé).";
    expect(evaluateCoupon(coupon({ endDate: at(-1) }), [line()], NOW).error).toBe(message);
    expect(evaluateCoupon(coupon({ usageLimit: 1, usedCount: 1 }), [line()], NOW).error).toBe(message);
    expect(evaluateCoupon(coupon({ status: S.PAUSED }), [line()], NOW).error).toBe(message);
    expect(evaluateCoupon(coupon({ type: T.FLASH_SALE }), [line()], NOW).error).toBe(message);
  });

  describe("code de la plateforme", () => {
    it("porte sur tout le panier, réparti au prorata (boutiqueId null)", () => {
      expect(evaluateCoupon(coupon(), [line(), line({ boutiqueId: shopB, price: 30_000 })], NOW)).toEqual({ discount: 4_000, boutiqueId: null });
    });

    it("ne porte que sur ses offres quand il en vise", () => {
      const target = line({ price: 20_000 });
      const result = evaluateCoupon(coupon({ scope: PromotionScope.PRODUCT_BOUTIQUE, productBoutiqueIds: [target.productBoutiqueId] }), [target, line()], NOW);
      expect(result.discount).toBe(2_000);
    });

    it("lit le montant minimum sur tout le panier", () => {
      expect(evaluateCoupon(coupon({ minAmount: 20_000 }), [line(), line({ boutiqueId: shopB })], NOW).discount).toBe(2_000);
      expect(evaluateCoupon(coupon({ minAmount: 20_001 }), [line(), line({ boutiqueId: shopB })], NOW).error).toBe(
        "Montant minimum non atteint pour ce coupon (requis : 20001)."
      );
    });

    it("s'ajoute aux prix déjà promotionnels", () => {
      expect(evaluateCoupon(coupon(), [line({ promoted: true })], NOW).discount).toBe(1_000);
    });
  });

  describe("code de boutique", () => {
    it("ne porte que sur la part de sa boutique", () => {
      const result = evaluateCoupon(coupon({ boutiqueId: shopA }), [line({ price: 20_000 }), line({ boutiqueId: shopB, price: 50_000 })], NOW);
      expect(result).toEqual({ discount: 2_000, boutiqueId: String(shopA) });
    });

    it("refuse un panier sans article de sa boutique", () => {
      expect(evaluateCoupon(coupon({ boutiqueId: shopA }), [line({ boutiqueId: shopB })], NOW)).toEqual({
        discount: 0,
        boutiqueId: String(shopA),
        error: "Ce code ne vaut que chez la boutique qui l'a créé : ajoutez un de ses articles.",
      });
    });

    it("non cumulable, ignore ses articles déjà en promotion", () => {
      const lines = [line({ price: 20_000, promoted: true }), line({ price: 10_000 })];
      expect(evaluateCoupon(coupon({ boutiqueId: shopA, stackable: false }), lines, NOW).discount).toBe(1_000);
      expect(evaluateCoupon(coupon({ boutiqueId: shopA, stackable: true }), lines, NOW).discount).toBe(3_000);
    });

    it("non cumulable, refuse quand tous ses articles sont en promotion", () => {
      expect(evaluateCoupon(coupon({ boutiqueId: shopA, stackable: false }), [line({ promoted: true })], NOW).error).toBe(
        "Aucun article de la commande n'est éligible à ce coupon."
      );
    });

    it("lit le montant minimum sur sa seule part", () => {
      const lines = [line({ price: 10_000 }), line({ boutiqueId: shopB, price: 90_000 })];
      expect(evaluateCoupon(coupon({ boutiqueId: shopA, minAmount: 15_000 }), lines, NOW).error).toBe(
        "Montant minimum non atteint pour ce coupon (requis : 15000)."
      );
    });
  });

  it("plafonne la remise, la borne à la base et l'arrondit", () => {
    expect(evaluateCoupon(coupon({ discountValue: 50, maxDiscount: 3_000 }), [line()], NOW).discount).toBe(3_000);
    expect(evaluateCoupon(coupon({ discountType: DiscountType.FIXED, discountValue: 25_000 }), [line()], NOW).discount).toBe(10_000);
    expect(evaluateCoupon(coupon({ discountValue: 15 }), [line({ price: 999 })], NOW).discount).toBe(150);
  });

  it("calcule la base sur les quantités", () => {
    expect(evaluateCoupon(coupon(), [line({ price: 1_000, quantity: 7 })], NOW).discount).toBe(700);
  });
});

describe("customerUsedCode", () => {
  it("compte les commandes du client avec ce code, hors annulées et paiements échoués", async () => {
    const userId = oid();
    const session = mockSession() as any;
    const query = mockQuery(2);
    OrderMock.countDocuments.mockReturnValue(query);

    expect(await customerUsedCode(String(userId), "KALOUM10", session)).toBe(2);

    expect(OrderMock.countDocuments).toHaveBeenCalledWith({
      userId: new Types.ObjectId(String(userId)),
      promotionCode: "KALOUM10",
      status: { $nin: [OrderStatus.CANCELLED, OrderStatus.PAYMENT_FAILED] },
    });
    expect(query.session).toHaveBeenCalledWith(session);
  });
});
