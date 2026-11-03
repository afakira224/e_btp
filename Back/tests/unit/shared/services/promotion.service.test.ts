import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

// Seuls les modèles Mongoose sont simulés : enums et constantes restent réels.
vi.mock("../../../../src/models/boutique.model.js", async () => {
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { Shop: mockModel() };
});

vi.mock("../../../../src/models/campaign.model.js", async () => {
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { Campaign: mockModel() };
});

vi.mock("../../../../src/models/order.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/order.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, Order: mockModel() };
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

// Le moteur de prix a ses propres tests : on vérifie qu'il est appelé.
vi.mock("../../../../src/shared/services/pricing.service.js", () => ({
  recomputeForPromotion: vi.fn(async () => 0),
}));

import { Shop } from "../../../../src/models/boutique.model.js";
import { Campaign } from "../../../../src/models/campaign.model.js";
import { Order, OrderStatus } from "../../../../src/models/order.model.js";
import { Product, productBoutique } from "../../../../src/models/product.model.js";
import { DiscountType, Promotion, PromotionScope, PromotionStatus, PromotionType } from "../../../../src/models/promotion.model.js";
import { ShopOrder, ShopOrderStatus } from "../../../../src/models/shopOrder.model.js";
import { recomputeForPromotion } from "../../../../src/shared/services/pricing.service.js";
import { NO_END, PromotionAction } from "../../../../src/shared/helpers/promotion.rules.js";
import {
  applyPromotionAction,
  campaignOfferIds,
  campaignState,
  checkCampaignInput,
  createShopPromotion,
  joinCampaign,
  listShopPromotions,
  managedPromotion,
  managedShop,
  promotionContext,
  promotionStats,
  setFeaturedRank,
  syncCampaignPromotions,
  updateShopPromotion,
  type ShopPromotionBody,
} from "../../../../src/shared/services/promotion.service.js";
import { mockQuery } from "../../../helpers/model.mock.js";
import {
  makeCampaign,
  makeProduct,
  makeProductBoutique,
  makePromotion,
  makeShop,
  makeShopPromotion,
  oid,
} from "../../../helpers/factories.js";

const ShopMock = Shop as unknown as Record<string, any>;
const CampaignMock = Campaign as unknown as Record<string, any>;
const OrderMock = Order as unknown as Record<string, any>;
const ProductMock = Product as unknown as Record<string, any>;
const PbMock = productBoutique as unknown as Record<string, any>;
const PromotionMock = Promotion as unknown as Record<string, any>;
const ShopOrderMock = ShopOrder as unknown as Record<string, any>;

const T = PromotionType;
const S = PromotionStatus;
const NOW = new Date("2026-10-25T10:00:00.000Z");
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(NOW.getTime() + ms);

let owner: Types.ObjectId;
let shop: ReturnType<typeof makeShop>;
let offer: ReturnType<typeof makeProductBoutique>;
let SELLER: { id: string; entityType: any };
const ADMIN = { id: oid().toString(), entityType: "admin" as any };
const OTHER_SELLER = { id: oid().toString(), entityType: "shop" as any };

beforeEach(() => {
  owner = oid();
  SELLER = { id: owner.toString(), entityType: "shop" };
  // Boutique ouverte depuis janvier, avec 12 commandes livrées : la vente flash lui est ouverte.
  shop = makeShop({ ownerId: owner, nom: "Boutique Kaloum", suspendedUntil: null, promotionsBlockedUntil: null });
  offer = makeProductBoutique({ boutiqueId: shop._id, hiddenAt: null });

  ShopMock.findById.mockReturnValue(mockQuery(shop));
  PbMock.find.mockReturnValue(mockQuery([offer]));
  PbMock.findById.mockReturnValue(mockQuery(null));
  ProductMock.find.mockReturnValue(mockQuery([]));
  PromotionMock.countDocuments.mockReturnValue(mockQuery(0));
  PromotionMock.findOne.mockReturnValue(mockQuery(null));
  PromotionMock.findById.mockReturnValue(mockQuery(null));
  PromotionMock.find.mockReturnValue(mockQuery([]));
  PromotionMock.create.mockImplementation(async (doc: any) => makePromotion(doc));
  ShopOrderMock.countDocuments.mockReturnValue(mockQuery(12));
  OrderMock.aggregate.mockResolvedValue([]);
  CampaignMock.findById.mockReturnValue(mockQuery(null));
  vi.mocked(recomputeForPromotion).mockResolvedValue(0);
});

/** Remise produit de 20 % sur l'offre de la boutique, lancée tout de suite pour 7 jours. */
const body = (over: Partial<ShopPromotionBody> = {}): ShopPromotionBody => ({
  type: T.PRODUCT_DISCOUNT,
  nom: "  Remise d'octobre  ",
  discountValue: 20,
  endDate: at(7 * DAY).toISOString(),
  productBoutiqueIds: [String(offer._id)],
  launch: "now",
  ...over,
});

const create = (over: Partial<ShopPromotionBody> = {}, user: any = SELLER) => createShopPromotion(user, String(shop._id), body(over), NOW);

/** Document passé à Promotion.create. */
const created = () => PromotionMock.create.mock.calls.at(-1)![0];

// ─────────────────────────────────────────────
describe("managedShop", () => {
  it("renvoie 404 pour un identifiant invalide ou une boutique introuvable", async () => {
    await expect(managedShop(SELLER, "pas-un-id")).rejects.toMatchObject({ statusCode: 404, message: "Boutique introuvable." });
    ShopMock.findById.mockReturnValueOnce(mockQuery(null));
    await expect(managedShop(SELLER, String(oid()))).rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuse en 403 la boutique d'un autre vendeur, et sans identité", async () => {
    await expect(managedShop(OTHER_SELLER, String(shop._id))).rejects.toMatchObject({
      statusCode: 403,
      message: "Vous ne pouvez gérer que vos propres boutiques.",
    });
    await expect(managedShop(undefined, String(shop._id))).rejects.toMatchObject({ statusCode: 403 });
  });

  it("laisse passer son gérant et l'administration", async () => {
    expect(await managedShop(SELLER, String(shop._id))).toBe(shop);
    expect(await managedShop(ADMIN, String(shop._id))).toBe(shop);
  });
});

describe("promotionContext", () => {
  it("compte ce que la boutique a en cours, ses ventes flash du mois et ses commandes livrées", async () => {
    PromotionMock.countDocuments
      .mockReturnValueOnce(mockQuery(7))
      .mockReturnValueOnce(mockQuery(2))
      .mockReturnValueOnce(mockQuery(1));
    ShopOrderMock.countDocuments.mockReturnValueOnce(mockQuery(4));
    shop.createdAt = at(-45 * DAY);

    const context = await promotionContext(shop, NOW);

    expect(context).toEqual({ running: 7, activeCodes: 2, flashThisMonth: 1, shopAgeDays: 45, deliveredOrders: 4 });
    const [running, codes, flash] = PromotionMock.countDocuments.mock.calls.map((call: any[]) => call[0]);
    expect(running).toEqual({ boutiqueId: shop._id, status: { $in: [S.SCHEDULED, S.ACTIVE, S.PAUSED] }, type: { $ne: T.QUANTITY_TIERS } });
    expect(codes).toEqual({ boutiqueId: shop._id, status: { $in: [S.SCHEDULED, S.ACTIVE, S.PAUSED] }, type: T.COUPON });
    expect(flash).toEqual({ boutiqueId: shop._id, type: T.FLASH_SALE, status: { $ne: S.DRAFT }, startDate: { $gte: new Date("2026-10-01T00:00:00.000Z") } });
    expect(ShopOrderMock.countDocuments).toHaveBeenCalledWith({
      boutiqueId: shop._id,
      status: { $in: [ShopOrderStatus.DELIVERED, ShopOrderStatus.COMPLETED] },
    });
  });

  it("ne compte pas la promotion en cours de modification", async () => {
    const exceptId = oid();

    await promotionContext(shop, NOW, exceptId);

    for (const [filter] of PromotionMock.countDocuments.mock.calls) expect(filter._id).toEqual({ $ne: exceptId });
  });
});

// ─────────────────────────────────────────────
describe("createShopPromotion", () => {
  it("lance une remise produit tout de suite et recalcule le prix de ses offres", async () => {
    const promo = await create();

    expect(created()).toMatchObject({
      type: T.PRODUCT_DISCOUNT,
      nom: "Remise d'octobre",
      description: "",
      scope: PromotionScope.PRODUCT_BOUTIQUE,
      discountType: DiscountType.PERCENTAGE,
      discountValue: 20,
      code: null,
      startDate: NOW,
      endDate: at(7 * DAY),
      productBoutiqueIds: [offer._id],
      boutiqueId: shop._id,
      status: S.ACTIVE,
      actif: true,
      usedCount: 0,
      flashSold: 0,
      perCustomerLimit: null,
      stackable: true,
      createdBy: owner,
    });
    expect(recomputeForPromotion).toHaveBeenCalledWith(promo, NOW);
  });

  it("programme une promotion qui commence plus tard", async () => {
    await create({ launch: "schedule", startDate: at(2 * DAY).toISOString(), endDate: at(5 * DAY).toISOString() });

    expect(created()).toMatchObject({ status: S.SCHEDULED, startDate: at(2 * DAY) });
  });

  it("enregistre un brouillon sans toucher aux prix", async () => {
    await create({ launch: "draft", startDate: at(DAY).toISOString() });

    expect(created().status).toBe(S.DRAFT);
    expect(recomputeForPromotion).not.toHaveBeenCalled();
  });

  it("laisse une boutique suspendue préparer un brouillon, mais rien lancer", async () => {
    shop.suspendedUntil = at(DAY);

    await expect(create()).rejects.toMatchObject({
      statusCode: 400,
      message: "Votre boutique est suspendue : préparez la promotion en brouillon, elle se lancera après.",
    });
    await expect(create({ launch: "draft", startDate: at(DAY).toISOString() })).resolves.toBeDefined();
  });

  it("refuse en 403 une boutique dont les promotions sont suspendues, même en brouillon", async () => {
    shop.promotionsBlockedUntil = at(10 * DAY);

    await expect(create({ launch: "draft", startDate: at(DAY).toISOString() })).rejects.toMatchObject({
      statusCode: 403,
      message: `Les promotions de cette boutique sont suspendues jusqu'au ${at(10 * DAY).toLocaleDateString("fr-FR")}.`,
    });
    expect(PromotionMock.create).not.toHaveBeenCalled();
  });

  it("accepte de nouveau une fois la suspension des promotions passée", async () => {
    shop.promotionsBlockedUntil = at(-1);

    await expect(create()).resolves.toBeDefined();
  });

  it("refuse en 400 avec le motif des règles", async () => {
    await expect(create({ discountValue: 80 })).rejects.toMatchObject({ statusCode: 400, message: "La remise va de 5 à 70 %." });
    await expect(create({ discountValue: 60 })).rejects.toMatchObject({
      message: "Une remise de plus de 50 % se confirme : vérifiez-la, puis confirmez.",
    });
    await expect(create({ discountValue: 60, confirmHighDiscount: true })).resolves.toBeDefined();
    expect(created().highDiscountConfirmed).toBe(true);
  });

  it("refuse la boutique d'un autre vendeur", async () => {
    await expect(create({}, OTHER_SELLER)).rejects.toMatchObject({ statusCode: 403 });
  });

  describe("offres visées", () => {
    it("refuse en 403 l'offre d'une autre boutique", async () => {
      PbMock.find.mockReturnValue(mockQuery([makeProductBoutique({ boutiqueId: oid() })]));

      await expect(create()).rejects.toMatchObject({ statusCode: 403, message: "Une promotion ne porte que sur les offres de sa boutique." });
    });

    it("renvoie 404 pour une offre introuvable", async () => {
      PbMock.find.mockReturnValue(mockQuery([]));

      await expect(create()).rejects.toMatchObject({ statusCode: 404, message: "Une offre est introuvable." });
    });

    it("refuse une offre masquée par la modération", async () => {
      offer.hiddenAt = at(-DAY);

      await expect(create()).rejects.toMatchObject({ statusCode: 400, message: "Une offre masquée par la modération ne peut pas être en promotion." });
    });

    it("contrôle aussi les offres exclues d'une promotion boutique", async () => {
      PbMock.find.mockReturnValue(mockQuery([makeProductBoutique({ boutiqueId: oid() })]));

      await expect(create({ type: T.SHOP_DISCOUNT, productBoutiqueIds: [], excludedOfferIds: [String(oid())] })).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("plafonds", () => {
    it("refuse une 21e promotion en cours", async () => {
      PromotionMock.countDocuments.mockReturnValueOnce(mockQuery(20));

      await expect(create()).rejects.toMatchObject({ statusCode: 400, message: "20 promotions en cours ou programmées au plus." });
    });

    it("refuse un 6e code actif", async () => {
      PromotionMock.countDocuments.mockReturnValueOnce(mockQuery(5)).mockReturnValueOnce(mockQuery(5));

      await expect(create({ type: T.COUPON, code: "KALOUM10", productBoutiqueIds: [] })).rejects.toMatchObject({
        message: "5 codes actifs au plus par boutique.",
      });
    });
  });

  describe("vente flash", () => {
    const flash = (over: Partial<ShopPromotionBody> = {}) =>
      create({ type: T.FLASH_SALE, discountValue: 30, flashQuantity: 10, endDate: at(6 * HOUR).toISOString(), ...over });

    it("enregistre la quantité vendue au prix flash", async () => {
      await flash();

      expect(created()).toMatchObject({ type: T.FLASH_SALE, flashQuantity: 10, flashSold: 0, scope: PromotionScope.PRODUCT_BOUTIQUE });
    });

    it("exige 30 jours d'ancienneté et 5 commandes livrées", async () => {
      ShopOrderMock.countDocuments.mockReturnValueOnce(mockQuery(4));

      await expect(flash()).rejects.toMatchObject({ message: "La vente flash s'ouvre après 30 jours et 5 commandes livrées." });

      shop.createdAt = at(-10 * DAY);
      await expect(flash()).rejects.toMatchObject({ message: "La vente flash s'ouvre après 30 jours et 5 commandes livrées." });
    });

    it("refuse une offre passée en vente flash il y a moins de 30 jours", async () => {
      PromotionMock.findOne.mockReturnValueOnce(mockQuery(makeShopPromotion({ type: T.FLASH_SALE })));

      await expect(flash()).rejects.toMatchObject({
        statusCode: 400,
        message: "Une offre ne repasse pas en vente flash moins de 30 jours après la précédente.",
      });
      const filter = PromotionMock.findOne.mock.calls[0]![0];
      expect(filter).toMatchObject({ type: T.FLASH_SALE, status: { $ne: S.DRAFT }, endDate: { $gte: at(-30 * DAY) } });
      expect(filter.productBoutiqueIds.$in).toEqual([offer._id]);
    });
  });

  describe("code promo", () => {
    const code = (over: Partial<ShopPromotionBody> = {}) =>
      create({ type: T.COUPON, code: "kaloum10", discountValue: 10, productBoutiqueIds: [], ...over });

    it("enregistre le code en majuscules, sur le panier, une fois par client par défaut", async () => {
      await code();

      expect(created()).toMatchObject({
        code: "KALOUM10",
        scope: PromotionScope.CART,
        productBoutiqueIds: [],
        perCustomerLimit: 1,
        stackable: true,
      });
      expect(PromotionMock.findOne).toHaveBeenCalledWith({ code: "KALOUM10" });
    });

    it("garde un montant fixe, une limite par client et le choix « non cumulable »", async () => {
      await code({ discountType: DiscountType.FIXED, discountValue: 5_000, perCustomerLimit: 3, stackable: false, minAmount: 50_000, usageLimit: 100 });

      expect(created()).toMatchObject({ discountType: DiscountType.FIXED, discountValue: 5_000, perCustomerLimit: 3, stackable: false, minAmount: 50_000, usageLimit: 100 });
    });

    it("refuse en 409 un code déjà pris", async () => {
      PromotionMock.findOne.mockReturnValueOnce(mockQuery(makePromotion({ code: "KALOUM10" })));

      await expect(code()).rejects.toMatchObject({ statusCode: 409, message: "Ce code est déjà pris : choisissez-en un autre." });
      expect(PromotionMock.create).not.toHaveBeenCalled();
    });
  });

  it("donne un prix par quantité sans fin, paliers triés, sans remise propre", async () => {
    await create({
      type: T.QUANTITY_TIERS,
      endDate: undefined,
      discountValue: undefined,
      tiers: [{ minQuantity: 10, discountValue: 15 }, { minQuantity: 3, discountValue: 5 }],
    });

    expect(created()).toMatchObject({
      endDate: NO_END,
      discountValue: 0,
      tiers: [{ minQuantity: 3, discountValue: 5 }, { minQuantity: 10, discountValue: 15 }],
    });
  });

  it("enregistre la cible d'une promotion boutique, sans offre nommée", async () => {
    const familleId = oid();
    const excluded = makeProductBoutique({ boutiqueId: shop._id });
    PbMock.find.mockReturnValue(mockQuery([offer, excluded]));

    await create({ type: T.SHOP_DISCOUNT, productBoutiqueIds: [String(offer._id)], familleIds: [String(familleId)], excludedOfferIds: [String(excluded._id)] });

    // Les offres nommées sont ignorées : la cible fait foi.
    expect(created().productBoutiqueIds).toEqual([]);
    expect(created().target).toEqual({ familleIds: [familleId], categoryIds: [], excludedOfferIds: [excluded._id] });
  });

  it("enregistre une livraison offerte sur le panier, sans remise", async () => {
    await create({ type: T.FREE_SHIPPING, minAmount: 100_000, productBoutiqueIds: [], discountValue: undefined });

    expect(created()).toMatchObject({ scope: PromotionScope.CART, discountValue: 0, minAmount: 100_000, code: null });
  });
});

// ─────────────────────────────────────────────
describe("managedPromotion", () => {
  it("renvoie 404 pour un identifiant invalide, une promotion introuvable ou de la plateforme", async () => {
    await expect(managedPromotion(SELLER, "x")).rejects.toMatchObject({ statusCode: 404, message: "Promotion introuvable." });
    await expect(managedPromotion(SELLER, String(oid()))).rejects.toMatchObject({ statusCode: 404 });
    PromotionMock.findById.mockReturnValueOnce(mockQuery(makePromotion()));
    await expect(managedPromotion(SELLER, String(oid()))).rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuse en 403 la promotion d'une autre boutique", async () => {
    PromotionMock.findById.mockReturnValueOnce(mockQuery(makeShopPromotion({ boutiqueId: shop._id })));

    await expect(managedPromotion(OTHER_SELLER, String(oid()))).rejects.toMatchObject({ statusCode: 403 });
  });

  it("renvoie la promotion et sa boutique", async () => {
    const promo = makeShopPromotion({ boutiqueId: shop._id });
    PromotionMock.findById.mockReturnValueOnce(mockQuery(promo));

    expect(await managedPromotion(SELLER, String(promo._id))).toEqual({ promo, shop });
  });
});

describe("updateShopPromotion", () => {
  const given = (over: Record<string, unknown>) => {
    const promo = makeShopPromotion({ boutiqueId: shop._id, productBoutiqueIds: [offer._id], ...over });
    // Comme un document Mongoose : set() fusionne les champs.
    (promo as any).set = vi.fn((fields: Record<string, unknown>) => Object.assign(promo, fields));
    PromotionMock.findById.mockReturnValue(mockQuery(promo));
    return promo;
  };
  const update = (promo: { _id: unknown }, over: Partial<ShopPromotionBody> = {}) =>
    updateShopPromotion(SELLER, String(promo._id), body({ launch: undefined, ...over }), NOW);

  it("refuse une promotion commencée", async () => {
    const promo = given({ startDate: at(-DAY), endDate: at(DAY) });

    await expect(update(promo)).rejects.toMatchObject({
      statusCode: 400,
      message: "Une promotion commencée ne se modifie plus : prolongez-la ou arrêtez-la.",
    });
  });

  it("refuse un changement de type", async () => {
    const promo = given({ status: S.DRAFT });

    await expect(update(promo, { type: T.FLASH_SALE })).rejects.toMatchObject({
      message: "Le type d'une promotion ne change pas : créez-en une autre.",
    });
  });

  it("modifie une promotion programmée et recalcule les anciennes puis les nouvelles offres", async () => {
    const other = makeProductBoutique({ boutiqueId: shop._id });
    const promo = given({ status: S.SCHEDULED, startDate: at(DAY), endDate: at(3 * DAY) });
    PbMock.find.mockReturnValue(mockQuery([other]));

    await update(promo, { productBoutiqueIds: [String(other._id)], startDate: at(2 * DAY).toISOString(), endDate: at(4 * DAY).toISOString() });

    expect(promo.status).toBe(S.SCHEDULED);
    expect(promo.productBoutiqueIds).toEqual([other._id]);
    expect(promo.save).toHaveBeenCalled();
    const [previous] = vi.mocked(recomputeForPromotion).mock.calls[0]!;
    expect((previous as any).productBoutiqueIds).toEqual([offer._id]);
    expect(vi.mocked(recomputeForPromotion).mock.calls[1]![0]).toBe(promo);
  });

  it("lance aussitôt une promotion programmée avancée à maintenant", async () => {
    const promo = given({ status: S.SCHEDULED, startDate: at(DAY), endDate: at(3 * DAY) });

    await update(promo, { launch: "now" });

    expect(promo.status).toBe(S.ACTIVE);
    expect(promo.startDate).toEqual(NOW);
  });

  it("garde un brouillon en brouillon, sans recalcul", async () => {
    const promo = given({ status: S.DRAFT, startDate: at(DAY), endDate: at(3 * DAY) });

    await update(promo, { discountValue: 25, startDate: at(DAY).toISOString() });

    expect(promo.status).toBe(S.DRAFT);
    expect(promo.discountValue).toBe(25);
    expect(recomputeForPromotion).not.toHaveBeenCalled();
  });

  it("ne compte pas la promotion modifiée dans ses propres plafonds ni dans les codes pris", async () => {
    const promo = given({ type: T.COUPON, status: S.DRAFT, code: "KALOUM10", startDate: at(DAY), endDate: at(3 * DAY), productBoutiqueIds: [] });

    await update(promo, { type: T.COUPON, code: "KALOUM10", productBoutiqueIds: [], startDate: at(DAY).toISOString() });

    expect(PromotionMock.findOne).toHaveBeenCalledWith({ code: "KALOUM10", _id: { $ne: promo._id } });
  });
});

// ─────────────────────────────────────────────
describe("applyPromotionAction", () => {
  const given = (over: Record<string, unknown>) => {
    const promo = makeShopPromotion({ boutiqueId: shop._id, productBoutiqueIds: [offer._id], ...over });
    PromotionMock.findById.mockReturnValue(mockQuery(promo));
    return promo;
  };
  const act = (promo: { _id: unknown }, action: PromotionAction, input: Record<string, unknown> = {}) =>
    applyPromotionAction(SELLER, String(promo._id), action, input, NOW);

  it("refuse en 400 une action interdite dans cet état", async () => {
    const promo = given({ startDate: at(-DAY), endDate: at(DAY) });

    await expect(act(promo, PromotionAction.LAUNCH)).rejects.toMatchObject({ statusCode: 400, message: "Seul un brouillon se lance." });
    expect(promo.save).not.toHaveBeenCalled();
  });

  describe("lancer un brouillon", () => {
    it("démarre maintenant et garde la durée choisie", async () => {
      // Brouillon prévu du J-2 au J+1 (3 jours) : lancé maintenant, il finit à J+3.
      const promo = given({ status: S.DRAFT, startDate: at(-2 * DAY), endDate: at(DAY) });

      await act(promo, PromotionAction.LAUNCH);

      expect(promo).toMatchObject({ status: S.ACTIVE, startDate: NOW, endDate: at(3 * DAY) });
      expect(promo.save).toHaveBeenCalled();
      expect(recomputeForPromotion).toHaveBeenCalledWith(promo, NOW);
    });

    it("programme un brouillon dont la date de début est à venir", async () => {
      const promo = given({ status: S.DRAFT, startDate: at(2 * DAY), endDate: at(4 * DAY) });

      await act(promo, PromotionAction.LAUNCH);

      expect(promo).toMatchObject({ status: S.SCHEDULED, startDate: at(2 * DAY), endDate: at(4 * DAY) });
    });

    it("démarre tout de suite sur demande, en gardant la durée", async () => {
      const promo = given({ status: S.DRAFT, startDate: at(2 * DAY), endDate: at(4 * DAY) });

      await act(promo, PromotionAction.LAUNCH, { now: true });

      expect(promo).toMatchObject({ status: S.ACTIVE, startDate: NOW, endDate: at(2 * DAY) });
    });

    it("garde un prix par quantité sans fin", async () => {
      const promo = given({ status: S.DRAFT, type: T.QUANTITY_TIERS, startDate: at(-DAY), endDate: NO_END, tiers: [{ minQuantity: 3, discountValue: 10 }] });

      await act(promo, PromotionAction.LAUNCH);

      expect(promo.endDate).toEqual(NO_END);
      expect(promo.status).toBe(S.ACTIVE);
    });

    it("refuse le lancement d'une boutique suspendue", async () => {
      shop.suspendedUntil = at(DAY);
      const promo = given({ status: S.DRAFT, startDate: at(DAY), endDate: at(2 * DAY) });

      await expect(act(promo, PromotionAction.LAUNCH)).rejects.toMatchObject({
        statusCode: 400,
        message: "Votre boutique est suspendue : la promotion se lancera après la suspension.",
      });
    });

    it("revérifie les règles au lancement (plafonds, promotions suspendues)", async () => {
      const promo = given({ status: S.DRAFT, startDate: at(DAY), endDate: at(2 * DAY) });
      shop.promotionsBlockedUntil = at(DAY);

      await expect(act(promo, PromotionAction.LAUNCH)).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  it("met en pause une promotion en cours et rend leurs prix aux offres", async () => {
    const promo = given({ startDate: at(-DAY), endDate: at(DAY) });

    await act(promo, PromotionAction.PAUSE);

    expect(promo.status).toBe(S.PAUSED);
    expect(recomputeForPromotion).toHaveBeenCalledWith(promo, NOW);
  });

  describe("reprendre", () => {
    it("reprend une promotion en pause", async () => {
      const promo = given({ status: S.PAUSED, startDate: at(-DAY), endDate: at(DAY) });

      await act(promo, PromotionAction.RESUME);

      expect(promo.status).toBe(S.ACTIVE);
    });

    it("rend « programmée » une pause dont le début est à venir", async () => {
      const promo = given({ status: S.PAUSED, startDate: at(DAY), endDate: at(2 * DAY) });

      await act(promo, PromotionAction.RESUME);

      expect(promo.status).toBe(S.SCHEDULED);
    });

    it("refuse en 403 quand les promotions de la boutique sont suspendues", async () => {
      shop.promotionsBlockedUntil = at(DAY);
      const promo = given({ status: S.PAUSED, startDate: at(-DAY), endDate: at(DAY) });

      await expect(act(promo, PromotionAction.RESUME)).rejects.toMatchObject({
        statusCode: 403,
        message: "Les promotions de cette boutique sont suspendues par la modération.",
      });
    });
  });

  it("prolonge jusqu'à la nouvelle date de fin", async () => {
    const promo = given({ startDate: at(-DAY), endDate: at(DAY) });

    await act(promo, PromotionAction.EXTEND, { endDate: at(10 * DAY).toISOString() });

    expect(promo.endDate).toEqual(at(10 * DAY));
    expect(promo.status).toBe(S.ACTIVE);
  });

  it("refuse une prolongation au-delà de la durée maximale", async () => {
    const promo = given({ startDate: at(-DAY), endDate: at(DAY) });

    await expect(act(promo, PromotionAction.EXTEND, { endDate: at(40 * DAY).toISOString() })).rejects.toMatchObject({
      message: "Cette promotion dure 30 jours au plus.",
    });
  });

  it("arrête une promotion et note pourquoi", async () => {
    const promo = given({ startDate: at(-DAY), endDate: at(DAY) });

    await act(promo, PromotionAction.STOP);

    expect(promo).toMatchObject({ status: S.STOPPED, stoppedAt: NOW, stopReason: "Arrêtée par la boutique." });
    expect(recomputeForPromotion).toHaveBeenCalledWith(promo, NOW);
  });

  it("refuse l'action sur la promotion d'une autre boutique", async () => {
    const promo = given({ startDate: at(-DAY), endDate: at(DAY) });

    await expect(applyPromotionAction(OTHER_SELLER, String(promo._id), PromotionAction.STOP, {}, NOW)).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ─────────────────────────────────────────────
describe("promotionStats", () => {
  it("renvoie des statistiques vides sans rien lire quand il n'y a pas de promotion", async () => {
    expect((await promotionStats([])).size).toBe(0);
    expect(OrderMock.aggregate).not.toHaveBeenCalled();
  });

  it("compte commandes, unités, chiffre d'affaires et remise accordée par promotion", async () => {
    const promo = makeShopPromotion();
    const quiet = makeShopPromotion();
    OrderMock.aggregate.mockResolvedValueOnce([{ _id: promo._id, orders: 3, units: 7, revenue: 56_000, discount: 14_000 }]);

    const stats = await promotionStats([promo, quiet]);

    expect(stats.get(String(promo._id))).toEqual({ orders: 3, units: 7, revenue: 56_000, discount: 14_000 });
    expect(stats.get(String(quiet._id))).toEqual({ orders: 0, units: 0, revenue: 0, discount: 0 });
    const [pipeline] = OrderMock.aggregate.mock.calls[0]!;
    expect(pipeline[0].$match.status).toEqual({ $nin: [OrderStatus.PAYMENT_FAILED, OrderStatus.CANCELLED] });
  });

  it("compte un code par les commandes qui l'ont utilisé", async () => {
    const code = makeShopPromotion({ type: T.COUPON, code: "KALOUM10", productBoutiqueIds: [] });
    OrderMock.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([{ _id: "KALOUM10", orders: 2, revenue: 90_000, discount: 10_000 }]);

    const stats = await promotionStats([code]);

    expect(stats.get(String(code._id))).toEqual({ orders: 2, units: 0, revenue: 90_000, discount: 10_000 });
    expect(OrderMock.aggregate.mock.calls[1]![0][0].$match.promotionCode).toEqual({ $in: ["KALOUM10"] });
  });
});

describe("listShopPromotions", () => {
  it("lit l'onglet demandé, trié, paginé, avec le compte de chaque onglet", async () => {
    const query = mockQuery([makeShopPromotion()]);
    PromotionMock.find.mockReturnValue(query);
    PromotionMock.countDocuments
      .mockReturnValueOnce(mockQuery(12))
      .mockReturnValueOnce(mockQuery(12))
      .mockReturnValueOnce(mockQuery(3))
      .mockReturnValueOnce(mockQuery(40));

    const page = await listShopPromotions(shop._id as Types.ObjectId, "active", 2, 10);

    expect(PromotionMock.find).toHaveBeenCalledWith({ boutiqueId: shop._id, status: { $in: [S.ACTIVE, S.PAUSED] } });
    expect(query.sort).toHaveBeenCalledWith({ endDate: 1 });
    expect(query.skip).toHaveBeenCalledWith(10);
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(page).toMatchObject({ total: 12, page: 2, totalPages: 2, counts: { active: 12, scheduled: 3, ended: 40 } });
    expect(page.items).toHaveLength(1);
  });

  it.each([
    ["scheduled", [S.SCHEDULED, S.DRAFT], { startDate: 1 }],
    ["ended", [S.ENDED, S.STOPPED], { endDate: -1 }],
  ] as const)("trie l'onglet %s", async (tab, statuses, sort) => {
    const query = mockQuery([]);
    PromotionMock.find.mockReturnValue(query);

    await listShopPromotions(shop._id as Types.ObjectId, tab, 1, 20);

    expect(PromotionMock.find).toHaveBeenCalledWith({ boutiqueId: shop._id, status: { $in: statuses } });
    expect(query.sort).toHaveBeenCalledWith(sort);
  });
});

// ─────────────────────────────────────────────
describe("setFeaturedRank", () => {
  it("renvoie 404 pour une offre invalide ou introuvable", async () => {
    await expect(setFeaturedRank(SELLER, "x", 1)).rejects.toMatchObject({ statusCode: 404, message: "Produit en boutique non trouvé" });
    await expect(setFeaturedRank(SELLER, String(oid()), 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("place l'offre et libère la place qu'elle prend", async () => {
    PbMock.findById.mockReturnValue(mockQuery(offer));

    await setFeaturedRank(SELLER, String(offer._id), 3);

    expect(PbMock.updateMany).toHaveBeenCalledWith(
      { boutiqueId: offer.boutiqueId, featuredRank: 3, _id: { $ne: offer._id } },
      { $set: { featuredRank: null } }
    );
    expect(offer.featuredRank).toBe(3);
    expect(offer.save).toHaveBeenCalled();
  });

  it("retire l'offre des produits phares sans toucher aux autres", async () => {
    offer.featuredRank = 2;
    PbMock.findById.mockReturnValue(mockQuery(offer));

    await setFeaturedRank(SELLER, String(offer._id), null);

    expect(offer.featuredRank).toBeNull();
    expect(PbMock.updateMany).not.toHaveBeenCalled();
  });

  it("refuse une offre masquée", async () => {
    offer.hiddenAt = at(-DAY);
    PbMock.findById.mockReturnValue(mockQuery(offer));

    await expect(setFeaturedRank(SELLER, String(offer._id), 1)).rejects.toMatchObject({ statusCode: 400, message: "Une offre masquée ne peut pas être un produit phare." });
  });

  it("refuse l'offre d'une autre boutique", async () => {
    PbMock.findById.mockReturnValue(mockQuery(offer));

    await expect(setFeaturedRank(OTHER_SELLER, String(offer._id), 1)).rejects.toMatchObject({ statusCode: 403 });
    expect(offer.save).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("campagnes", () => {
  describe("checkCampaignInput", () => {
    const input = (over: Record<string, unknown> = {}) => ({ startDate: NOW, endDate: at(10 * DAY), minDiscount: 10, ...over });

    it("accepte une campagne de 30 jours au plus, à 5–70 %", () => {
      expect(checkCampaignInput(input())).toBeNull();
      expect(checkCampaignInput(input({ endDate: at(30 * DAY) }))).toBeNull();
      expect(checkCampaignInput(input({ minDiscount: 5 }))).toBeNull();
      expect(checkCampaignInput(input({ minDiscount: 70 }))).toBeNull();
    });

    it("refuse des dates invalides, une fin avant le début, plus de 30 jours", () => {
      expect(checkCampaignInput(input({ startDate: new Date("x") }))).toBe("Dates invalides.");
      expect(checkCampaignInput(input({ endDate: NOW }))).toBe("La fin vient après le début.");
      expect(checkCampaignInput(input({ endDate: at(30 * DAY + 1) }))).toBe("Une campagne dure 30 jours au plus.");
    });

    it("refuse une remise minimale hors de 5–70 %", () => {
      expect(checkCampaignInput(input({ minDiscount: 4 }))).toBe("La remise minimale va de 5 à 70 %.");
      expect(checkCampaignInput(input({ minDiscount: 71 }))).toBe("La remise minimale va de 5 à 70 %.");
    });
  });

  it("dit l'état d'une campagne : à venir, en cours, terminée (ou désactivée)", () => {
    const campaign = { actif: true, startDate: at(-DAY), endDate: at(DAY) };
    expect(campaignState(campaign, NOW)).toBe("running");
    expect(campaignState({ ...campaign, startDate: at(HOUR) }, NOW)).toBe("upcoming");
    expect(campaignState({ ...campaign, endDate: at(-1) }, NOW)).toBe("ended");
    expect(campaignState({ ...campaign, actif: false }, NOW)).toBe("ended");
  });

  describe("campaignOfferIds", () => {
    it("regroupe par campagne les offres de ses inscriptions en cours", async () => {
      const soldes = oid();
      const rentree = oid();
      const [a, b, c] = [oid(), oid(), oid()];
      const query = mockQuery([
        makeShopPromotion({ campaignId: soldes, productBoutiqueIds: [a] }),
        makeShopPromotion({ campaignId: soldes, productBoutiqueIds: [b] }),
        makeShopPromotion({ campaignId: rentree, productBoutiqueIds: [c] }),
      ]);
      PromotionMock.find.mockReturnValue(query);

      const byCampaign = await campaignOfferIds([soldes, rentree], NOW);

      expect(byCampaign.get(String(soldes))).toEqual([a, b]);
      expect(byCampaign.get(String(rentree))).toEqual([c]);
      expect(PromotionMock.find).toHaveBeenCalledWith({
        campaignId: { $in: [soldes, rentree] },
        status: S.ACTIVE,
        startDate: { $lte: NOW },
        endDate: { $gte: NOW },
      });
      expect(query.select).toHaveBeenCalledWith("campaignId productBoutiqueIds");
    });

    it("ne renvoie rien pour une campagne sans inscription", async () => {
      expect((await campaignOfferIds([oid()], NOW)).size).toBe(0);
    });
  });

  describe("joinCampaign", () => {
    const join = (campaignId: string, over: Record<string, unknown> = {}) =>
      joinCampaign(SELLER, campaignId, { boutiqueId: String(shop._id), productBoutiqueIds: [String(offer._id)], discountValue: 15, ...over }, NOW);

    it("renvoie 404 pour une campagne invalide ou introuvable", async () => {
      await expect(join("x")).rejects.toMatchObject({ statusCode: 404, message: "Campagne introuvable." });
      await expect(join(String(oid()))).rejects.toMatchObject({ statusCode: 404 });
    });

    it("refuse une campagne terminée", async () => {
      CampaignMock.findById.mockReturnValue(mockQuery(makeCampaign({ endDate: at(-1) })));

      await expect(join(String(oid()))).rejects.toMatchObject({ statusCode: 400, message: "Cette campagne est terminée." });
    });

    it("exige la remise minimale de la campagne", async () => {
      CampaignMock.findById.mockReturnValue(mockQuery(makeCampaign({ minDiscount: 20 })));

      await expect(join(String(oid()), { discountValue: 15 })).rejects.toMatchObject({
        statusCode: 400,
        message: "Cette campagne demande une remise de 20 % au moins.",
      });
    });

    it("refuse une offre hors des familles de la campagne", async () => {
      const familleId = oid();
      CampaignMock.findById.mockReturnValue(mockQuery(makeCampaign({ familleIds: [familleId] })));
      ProductMock.find.mockReturnValue(mockQuery([makeProduct({ _id: offer.productId, familleId: oid() })]));

      await expect(join(String(oid()))).rejects.toMatchObject({ statusCode: 400, message: "Une offre n'appartient pas aux familles de la campagne." });
      expect(PromotionMock.create).not.toHaveBeenCalled();
    });

    it("inscrit les offres : une remise produit de la boutique, jusqu'à la fin de la campagne, rattachée à elle", async () => {
      const campaign = makeCampaign({ nom: "Soldes d'octobre", startDate: at(-2 * DAY), endDate: at(10 * DAY), minDiscount: 10 });
      CampaignMock.findById.mockReturnValue(mockQuery(campaign));

      const promo = await join(String(campaign._id));

      expect(created()).toMatchObject({
        type: T.PRODUCT_DISCOUNT,
        nom: "Soldes d'octobre — −15 %",
        discountValue: 15,
        productBoutiqueIds: [offer._id],
        startDate: NOW,
        endDate: at(10 * DAY),
        status: S.ACTIVE,
        boutiqueId: shop._id,
      });
      expect(promo.campaignId).toBe(campaign._id);
      expect(promo.save).toHaveBeenCalled();
      // Recalcul après rattachement : l'instantané de l'offre porte la campagne.
      expect(vi.mocked(recomputeForPromotion).mock.calls.at(-1)![0]).toBe(promo);
    });

    it("programme l'inscription à une campagne à venir à sa date de début", async () => {
      const campaign = makeCampaign({ startDate: at(3 * DAY), endDate: at(10 * DAY) });
      CampaignMock.findById.mockReturnValue(mockQuery(campaign));

      await join(String(campaign._id));

      expect(created()).toMatchObject({ status: S.SCHEDULED, startDate: at(3 * DAY), endDate: at(10 * DAY) });
    });

    it("garde les règles d'une promotion : remise de plus de 50 % à confirmer", async () => {
      CampaignMock.findById.mockReturnValue(mockQuery(makeCampaign()));

      await expect(join(String(oid()), { discountValue: 60 })).rejects.toMatchObject({
        message: "Une remise de plus de 50 % se confirme : vérifiez-la, puis confirmez.",
      });
      await expect(join(String(oid()), { discountValue: 60, confirmHighDiscount: true })).resolves.toBeDefined();
    });

    it("refuse d'inscrire la boutique d'un autre vendeur", async () => {
      CampaignMock.findById.mockReturnValue(mockQuery(makeCampaign()));

      await expect(
        joinCampaign(OTHER_SELLER, String(oid()), { boutiqueId: String(shop._id), productBoutiqueIds: [String(offer._id)], discountValue: 15 }, NOW)
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });
});

// ─────────────────────────────────────────────
//  Régression corrigée (promotion.service.ts, updateShopPromotion) : la création et le
//  lancement refusent une boutique suspendue, pas la modification. Une
//  boutique suspendue modifie sa promotion programmée avec launch « now » et
//  la met en ligne pendant sa suspension. Ce test garde le
// correctif.
// ─────────────────────────────────────────────
describe("régressions — boutique suspendue", () => {
  it("ne laisse pas une boutique suspendue lancer une promotion programmée en la modifiant", async () => {
    shop.suspendedUntil = at(5 * DAY);
    const promo = makeShopPromotion({ boutiqueId: shop._id, productBoutiqueIds: [offer._id], status: S.SCHEDULED, startDate: at(DAY), endDate: at(3 * DAY) });
    (promo as any).set = vi.fn((fields: Record<string, unknown>) => Object.assign(promo, fields));
    PromotionMock.findById.mockReturnValue(mockQuery(promo));

    await expect(updateShopPromotion(SELLER, String(promo._id), body({ launch: "now" }), NOW)).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ─────────────────────────────────────────────
describe("syncCampaignPromotions", () => {
  const enrolled = (over: Record<string, unknown> = {}) =>
    makeShopPromotion({ boutiqueId: shop._id, productBoutiqueIds: [offer._id], status: S.ACTIVE, startDate: at(-DAY), endDate: at(5 * DAY), ...over });

  it("arrête les promotions d'une campagne close et recalcule leurs offres", async () => {
    const campaign = makeCampaign({ actif: false, startDate: at(-2 * DAY), endDate: at(5 * DAY) });
    const promo = enrolled({ campaignId: campaign._id });
    PromotionMock.find.mockReturnValue(mockQuery([promo]));

    expect(await syncCampaignPromotions(campaign, NOW)).toBe(1);

    expect(PromotionMock.find.mock.calls[0]![0]).toEqual({ campaignId: campaign._id, status: { $in: [S.SCHEDULED, S.ACTIVE, S.PAUSED] } });
    expect(promo).toMatchObject({ status: S.STOPPED, stoppedAt: NOW, stopReason: "La campagne de la plateforme est terminée." });
    expect(promo.save).toHaveBeenCalled();
    expect(recomputeForPromotion).toHaveBeenCalledWith(promo, NOW);
  });

  it("aligne les promotions sur les nouvelles dates de la campagne", async () => {
    const campaign = makeCampaign({ actif: true, startDate: at(-2 * DAY), endDate: at(12 * DAY) });
    const live = enrolled({ campaignId: campaign._id });
    const waiting = enrolled({ campaignId: campaign._id, status: S.SCHEDULED, startDate: at(DAY) });
    PromotionMock.find.mockReturnValue(mockQuery([live, waiting]));

    await syncCampaignPromotions(campaign, NOW);

    expect(live).toMatchObject({ status: S.ACTIVE, endDate: at(12 * DAY) });
    // La campagne a déjà commencé : une inscription programmée démarre.
    expect(waiting).toMatchObject({ status: S.ACTIVE, startDate: NOW, endDate: at(12 * DAY) });
  });

  it("repousse les promotions d'une campagne décalée à plus tard", async () => {
    const campaign = makeCampaign({ actif: true, startDate: at(3 * DAY), endDate: at(12 * DAY) });
    const live = enrolled({ campaignId: campaign._id });
    PromotionMock.find.mockReturnValue(mockQuery([live]));

    await syncCampaignPromotions(campaign, NOW);

    expect(live).toMatchObject({ status: S.SCHEDULED, startDate: at(3 * DAY), endDate: at(12 * DAY) });
  });
});
