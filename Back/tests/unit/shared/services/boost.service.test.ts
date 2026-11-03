import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Types } from "mongoose";

// Seuls les modèles Mongoose sont simulés : enums et constantes restent réels.

vi.mock("../../../../src/models/address.model.js", async () => {
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { Address: mockModel() };
});
vi.mock("../../../../src/models/boutique.model.js", async () => {
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { Shop: mockModel() };
});
vi.mock("../../../../src/models/boost.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/boost.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, Boost: mockModel(), BoostStat: mockModel(), BoostExposure: mockModel(), BoostVisit: mockModel() };
});
vi.mock("../../../../src/models/credit.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/credit.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, CreditLedger: mockModel(), CreditPurchase: mockModel(), PlatformSetting: mockModel() };
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
vi.mock("../../../../src/models/recentlyViewed.model.js", async () => {
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { RecentlyViewed: mockModel() };
});
vi.mock("../../../../src/models/shopOrder.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/shopOrder.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, ShopOrder: mockModel() };
});
vi.mock("../../../../src/models/user.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/user.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, User: mockModel() };
});
vi.mock("../../../../src/models/wishlist.model.js", async () => {
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { Wishlist: mockModel() };
});

// Droits sur la boutique et ancienneté : testés dans promotion.service.
vi.mock("../../../../src/shared/services/promotion.service.js", () => ({
  managedShop: vi.fn(),
  promotionContext: vi.fn(),
}));

import { Address } from "../../../../src/models/address.model.js";
import { Shop } from "../../../../src/models/boutique.model.js";
import { Boost, BoostExposure, BoostGoal, BoostKind, BoostRelation, BoostStat, BoostStatus, BoostVisit } from "../../../../src/models/boost.model.js";
import { CreditLedger, CreditReason, PlatformSetting } from "../../../../src/models/credit.model.js";
import { Order } from "../../../../src/models/order.model.js";
import { Product, productBoutique } from "../../../../src/models/product.model.js";
import { Promotion, PromotionStatus, PromotionType } from "../../../../src/models/promotion.model.js";
import { RecentlyViewed } from "../../../../src/models/recentlyViewed.model.js";
import { ShopOrder } from "../../../../src/models/shopOrder.model.js";
import { EntityType, User } from "../../../../src/models/user.model.js";
import { Wishlist } from "../../../../src/models/wishlist.model.js";
import logger from "../../../../src/shared/logger/logger.js";
import { HttpError } from "../../../../src/shared/middlewares/error.middleware.js";
import { managedShop, promotionContext } from "../../../../src/shared/services/promotion.service.js";
import {
  applyBoostAction,
  attributedBoost,
  audienceUsers,
  boostTotals,
  createBoost,
  dayOf,
  DEFAULT_BOOST_SETTINGS,
  estimateBoost,
  estimateResults,
  finishBoost,
  getBoostSettings,
  grantMonthlyCredits,
  isBoostable,
  managedBoost,
  minDailyBudget,
  moveCredits,
  pacingShare,
  recordBoostCartAdd,
  recordBoostSales,
  recordBoostVisit,
  runBoostTick,
  SLOT_PLACES,
  sponsoredOffers,
  stopShopBoosts,
  toAudience,
  updateBoostSettings,
  type BoostInput,
  type SponsoredContext,
} from "../../../../src/shared/services/boost.service.js";
import { mockQuery } from "../../../helpers/model.mock.js";
import { mockSession } from "../../../helpers/express.mock.js";
import { makeBoost, makeProduct, makeProductBoutique, makeShop, makeShopPromotion, oid } from "../../../helpers/factories.js";

const AddressMock = Address as unknown as Record<string, any>;
const ShopMock = Shop as unknown as Record<string, any>;
const BoostMock = Boost as unknown as Record<string, any>;
const BoostStatMock = BoostStat as unknown as Record<string, any>;
const BoostExposureMock = BoostExposure as unknown as Record<string, any>;
const BoostVisitMock = BoostVisit as unknown as Record<string, any>;
const LedgerMock = CreditLedger as unknown as Record<string, any>;
const SettingMock = PlatformSetting as unknown as Record<string, any>;
const OrderMock = Order as unknown as Record<string, any>;
const ProductMock = Product as unknown as Record<string, any>;
const PbMock = productBoutique as unknown as Record<string, any>;
const PromotionMock = Promotion as unknown as Record<string, any>;
const RecentlyViewedMock = RecentlyViewed as unknown as Record<string, any>;
const ShopOrderMock = ShopOrder as unknown as Record<string, any>;
const UserMock = User as unknown as Record<string, any>;
const WishlistMock = Wishlist as unknown as Record<string, any>;

// 25 octobre, 14 h 30 (heure de Conakry = UTC) : la moitié du budget du jour peut être dépensée.
const NOW = new Date("2026-10-25T14:30:00.000Z");
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(NOW.getTime() + ms);
const TODAY = "2026-10-25";

let shop: ReturnType<typeof makeShop>;
const SELLER = { id: oid().toString(), entityType: EntityType.SHOP };

/** Utilisateurs simulés : `count` identifiants. */
const users = (count: number) => Array.from({ length: count }, () => ({ _id: oid() }));

beforeEach(() => {
  shop = makeShop({ nom: "Boutique Kaloum", boostCredits: 200_000, suspendedUntil: null, promotionsBlockedUntil: null });
  vi.mocked(managedShop).mockResolvedValue(shop);
  vi.mocked(promotionContext).mockResolvedValue({ running: 0, activeCodes: 0, flashThisMonth: 0, shopAgeDays: 90, deliveredOrders: 20 });

  SettingMock.findOne.mockReturnValue(mockQuery(null));
  ShopMock.findOneAndUpdate.mockImplementation((_filter: unknown, update: any) =>
    mockQuery({ _id: shop._id, boostCredits: (shop.boostCredits ?? 0) + update.$inc.boostCredits })
  );
  ShopMock.find.mockReturnValue(mockQuery([shop]));
  ShopMock.findById.mockReturnValue(mockQuery(shop));
  LedgerMock.find.mockReturnValue(mockQuery([]));
  BoostMock.find.mockReturnValue(mockQuery([]));
  BoostMock.findById.mockReturnValue(mockQuery(null));
  BoostMock.create.mockImplementation(async (doc: any) => makeBoost(doc));
  BoostStatMock.find.mockReturnValue(mockQuery([]));
  BoostStatMock.aggregate.mockResolvedValue([]);
  BoostExposureMock.find.mockReturnValue(mockQuery([]));
  BoostExposureMock.findOneAndUpdate.mockReturnValue(mockQuery({ count: 1 }));
  BoostVisitMock.findOne.mockReturnValue(mockQuery(null));
  PbMock.find.mockReturnValue(mockQuery([]));
  PbMock.findById.mockReturnValue(mockQuery(null));
  ProductMock.find.mockReturnValue(mockQuery([]));
  PromotionMock.find.mockReturnValue(mockQuery([]));
  PromotionMock.findById.mockReturnValue(mockQuery(null));
  UserMock.find.mockReturnValue(mockQuery(users(500)));
  AddressMock.distinct.mockReturnValue(mockQuery([]));
  RecentlyViewedMock.find.mockReturnValue(mockQuery([]));
  WishlistMock.find.mockReturnValue(mockQuery([]));
  OrderMock.distinct.mockReturnValue(mockQuery([]));
  ShopOrderMock.distinct.mockReturnValue(mockQuery([]));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────
describe("réglages", () => {
  it("prend les prix par défaut, puis ceux enregistrés par l'administration", async () => {
    expect(await getBoostSettings()).toEqual(DEFAULT_BOOST_SETTINGS);
    expect(DEFAULT_BOOST_SETTINGS).toMatchObject({ costPerVisit: 500, costPerThousandViews: 5_000, monthlyCredits: 50_000, minVisitsPerDay: 20 });

    SettingMock.findOne.mockReturnValueOnce(mockQuery({ value: { costPerVisit: 800 } }));
    expect(await getBoostSettings()).toMatchObject({ costPerVisit: 800, costPerThousandViews: 5_000 });
    expect(SettingMock.findOne).toHaveBeenCalledWith({ key: "boost" });
  });

  it("enregistre les nouveaux prix sans effacer ceux non fournis", async () => {
    const next = await updateBoostSettings({ costPerVisit: 700, monthlyCredits: undefined });

    expect(next).toMatchObject({ costPerVisit: 700, monthlyCredits: 50_000 });
    expect(SettingMock.findOneAndUpdate).toHaveBeenCalledWith({ key: "boost" }, { $set: { value: next } }, { upsert: true });
  });

  it("fixe le budget minimum à 20 visites par jour", () => {
    expect(minDailyBudget(DEFAULT_BOOST_SETTINGS)).toBe(10_000);
  });
});

// ─────────────────────────────────────────────
describe("moveCredits", () => {
  it("débite seulement si le solde suffit, et inscrit le mouvement au registre", async () => {
    const session = mockSession() as any;

    const balance = await moveCredits(shop._id, -30_000, CreditReason.BOOST_RESERVE, "Boost de 3 jours", "b1", session);

    expect(balance).toBe(170_000);
    const [filter, update, options] = ShopMock.findOneAndUpdate.mock.calls[0]!;
    expect(filter).toEqual({ _id: shop._id, boostCredits: { $gte: 30_000 } });
    expect(update).toEqual({ $inc: { boostCredits: -30_000 } });
    expect(options).toEqual({ new: true, session });
    expect(LedgerMock.create).toHaveBeenCalledWith(
      [{ boutiqueId: shop._id, delta: -30_000, balanceAfter: 170_000, reason: CreditReason.BOOST_RESERVE, ref: "b1", label: "Boost de 3 jours" }],
      { session }
    );
  });

  it("crédite sans condition de solde, montant arrondi", async () => {
    await moveCredits(shop._id, 999.6, CreditReason.RECHARGE, "Recharge", null);

    const [filter, update, options] = ShopMock.findOneAndUpdate.mock.calls[0]!;
    expect(filter).toEqual({ _id: shop._id });
    expect(update).toEqual({ $inc: { boostCredits: 1_000 } });
    expect(options).toEqual({ new: true });
  });

  it("refuse en 400 un débit plus grand que le solde, sans rien inscrire", async () => {
    ShopMock.findOneAndUpdate.mockReturnValueOnce(mockQuery(null));

    await expect(moveCredits(shop._id, -500_000, CreditReason.BOOST_RESERVE, "Boost", null)).rejects.toMatchObject({
      statusCode: 400,
      message: "Crédits insuffisants : rechargez votre portefeuille.",
    });
    expect(LedgerMock.create).not.toHaveBeenCalled();
  });
});

describe("grantMonthlyCredits", () => {
  it("verse les crédits du mois une fois par boutique", async () => {
    const already = makeShop();
    const fresh = makeShop();
    ShopMock.find.mockReturnValue(mockQuery([already, fresh]));
    LedgerMock.find.mockReturnValue(mockQuery([{ boutiqueId: already._id }]));

    expect(await grantMonthlyCredits(NOW)).toBe(1);

    expect(LedgerMock.find).toHaveBeenCalledWith({ reason: CreditReason.MONTHLY_GRANT, ref: "2026-10" });
    expect(ShopMock.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(ShopMock.findOneAndUpdate.mock.calls[0]![0]).toEqual({ _id: fresh._id });
    expect(LedgerMock.create.mock.calls[0]![0][0]).toMatchObject({ delta: 50_000, reason: CreditReason.MONTHLY_GRANT, ref: "2026-10", label: "Crédits offerts — 2026-10" });
  });

  it("ne verse rien quand l'administration a mis les crédits offerts à zéro", async () => {
    SettingMock.findOne.mockReturnValueOnce(mockQuery({ value: { monthlyCredits: 0 } }));

    expect(await grantMonthlyCredits(NOW)).toBe(0);
    expect(ShopMock.find).not.toHaveBeenCalled();
  });

  it("journalise un versement impossible et passe à la boutique suivante", async () => {
    ShopMock.find.mockReturnValue(mockQuery([makeShop(), makeShop()]));
    ShopMock.findOneAndUpdate.mockReturnValueOnce(mockQuery(null));

    expect(await grantMonthlyCredits(NOW)).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Crédits offerts non versés"));
  });
});

// ─────────────────────────────────────────────
describe("audience", () => {
  it("normalise une audience : zones nettoyées, types et familles valides seulement", () => {
    const familleId = oid().toString();
    expect(
      toAudience({
        mode: "custom",
        communes: [" Ratoma ", ""],
        villes: ["Conakry"],
        customerTypes: ["user", "admin", "user_societe"],
        interestFamilleIds: [familleId, "pas-un-id"],
        relation: "bogus" as BoostRelation,
      })
    ).toEqual({
      mode: "custom",
      communes: ["Ratoma"],
      villes: ["Conakry"],
      customerTypes: ["user", "user_societe"],
      interestFamilleIds: [new Types.ObjectId(familleId)],
      relation: BoostRelation.ALL,
    });
    expect(toAudience(undefined)).toEqual({ mode: "auto", communes: [], villes: [], customerTypes: [], interestFamilleIds: [], relation: BoostRelation.ALL });
  });

  it("vise en automatique tous les clients non bloqués, particuliers et sociétés", async () => {
    const found = await audienceUsers(shop._id, toAudience({}), NOW);

    expect(found.size).toBe(500);
    expect(UserMock.find).toHaveBeenCalledWith({ role: { $in: [EntityType.USER, EntityType.USER_SOCIETE] }, blockedAt: null });
    expect(AddressMock.distinct).not.toHaveBeenCalled();
  });

  it("restreint une audience personnalisée par zone, intérêt et relation avec la boutique", async () => {
    const [a, b, c, d] = users(4);
    UserMock.find.mockReturnValue(mockQuery([a, b, c, d]));
    AddressMock.distinct.mockReturnValue(mockQuery([a!._id, b!._id, c!._id]));
    RecentlyViewedMock.find.mockReturnValue(mockQuery([{ userId: a!._id }]));
    WishlistMock.find.mockReturnValue(mockQuery([{ userId: b!._id }]));
    OrderMock.distinct.mockReturnValue(mockQuery([d!._id]));
    ShopOrderMock.distinct.mockReturnValue(mockQuery([b!._id]));
    const familleId = oid().toString();

    const returning = await audienceUsers(
      shop._id,
      toAudience({ mode: "custom", communes: ["Ratoma"], customerTypes: ["user"], interestFamilleIds: [familleId], relation: BoostRelation.RETURNING }),
      NOW
    );
    const fresh = await audienceUsers(
      shop._id,
      toAudience({ mode: "custom", communes: ["Ratoma"], interestFamilleIds: [familleId], relation: BoostRelation.NEW }),
      NOW
    );

    // Zone : a, b, c ; intérêt : a, b (d est hors zone) ; clients de la boutique : b.
    expect([...returning]).toEqual([String(b!._id)]);
    expect([...fresh]).toEqual([String(a!._id)]);
    expect(UserMock.find.mock.calls[0]![0]).toEqual({ role: { $in: ["user"] }, blockedAt: null });
    expect(AddressMock.distinct).toHaveBeenCalledWith("userId", { $or: [{ commune: { $in: ["Ratoma"] } }] });
  });
});

describe("isBoostable", () => {
  it("exige du stock, une offre en vente et une photo", () => {
    expect(isBoostable({ stock: 1, hiddenAt: null, urlImages: ["a.jpg"] })).toBe(true);
    expect(isBoostable({ stock: 0, hiddenAt: null, urlImages: ["a.jpg"] })).toBe(false);
    expect(isBoostable({ stock: 1, hiddenAt: NOW, urlImages: ["a.jpg"] })).toBe(false);
    expect(isBoostable({ stock: 1, hiddenAt: null, urlImages: [] })).toBe(false);
  });
});

describe("estimateResults", () => {
  it("visites : le budget achète des visites, plafonnées par l'audience", () => {
    // 10 000 / 500 = 20 visites ; audience de 500 → 1 500 affichages possibles, 60 visites au plus.
    expect(estimateResults({ goal: BoostGoal.VISITS, dailyBudget: 10_000 }, DEFAULT_BOOST_SETTINGS, 500)).toEqual({
      dailyViews: [500, 1_000],
      dailyVisits: [12, 20],
    });
  });

  it("vues : le budget achète des milliers d'affichages, 3 par client et par jour au plus", () => {
    expect(estimateResults({ goal: BoostGoal.VIEWS, dailyBudget: 10_000 }, DEFAULT_BOOST_SETTINGS, 500)).toEqual({
      dailyViews: [1_050, 1_500],
      dailyVisits: [30, 60],
    });
    expect(estimateResults({ goal: BoostGoal.VIEWS, dailyBudget: 5_000 }, DEFAULT_BOOST_SETTINGS, 10_000).dailyViews).toEqual([700, 1_000]);
  });
});

// ─────────────────────────────────────────────
describe("createBoost", () => {
  let offer: ReturnType<typeof makeProductBoutique>;

  beforeEach(() => {
    offer = makeProductBoutique({ boutiqueId: shop._id, stock: 5, hiddenAt: null });
    PbMock.find.mockReturnValue(mockQuery([offer]));
  });

  const input = (over: Partial<BoostInput> = {}): BoostInput => ({
    kind: BoostKind.PRODUCT,
    productBoutiqueIds: [String(offer._id)],
    dailyBudget: 10_000,
    days: 3,
    ...over,
  });
  const launch = (over: Partial<BoostInput> = {}) => createBoost(SELLER, String(shop._id), input(over), NOW);

  it("rend le budget réservé si l'écriture du boost échoue", async () => {
    BoostMock.create.mockRejectedValueOnce(new Error("écriture refusée"));

    await expect(launch()).rejects.toThrow("écriture refusée");

    const updates = ShopMock.findOneAndUpdate.mock.calls.map(([, update]: any[]) => update.$inc.boostCredits);
    expect(updates).toEqual([-30_000, 30_000]);
    expect(LedgerMock.create.mock.calls[1]![0][0]).toMatchObject({ delta: 30_000, reason: CreditReason.BOOST_REFUND, label: "Boost non lancé : budget rendu" });
  });

  it("réserve le budget total sur les crédits et lance le boost à prix fixes", async () => {
    const boost = await launch({ goal: BoostGoal.VIEWS });

    const [filter, update] = ShopMock.findOneAndUpdate.mock.calls[0]!;
    expect(filter).toEqual({ _id: shop._id, boostCredits: { $gte: 30_000 } });
    expect(update).toEqual({ $inc: { boostCredits: -30_000 } });
    const ledger = LedgerMock.create.mock.calls[0]![0][0];
    expect(ledger).toMatchObject({ delta: -30_000, reason: CreditReason.BOOST_RESERVE, label: "Boost de 3 jours" });
    const created = BoostMock.create.mock.calls[0]![0];
    expect(created).toMatchObject({
      boutiqueId: shop._id,
      kind: BoostKind.PRODUCT,
      promotionId: null,
      productBoutiqueIds: [offer._id],
      goal: BoostGoal.VIEWS,
      dailyBudget: 10_000,
      reserved: 30_000,
      spent: 0,
      costPerVisit: 500,
      costPerThousandViews: 5_000,
      startDate: NOW,
      endDate: at(3 * DAY),
      status: BoostStatus.ACTIVE,
      createdBy: new Types.ObjectId(SELLER.id),
    });
    // Le registre renvoie au boost créé.
    expect(ledger.ref).toBe(String(created._id));
    expect(boost.reserved).toBe(30_000);
  });

  it("refuse en 400 quand les crédits ne suffisent pas, sans créer de boost", async () => {
    ShopMock.findOneAndUpdate.mockReturnValueOnce(mockQuery(null));

    await expect(launch()).rejects.toMatchObject({ statusCode: 400, message: "Crédits insuffisants : rechargez votre portefeuille." });
    expect(BoostMock.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ days: 0 }, "Un boost dure de 1 à 30 jours."],
    [{ days: 31 }, "Un boost dure de 1 à 30 jours."],
    [{ days: 2.5 }, "Un boost dure de 1 à 30 jours."],
    [{ dailyBudget: 9_999 }, "Le budget minimum est de 10000 GNF par jour."],
    [{ kind: "bogus" as BoostKind }, "Choisissez un boost de promotion ou de produit."],
    [{ goal: "clicks" as BoostGoal }, "Objectif inconnu."],
  ])("refuse une saisie invalide %o", async (over, message) => {
    await expect(launch(over)).rejects.toMatchObject({ statusCode: 400, message });
    expect(ShopMock.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("refuse une boutique suspendue, ou privée de promotions (403)", async () => {
    shop.suspendedUntil = at(DAY);
    await expect(launch()).rejects.toMatchObject({ statusCode: 400, message: "Votre boutique est suspendue : elle ne peut pas être boostée d'ici là." });

    shop.suspendedUntil = null;
    shop.promotionsBlockedUntil = at(DAY);
    await expect(launch()).rejects.toMatchObject({ statusCode: 403, message: "Les promotions et boosts de cette boutique sont suspendus par la modération." });
  });

  it("s'ouvre après 30 jours et 5 commandes livrées", async () => {
    vi.mocked(promotionContext).mockResolvedValueOnce({ running: 0, activeCodes: 0, flashThisMonth: 0, shopAgeDays: 12, deliveredOrders: 20 });

    await expect(launch()).rejects.toMatchObject({ statusCode: 400, message: "Le boost s'ouvre après 30 jours et 5 commandes livrées." });
  });

  it("refuse la boutique d'un autre vendeur", async () => {
    vi.mocked(managedShop).mockRejectedValueOnce(new HttpError("Vous ne pouvez gérer que vos propres boutiques.", 403));

    await expect(launch()).rejects.toMatchObject({ statusCode: 403 });
  });

  describe("boost de produit", () => {
    it("exige 1 à 10 produits", async () => {
      await expect(launch({ productBoutiqueIds: [] })).rejects.toMatchObject({ message: "Choisissez au moins un produit." });
      await expect(launch({ productBoutiqueIds: Array.from({ length: 11 }, () => String(oid())) })).rejects.toMatchObject({
        message: "10 produits au plus par boost.",
      });
    });

    it("renvoie 404 pour un produit introuvable, 403 pour celui d'une autre boutique", async () => {
      PbMock.find.mockReturnValueOnce(mockQuery([]));
      await expect(launch()).rejects.toMatchObject({ statusCode: 404, message: "Un produit est introuvable." });

      PbMock.find.mockReturnValueOnce(mockQuery([makeProductBoutique({ boutiqueId: oid() })]));
      await expect(launch()).rejects.toMatchObject({ statusCode: 403, message: "Un boost ne montre que les produits de sa boutique." });
    });

    it("ne garde que les produits montrables, et refuse s'il n'en reste aucun", async () => {
      const outOfStock = makeProductBoutique({ boutiqueId: shop._id, stock: 0 });
      PbMock.find.mockReturnValue(mockQuery([offer, outOfStock]));
      await launch({ productBoutiqueIds: [String(offer._id), String(outOfStock._id)] });
      expect(BoostMock.create.mock.calls[0]![0].productBoutiqueIds).toEqual([offer._id]);

      PbMock.find.mockReturnValue(mockQuery([outOfStock]));
      await expect(launch({ productBoutiqueIds: [String(outOfStock._id)] })).rejects.toMatchObject({
        message: "Aucun de ces produits ne peut être boosté : il faut du stock et au moins une photo.",
      });
    });
  });

  describe("boost de promotion", () => {
    const promoBoost = (over: Partial<BoostInput> = {}) => launch({ kind: BoostKind.PROMOTION, productBoutiqueIds: undefined, ...over });
    const promotion = (over: Record<string, unknown> = {}) =>
      makeShopPromotion({ boutiqueId: shop._id, productBoutiqueIds: [offer._id], startDate: at(-DAY), endDate: at(10 * DAY), ...over });

    it("exige la promotion, de la boutique", async () => {
      await expect(promoBoost()).rejects.toMatchObject({ statusCode: 400, message: "Choisissez la promotion à booster." });
      PromotionMock.findById.mockReturnValueOnce(mockQuery(promotion({ boutiqueId: oid() })));
      await expect(promoBoost({ promotionId: String(oid()) })).rejects.toMatchObject({ statusCode: 404, message: "Promotion introuvable." });
    });

    it("ne booste qu'une promotion en cours ou programmée, qui montre des produits", async () => {
      PromotionMock.findById.mockReturnValueOnce(mockQuery(promotion({ status: PromotionStatus.PAUSED })));
      await expect(promoBoost({ promotionId: String(oid()) })).rejects.toMatchObject({ message: "Seule une promotion en cours ou programmée se booste." });

      PromotionMock.findById.mockReturnValueOnce(mockQuery(promotion({ type: PromotionType.COUPON, code: "KALOUM10" })));
      await expect(promoBoost({ promotionId: String(oid()) })).rejects.toMatchObject({
        message: "Un code ou une livraison offerte n'a pas de produit à montrer : boostez plutôt les produits.",
      });
    });

    it("montre les offres de la promotion et ne dépasse pas sa fin", async () => {
      const promo = promotion({ endDate: at(2 * DAY) });
      PromotionMock.findById.mockReturnValue(mockQuery(promo));

      await expect(promoBoost({ promotionId: String(promo._id), days: 3 })).rejects.toMatchObject({
        statusCode: 400,
        message: `Un boost de promotion ne dépasse pas la fin de la promotion (${at(2 * DAY).toLocaleDateString("fr-FR")}).`,
      });

      await promoBoost({ promotionId: String(promo._id), days: 2 });
      expect(BoostMock.create.mock.calls[0]![0]).toMatchObject({ kind: BoostKind.PROMOTION, promotionId: promo._id, productBoutiqueIds: [offer._id] });
      expect(PbMock.find).toHaveBeenCalledWith({ _id: { $in: promo.productBoutiqueIds } });
    });

    it("montre les offres visées par une promotion boutique, les plus vendues d'abord", async () => {
      const product = makeProduct();
      const inFamily = makeProductBoutique({ boutiqueId: shop._id, productId: product._id });
      const outside = makeProductBoutique({ boutiqueId: shop._id, productId: oid() });
      const query = mockQuery([inFamily, outside]);
      PbMock.find.mockReturnValue(query);
      ProductMock.find.mockReturnValue(mockQuery([product]));
      const promo = promotion({ type: PromotionType.SHOP_DISCOUNT, productBoutiqueIds: [], target: { familleIds: [product.familleId], categoryIds: [], excludedOfferIds: [] } });
      PromotionMock.findById.mockReturnValue(mockQuery(promo));

      await promoBoost({ promotionId: String(promo._id) });

      expect(PbMock.find).toHaveBeenCalledWith({ boutiqueId: shop._id });
      expect(query.sort).toHaveBeenCalledWith({ salesCount30d: -1 });
      expect(BoostMock.create.mock.calls[0]![0].productBoutiqueIds).toEqual([inFamily._id]);
    });

    it("laisse la boutique retirer des offres de la promotion", async () => {
      const other = makeProductBoutique({ boutiqueId: shop._id });
      PbMock.find.mockReturnValue(mockQuery([offer, other]));
      const promo = promotion({ productBoutiqueIds: [offer._id, other._id] });
      PromotionMock.findById.mockReturnValue(mockQuery(promo));

      await promoBoost({ promotionId: String(promo._id), productBoutiqueIds: [String(other._id)] });

      expect(BoostMock.create.mock.calls[0]![0].productBoutiqueIds).toEqual([other._id]);
    });
  });

  it("refuse une audience personnalisée de moins de 100 clients, pour ne jamais viser une personne", async () => {
    UserMock.find.mockReturnValue(mockQuery(users(99)));

    await expect(launch({ audience: { mode: "custom", customerTypes: ["user"] } })).rejects.toMatchObject({
      statusCode: 400,
      message: "Cette audience compte moins de 100 clients : élargissez-la, pour ne jamais viser une personne.",
    });
    expect(ShopMock.findOneAndUpdate).not.toHaveBeenCalled();

    UserMock.find.mockReturnValue(mockQuery(users(100)));
    await expect(launch({ audience: { mode: "custom", customerTypes: ["user"] } })).resolves.toBeDefined();
  });
});

describe("estimateBoost", () => {
  it("estime l'audience, le budget total et les résultats, avec le solde de la boutique", async () => {
    const offer = makeProductBoutique({ boutiqueId: shop._id });
    PbMock.find.mockReturnValue(mockQuery([offer]));

    const estimate = await estimateBoost(SELLER, String(shop._id), { kind: BoostKind.PRODUCT, productBoutiqueIds: [String(offer._id)], dailyBudget: 10_000, days: 5 }, NOW);

    expect(estimate).toEqual({
      audienceSize: 500,
      minAudience: 100,
      audienceOk: true,
      days: 5,
      maxDays: 30,
      totalBudget: 50_000,
      minDailyBudget: 10_000,
      dailyViews: [500, 1_000],
      dailyVisits: [12, 20],
      costPerVisit: 500,
      costPerThousandViews: 5_000,
      credits: 200_000,
    });
    expect(BoostMock.create).not.toHaveBeenCalled();
  });

  it("borne la durée à la fin d'une promotion et signale une audience trop petite", async () => {
    const offer = makeProductBoutique({ boutiqueId: shop._id });
    PbMock.find.mockReturnValue(mockQuery([offer]));
    PromotionMock.findById.mockReturnValue(mockQuery(makeShopPromotion({ boutiqueId: shop._id, productBoutiqueIds: [offer._id], startDate: at(-DAY), endDate: at(4 * DAY + HOUR) })));
    UserMock.find.mockReturnValue(mockQuery(users(40)));

    const estimate = await estimateBoost(
      SELLER,
      String(shop._id),
      { kind: BoostKind.PROMOTION, promotionId: String(oid()), dailyBudget: 10_000, days: 10, audience: { mode: "custom" } },
      NOW
    );

    expect(estimate).toMatchObject({ maxDays: 4, days: 4, totalBudget: 40_000, audienceSize: 40, audienceOk: false });
  });
});

// ─────────────────────────────────────────────
describe("finishBoost", () => {
  it("termine le boost et rend en crédits le budget non dépensé", async () => {
    const boost = makeBoost({ boutiqueId: shop._id, reserved: 50_000, spent: 12_345.4 });

    await finishBoost(boost, BoostStatus.STOPPED, "Arrêté par la boutique.", NOW);

    expect(boost).toMatchObject({ status: BoostStatus.STOPPED, stopReason: "Arrêté par la boutique.", endedAt: NOW, refunded: 37_655 });
    // Écriture conditionnelle : seul un boost encore en cours ou en pause se termine.
    expect(BoostMock.updateOne).toHaveBeenCalledWith(
      { _id: boost._id, status: { $in: [BoostStatus.ACTIVE, BoostStatus.PAUSED] } },
      { $set: { status: BoostStatus.STOPPED, stopReason: "Arrêté par la boutique.", endedAt: NOW, refunded: 37_655 } }
    );
    expect(ShopMock.findOneAndUpdate.mock.calls[0]![1]).toEqual({ $inc: { boostCredits: 37_655 } });
    expect(LedgerMock.create.mock.calls[0]![0][0]).toMatchObject({ reason: CreditReason.BOOST_REFUND, ref: String(boost._id), label: "Budget de boost non dépensé" });
  });

  it("ne rend rien d'un budget tout dépensé", async () => {
    const boost = makeBoost({ reserved: 50_000, spent: 50_000 });

    await finishBoost(boost, BoostStatus.ENDED, "Budget dépensé.", NOW);

    expect(boost.refunded).toBe(0);
    expect(ShopMock.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("ne rend jamais deux fois : un boost terminé reste tel quel", async () => {
    const boost = makeBoost({ status: BoostStatus.ENDED, refunded: 10_000 });

    expect(await finishBoost(boost, BoostStatus.STOPPED, "Encore ?", NOW)).toBe(boost);
    expect(boost.status).toBe(BoostStatus.ENDED);
    expect(boost.save).not.toHaveBeenCalled();
    expect(ShopMock.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe("managedBoost / applyBoostAction", () => {
  const given = (over: Record<string, unknown> = {}) => {
    const boost = makeBoost({ boutiqueId: shop._id, endDate: at(3 * DAY), ...over });
    BoostMock.findById.mockReturnValue(mockQuery(boost));
    return boost;
  };

  it("renvoie 404 pour un boost invalide ou introuvable, et vérifie la boutique", async () => {
    await expect(managedBoost(SELLER, "x")).rejects.toMatchObject({ statusCode: 404, message: "Boost introuvable." });
    await expect(managedBoost(SELLER, String(oid()))).rejects.toMatchObject({ statusCode: 404 });
    const boost = given();
    await managedBoost(SELLER, String(boost._id));
    expect(managedShop).toHaveBeenCalledWith(SELLER, String(shop._id));
  });

  it("met en pause un boost en cours, et seulement lui", async () => {
    const boost = given();
    await applyBoostAction(SELLER, String(boost._id), "pause", NOW);
    expect(boost.status).toBe(BoostStatus.PAUSED);

    await expect(applyBoostAction(SELLER, String(boost._id), "pause", NOW)).rejects.toMatchObject({ statusCode: 400, message: "Seul un boost en cours se met en pause." });
  });

  it("reprend un boost en pause, ou le termine si sa durée est écoulée", async () => {
    const paused = given({ status: BoostStatus.PAUSED });
    await applyBoostAction(SELLER, String(paused._id), "resume", NOW);
    expect(paused.status).toBe(BoostStatus.ACTIVE);

    const late = given({ status: BoostStatus.PAUSED, endDate: at(-1) });
    await applyBoostAction(SELLER, String(late._id), "resume", NOW);
    expect(late).toMatchObject({ status: BoostStatus.ENDED, stopReason: "Durée écoulée." });

    const active = given();
    await expect(applyBoostAction(SELLER, String(active._id), "resume", NOW)).rejects.toMatchObject({ message: "Seul un boost en pause reprend." });
  });

  it("arrête un boost en cours ou en pause et rend le reste du budget", async () => {
    const boost = given({ status: BoostStatus.PAUSED, reserved: 30_000, spent: 10_000 });

    await applyBoostAction(SELLER, String(boost._id), "stop", NOW);

    expect(boost).toMatchObject({ status: BoostStatus.STOPPED, stopReason: "Arrêté par la boutique.", refunded: 20_000 });

    await expect(applyBoostAction(SELLER, String(boost._id), "stop", NOW)).rejects.toMatchObject({ message: "Ce boost est déjà terminé." });
  });

  it("refuse une action inconnue", async () => {
    const boost = given();
    await expect(applyBoostAction(SELLER, String(boost._id), "delete" as never, NOW)).rejects.toMatchObject({ message: "Action inconnue." });
  });
});

describe("stopShopBoosts", () => {
  it("arrête les boosts en cours ou en pause de la boutique et rend leur budget", async () => {
    const a = makeBoost({ boutiqueId: shop._id, reserved: 10_000 });
    const b = makeBoost({ boutiqueId: shop._id, status: BoostStatus.PAUSED, reserved: 20_000, spent: 5_000 });
    BoostMock.find.mockReturnValue(mockQuery([a, b]));

    expect(await stopShopBoosts(String(shop._id), "Boutique suspendue.", NOW)).toBe(2);

    expect(BoostMock.find).toHaveBeenCalledWith({ boutiqueId: shop._id, status: { $in: [BoostStatus.ACTIVE, BoostStatus.PAUSED] } });
    expect(a).toMatchObject({ status: BoostStatus.STOPPED, stopReason: "Boutique suspendue.", refunded: 10_000 });
    expect(b.refunded).toBe(15_000);
  });
});

// ─────────────────────────────────────────────
describe("runBoostTick", () => {
  const tick = async (boost: ReturnType<typeof makeBoost>, opts: { offers?: unknown[]; promos?: unknown[]; shops?: unknown[] } = {}) => {
    BoostMock.find.mockReturnValue(mockQuery([boost]));
    ShopMock.find.mockReturnValue(mockQuery(opts.shops ?? [shop]));
    PbMock.find.mockReturnValue(mockQuery(opts.offers ?? boost.productBoutiqueIds.map((id) => makeProductBoutique({ _id: id, boutiqueId: shop._id }))));
    PromotionMock.find.mockReturnValue(mockQuery(opts.promos ?? []));
    return runBoostTick(NOW);
  };

  it("ne fait rien sans boost en cours", async () => {
    expect(await runBoostTick(NOW)).toBe(0);
    expect(ShopMock.find).not.toHaveBeenCalled();
  });

  it("laisse courir un boost en règle", async () => {
    const boost = makeBoost({ boutiqueId: shop._id, endDate: at(DAY) });

    expect(await tick(boost)).toBe(0);
    expect(boost.status).toBe(BoostStatus.ACTIVE);
  });

  it.each<[string, Record<string, unknown>, BoostStatus, string]>([
    ["durée écoulée", { endDate: at(-1) }, BoostStatus.ENDED, "Durée écoulée."],
    ["budget dépensé", { spent: 50_000 }, BoostStatus.ENDED, "Budget dépensé."],
  ])("termine un boost : %s", async (_label, over, status, reason) => {
    const boost = makeBoost({ boutiqueId: shop._id, endDate: at(DAY), ...over });

    expect(await tick(boost)).toBe(1);
    expect(boost).toMatchObject({ status, stopReason: reason });
  });

  it("termine un boost de promotion dont la promotion est finie ou introuvable", async () => {
    const promo = makeShopPromotion({ boutiqueId: shop._id, status: PromotionStatus.STOPPED });
    const withPromo = makeBoost({ boutiqueId: shop._id, kind: BoostKind.PROMOTION, promotionId: promo._id, endDate: at(DAY) });
    await tick(withPromo, { promos: [promo] });
    expect(withPromo).toMatchObject({ status: BoostStatus.ENDED, stopReason: "La promotion est terminée." });

    const orphan = makeBoost({ boutiqueId: shop._id, kind: BoostKind.PROMOTION, promotionId: oid(), endDate: at(DAY) });
    await tick(orphan);
    expect(orphan.stopReason).toBe("La promotion est terminée.");
  });

  it("arrête les boosts d'une boutique suspendue, disparue ou privée de promotions", async () => {
    const suspended = makeBoost({ boutiqueId: shop._id, endDate: at(DAY) });
    await tick(suspended, { shops: [Object.assign(makeShop({ _id: shop._id }), { suspendedUntil: at(DAY) })] });
    expect(suspended).toMatchObject({ status: BoostStatus.STOPPED, stopReason: "Boutique suspendue." });

    const gone = makeBoost({ boutiqueId: shop._id, endDate: at(DAY) });
    await tick(gone, { shops: [] });
    expect(gone.stopReason).toBe("Boutique suspendue.");

    const banned = makeBoost({ boutiqueId: shop._id, endDate: at(DAY) });
    await tick(banned, { shops: [Object.assign(makeShop({ _id: shop._id }), { promotionsBlockedUntil: at(DAY) })] });
    expect(banned).toMatchObject({ status: BoostStatus.STOPPED, stopReason: "Promotions suspendues par la modération." });
  });

  it("arrête un boost qui n'a plus aucun produit à montrer", async () => {
    const boost = makeBoost({ boutiqueId: shop._id, endDate: at(DAY) });

    await tick(boost, { offers: [makeProductBoutique({ _id: boost.productBoutiqueIds[0], stock: 0 })] });

    expect(boost).toMatchObject({ status: BoostStatus.STOPPED, stopReason: "Plus aucun produit à montrer : rupture ou retrait." });
  });
});

// ─────────────────────────────────────────────
describe("pacingShare", () => {
  it("dépense le budget du jour régulièrement de 7 h à 22 h", () => {
    expect(pacingShare(new Date("2026-10-25T03:00:00.000Z"))).toBe(0.05);
    expect(pacingShare(new Date("2026-10-25T07:00:00.000Z"))).toBe(0.05);
    expect(pacingShare(NOW)).toBe(0.5);
    expect(pacingShare(new Date("2026-10-25T22:00:00.000Z"))).toBe(1);
    expect(pacingShare(new Date("2026-10-25T23:30:00.000Z"))).toBe(1);
  });

  it("nomme le jour en UTC", () => {
    expect(dayOf(NOW)).toBe(TODAY);
  });
});

describe("sponsoredOffers", () => {
  const viewer = { key: "user:abc", userId: oid().toString() };
  const context = (over: Partial<SponsoredContext> = {}): SponsoredContext => ({ slot: "home", viewer, ...over });

  /** Boosts en cours et leurs offres, en stock et avec photo, du produit fourni. */
  const world = (entries: { boost?: Record<string, unknown>; offer?: Record<string, unknown>; product?: Record<string, unknown> }[]) => {
    const rows = entries.map((entry) => {
      const product = makeProduct(entry.product ?? {});
      const offer = makeProductBoutique({ productId: product._id, boutiqueId: shop._id, stock: 5, hiddenAt: null, ...entry.offer });
      const boost = makeBoost({ boutiqueId: offer.boutiqueId, productBoutiqueIds: [offer._id], endDate: at(DAY), ...entry.boost });
      return { product, offer, boost };
    });
    BoostMock.find.mockReturnValue(mockQuery(rows.map((row) => row.boost)));
    PbMock.find.mockReturnValue(mockQuery(rows.map((row) => row.offer)));
    ProductMock.find.mockReturnValue(mockQuery(rows.map((row) => row.product)));
    return rows;
  };

  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  it("ne montre rien sans boost en cours", async () => {
    expect(await sponsoredOffers(context(), NOW)).toEqual([]);
    expect(BoostMock.find).toHaveBeenCalledWith({ status: BoostStatus.ACTIVE, startDate: { $lte: NOW }, endDate: { $gt: NOW } });
  });

  it("montre l'offre d'un boost en cours et compte l'affichage", async () => {
    const [row] = world([{}]);

    const picked = await sponsoredOffers(context(), NOW);

    expect(picked).toEqual([{ offer: row!.offer, boost: row!.boost }]);
    expect(BoostExposureMock.findOneAndUpdate).toHaveBeenCalledWith(
      { boostId: row!.boost._id, viewerKey: "user:abc", day: TODAY },
      { $inc: { count: 1 } },
      { upsert: true, new: true }
    );
    // Objectif « visites » : l'affichage est compté, pas payé.
    expect(BoostStatMock.updateOne).toHaveBeenCalledWith(
      { boostId: row!.boost._id, day: TODAY },
      { $inc: { impressions: 1, reach: 1, spent: 0 } },
      { upsert: true }
    );
    expect(BoostMock.updateOne).not.toHaveBeenCalled();
  });

  it("fait payer l'affichage pour l'objectif « vues » (prix des 1 000 affichages / 1 000)", async () => {
    const [row] = world([{ boost: { goal: BoostGoal.VIEWS } }]);
    BoostExposureMock.findOneAndUpdate.mockReturnValue(mockQuery({ count: 2 }));

    await sponsoredOffers(context(), NOW);

    expect(BoostStatMock.updateOne).toHaveBeenCalledWith({ boostId: row!.boost._id, day: TODAY }, { $inc: { impressions: 1, reach: 0, spent: 5 } }, { upsert: true });
    expect(BoostMock.updateOne).toHaveBeenCalledWith({ _id: row!.boost._id, status: BoostStatus.ACTIVE }, { $inc: { spent: 5 } });
  });

  it("ne fait jamais payer plus que le budget restant", async () => {
    const [row] = world([{ boost: { goal: BoostGoal.VIEWS, reserved: 50_000, spent: 49_998 } }]);

    await sponsoredOffers(context(), NOW);

    expect(BoostMock.updateOne).toHaveBeenCalledWith({ _id: row!.boost._id, status: BoostStatus.ACTIVE }, { $inc: { spent: 2 } });
  });

  it("plafonne à 3 affichages par visiteur et par jour", async () => {
    const [row] = world([{}]);
    BoostExposureMock.find.mockReturnValue(mockQuery([{ boostId: row!.boost._id, count: 3 }]));

    expect(await sponsoredOffers(context(), NOW)).toEqual([]);
    expect(BoostExposureMock.find).toHaveBeenCalledWith({ boostId: { $in: [row!.boost._id] }, viewerKey: "user:abc", day: TODAY });
  });

  it("étale le budget du jour : à 14 h 30, la moitié au plus", async () => {
    const [row] = world([{ boost: { dailyBudget: 10_000 } }]);
    BoostStatMock.find.mockReturnValue(mockQuery([{ boostId: row!.boost._id, spent: 5_000 }]));
    expect(await sponsoredOffers(context(), NOW)).toEqual([]);

    BoostStatMock.find.mockReturnValue(mockQuery([{ boostId: row!.boost._id, spent: 4_999 }]));
    expect(await sponsoredOffers(context(), NOW)).toHaveLength(1);
  });

  it("écarte un boost au budget dépensé, une boutique suspendue ou privée de promotions", async () => {
    world([{ boost: { reserved: 10_000, spent: 10_000 } }]);
    expect(await sponsoredOffers(context(), NOW)).toEqual([]);

    world([{}]);
    shop.suspendedUntil = at(DAY);
    expect(await sponsoredOffers(context(), NOW)).toEqual([]);

    shop.suspendedUntil = null;
    shop.promotionsBlockedUntil = at(DAY);
    expect(await sponsoredOffers(context(), NOW)).toEqual([]);
  });

  it("ne lit que des offres en vente et en stock", async () => {
    world([{}]);

    await sponsoredOffers(context(), NOW);

    expect(PbMock.find.mock.calls[0]![0]).toMatchObject({ hiddenAt: null, stock: { $gt: 0 } });
  });

  it("donne au plus la moitié des places à une même boutique", async () => {
    // Accueil : 4 places, donc 2 par boutique au plus.
    world([{}, {}, {}]);

    const picked = await sponsoredOffers(context(), NOW);

    expect(SLOT_PLACES.home).toBe(4);
    expect(picked).toHaveLength(2);
    expect(BoostExposureMock.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it("remplit les places avec plusieurs boutiques", async () => {
    const other = makeShop();
    ShopMock.find.mockReturnValue(mockQuery([shop, other]));
    world([{}, {}, {}, { offer: { boutiqueId: other._id } }, { offer: { boutiqueId: other._id } }]);

    expect(await sponsoredOffers(context(), NOW)).toHaveLength(4);
  });

  describe("pertinence de la page", () => {
    it("recherche : seulement un produit qui correspond aux mots cherchés", async () => {
      const [ciment] = world([{ product: { name: "Ciment CPJ 42.5" } }, { product: { name: "Peinture blanche", description: "Pot de 20 L" } }]);

      const picked = await sponsoredOffers(context({ slot: "search", q: "ciment" }), NOW);

      expect(picked.map((entry) => entry.offer)).toEqual([ciment!.offer]);
      expect(await sponsoredOffers(context({ slot: "search", q: "  " }), NOW)).toEqual([]);
    });

    it("recherche : protège les caractères spéciaux des mots cherchés", async () => {
      world([{ product: { name: "Tube PVC (32 mm)" } }]);

      expect(await sponsoredOffers(context({ slot: "search", q: "(32" }), NOW)).toHaveLength(1);
    });

    it("catégorie : la sous-catégorie, la catégorie ou la famille de la page", async () => {
      const sousCategoryId = oid();
      const categoryId = oid();
      world([{ product: { sousCategoryId, categoryId } }]);

      expect(await sponsoredOffers(context({ slot: "category", sousCategoryId: String(sousCategoryId) }), NOW)).toHaveLength(1);
      expect(await sponsoredOffers(context({ slot: "category", categoryId: String(oid()) }), NOW)).toEqual([]);
      expect(await sponsoredOffers(context({ slot: "category", categoryId: String(categoryId) }), NOW)).toHaveLength(1);
      expect(await sponsoredOffers(context({ slot: "category" }), NOW)).toEqual([]);
    });

    it("produits similaires : même catégorie que la fiche consultée, jamais la fiche elle-même", async () => {
      const categoryId = oid();
      const viewedProduct = makeProduct({ categoryId });
      const viewedOffer = makeProductBoutique({ productId: viewedProduct._id });
      const [same, sameOffer] = world([{ product: { categoryId } }, { product: { categoryId } }]);
      PbMock.findById.mockReturnValue(mockQuery(viewedOffer));
      ProductMock.find.mockReturnValue(mockQuery([same!.product, sameOffer!.product, viewedProduct]));

      const picked = await sponsoredOffers(context({ slot: "similar", offerId: String(sameOffer!.offer._id) }), NOW);

      expect(picked.map((entry) => entry.offer)).toEqual([same!.offer]);
    });

    it("page Promotions : seulement les boosts de promotion dont l'offre affiche une remise", async () => {
      world([
        { boost: { kind: BoostKind.PROMOTION }, offer: { promo: { percent: 20 } } },
        { boost: { kind: BoostKind.PROMOTION }, offer: { promo: { percent: 0 } } },
      ]);

      const picked = await sponsoredOffers(context({ slot: "promotions" }), NOW);

      expect(BoostMock.find.mock.calls[0]![0]).toMatchObject({ kind: BoostKind.PROMOTION });
      expect(picked).toHaveLength(1);
      expect(picked[0]!.offer.promo!.percent).toBe(20);
    });
  });

  describe("audience personnalisée", () => {
    it("ne montre rien à un visiteur anonyme", async () => {
      world([{ boost: { audience: { ...makeBoost().audience, mode: "custom" } } }]);

      expect(await sponsoredOffers(context({ viewer: { key: "anon:x" } }), NOW)).toEqual([]);
    });

    it("montre le boost à un client de l'audience, pas aux autres", async () => {
      const inside = users(1)[0]!;
      UserMock.find.mockReturnValue(mockQuery([inside]));
      world([{ boost: { audience: { ...makeBoost().audience, mode: "custom" } } }]);
      expect(await sponsoredOffers(context({ viewer: { key: `user:${inside._id}`, userId: String(inside._id) } }), NOW)).toHaveLength(1);

      world([{ boost: { audience: { ...makeBoost().audience, mode: "custom" } } }]);
      expect(await sponsoredOffers(context({ viewer: { key: "user:autre", userId: String(oid()) } }), NOW)).toEqual([]);
    });
  });

  it("montre, pour un boost, son offre la plus remisée", async () => {
    const product = makeProduct();
    const plain = makeProductBoutique({ productId: product._id, boutiqueId: shop._id, promo: null });
    const discounted = makeProductBoutique({ productId: product._id, boutiqueId: shop._id, promo: { percent: 30 } });
    BoostMock.find.mockReturnValue(mockQuery([makeBoost({ boutiqueId: shop._id, productBoutiqueIds: [plain._id, discounted._id], endDate: at(DAY) })]));
    PbMock.find.mockReturnValue(mockQuery([plain, discounted]));
    ProductMock.find.mockReturnValue(mockQuery([product]));

    const [picked] = await sponsoredOffers(context(), NOW);

    expect(picked!.offer).toBe(discounted);
  });
});

// ─────────────────────────────────────────────
describe("recordBoostVisit", () => {
  let boost: ReturnType<typeof makeBoost>;
  const offerId = () => String(boost.productBoutiqueIds[0]);
  const visit = (over: Record<string, unknown> = {}) =>
    recordBoostVisit({ boostId: String(boost._id), offerId: offerId(), viewer: { key: "user:u1", userId: String(oid()) }, userAgent: "Mozilla/5.0", ...over } as any, NOW);

  beforeEach(() => {
    boost = makeBoost({ boutiqueId: shop._id, reserved: 50_000, spent: 0 });
    BoostMock.findById.mockReturnValue(mockQuery(boost));
  });

  it("compte et fait payer une visite pour l'objectif « visites »", async () => {
    expect(await visit()).toBe(true);

    expect(BoostVisitMock.create).toHaveBeenCalledWith(expect.objectContaining({ boostId: boost._id, viewerKey: "user:u1", day: TODAY }));
    expect(BoostStatMock.updateOne).toHaveBeenCalledWith({ boostId: boost._id, day: TODAY }, { $inc: { visits: 1, spent: 500 } }, { upsert: true });
    expect(BoostMock.updateOne).toHaveBeenCalledWith({ _id: boost._id, status: BoostStatus.ACTIVE }, { $inc: { spent: 500 } });
  });

  it("compte sans faire payer une visite pour l'objectif « vues »", async () => {
    boost.goal = BoostGoal.VIEWS;

    expect(await visit()).toBe(true);
    expect(BoostStatMock.updateOne).toHaveBeenCalledWith({ boostId: boost._id, day: TODAY }, { $inc: { visits: 1, spent: 0 } }, { upsert: true });
    expect(BoostMock.updateOne).not.toHaveBeenCalled();
  });

  it("ne fait payer que le budget restant", async () => {
    boost.spent = 49_800;

    await visit();

    expect(BoostMock.updateOne).toHaveBeenCalledWith({ _id: boost._id, status: BoostStatus.ACTIVE }, { $inc: { spent: 200 } });
  });

  it("ne compte qu'une visite par visiteur et par jour", async () => {
    BoostVisitMock.create.mockRejectedValueOnce(Object.assign(new Error("E11000 duplicate key"), { code: 11000 }));

    expect(await visit()).toBe(false);
    expect(BoostStatMock.updateOne).not.toHaveBeenCalled();
  });

  it.each([
    ["un robot", { userAgent: "Googlebot/2.1" }],
    ["un aperçu de lien", { userAgent: "Slackbot-LinkExpanding preview" }],
    ["l'administration", { viewerRole: EntityType.ADMIN }],
    ["un identifiant de boost invalide", { boostId: "boost-x" }],
  ])("ignore la visite d'%s", async (_label, over) => {
    expect(await visit(over)).toBe(false);
    expect(BoostVisitMock.create).not.toHaveBeenCalled();
  });

  it("ignore la visite du gérant de la boutique", async () => {
    const ownerId = String(shop.ownerId);

    expect(await visit({ viewer: { key: `user:${ownerId}`, userId: ownerId } })).toBe(false);
    expect(BoostVisitMock.create).not.toHaveBeenCalled();
  });

  it("ignore un boost arrêté ou une offre qu'il ne montre pas", async () => {
    boost.status = BoostStatus.PAUSED;
    expect(await visit()).toBe(false);

    boost.status = BoostStatus.ACTIVE;
    expect(await visit({ offerId: String(oid()) })).toBe(false);

    BoostMock.findById.mockReturnValueOnce(mockQuery(null));
    expect(await visit()).toBe(false);
  });

  it("compte la visite d'un visiteur anonyme, sans rattacher de compte", async () => {
    expect(await visit({ viewer: { key: "anon:abc" } })).toBe(true);

    expect(BoostVisitMock.create.mock.calls[0]![0]).toMatchObject({ viewerKey: "anon:abc", userId: null });
    expect(ShopMock.findById).not.toHaveBeenCalled();
  });
});

describe("attribution des ventes", () => {
  it("rattache un achat au boost dont une visite l'a précédé dans les 7 jours", async () => {
    const boostId = oid();
    const query = mockQuery({ boostId });
    BoostVisitMock.findOne.mockReturnValue(query);
    const userId = oid();
    const offerId = oid();
    const session = mockSession() as any;

    expect(await attributedBoost(String(userId), String(offerId), NOW, session)).toBe(boostId);

    expect(BoostVisitMock.findOne).toHaveBeenCalledWith({ userId, productBoutiqueId: offerId, createdAt: { $gte: at(-7 * DAY) } });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(query.session).toHaveBeenCalledWith(session);
  });

  it("ne rattache rien sans visite récente", async () => {
    expect(await attributedBoost(String(oid()), String(oid()), NOW)).toBeNull();
  });

  it("compte une commande et son chiffre d'affaires par boost qui l'a amenée", async () => {
    const a = oid();
    const b = oid();

    await recordBoostSales(
      [
        { boostId: a, price: 10_000, quantity: 2 },
        { boostId: a, price: 5_000, quantity: 1 },
        { boostId: b, price: 1_000, quantity: 3 },
        { boostId: null, price: 99_000, quantity: 1 },
      ],
      NOW
    );

    expect(BoostStatMock.updateOne).toHaveBeenCalledTimes(2);
    expect(BoostStatMock.updateOne).toHaveBeenCalledWith({ boostId: a, day: TODAY }, { $inc: { orders: 1, revenue: 25_000 } }, { upsert: true });
    expect(BoostStatMock.updateOne).toHaveBeenCalledWith({ boostId: b, day: TODAY }, { $inc: { orders: 1, revenue: 3_000 } }, { upsert: true });
  });

  it("compte un ajout au panier après une visite du boost", async () => {
    const boostId = oid();
    BoostVisitMock.findOne.mockReturnValueOnce(mockQuery({ boostId }));

    await recordBoostCartAdd(String(oid()), String(oid()), NOW);
    expect(BoostStatMock.updateOne).toHaveBeenCalledWith({ boostId, day: TODAY }, { $inc: { carts: 1 } }, { upsert: true });

    await recordBoostCartAdd(String(oid()), String(oid()), NOW);
    expect(BoostStatMock.updateOne).toHaveBeenCalledTimes(1);
  });
});

describe("boostTotals", () => {
  it("additionne les statistiques de chaque boost", async () => {
    const id = oid();
    BoostStatMock.aggregate.mockResolvedValueOnce([{ _id: id, impressions: 900, reach: 300, visits: 27, carts: 4, orders: 2, revenue: 70_000, spent: 13_500 }]);

    const totals = await boostTotals([String(id)]);

    expect(totals.get(String(id))).toEqual({ impressions: 900, reach: 300, visits: 27, carts: 4, orders: 2, revenue: 70_000, spent: 13_500 });
    expect(BoostStatMock.aggregate.mock.calls[0]![0][0]).toEqual({ $match: { boostId: { $in: [id] } } });
  });
});

// ─────────────────────────────────────────────
//  Régression corrigée (boost.service.ts, finishBoost) : la garde « déjà terminé » lit le
//  document en mémoire. Deux arrêts simultanés du même boost (clic « Arrêter »
//  pendant le tour du planificateur, ou deux clics) chargent chacun le boost
//  « en cours » et rendent chacun le budget : crédits versés deux fois. Un
//  passage conditionnel en base (findOneAndUpdate / updateOne sur
//  status ∈ {active, paused}) n'en laisserait passer qu'un. Les simulations
//  ci-dessous acceptent ce correctif : la première écriture conditionnelle
//  réussit, la suivante ne trouve plus rien.
// ─────────────────────────────────────────────
describe("régressions — arrêts simultanés d'un boost", () => {
  it("ne rend le budget qu'une fois quand deux arrêts arrivent en même temps", async () => {
    const id = oid();
    const first = makeBoost({ _id: id, boutiqueId: shop._id, reserved: 50_000, spent: 10_000 });
    const second = makeBoost({ _id: id, boutiqueId: shop._id, reserved: 50_000, spent: 10_000 });
    BoostMock.findOneAndUpdate.mockReturnValueOnce(mockQuery(first)).mockReturnValue(mockQuery(null));
    BoostMock.updateOne.mockReturnValueOnce(mockQuery({ modifiedCount: 1 })).mockReturnValue(mockQuery({ modifiedCount: 0 }));

    await Promise.all([finishBoost(first, BoostStatus.STOPPED, "Arrêté par la boutique.", NOW), finishBoost(second, BoostStatus.ENDED, "Durée écoulée.", NOW)]);

    const refunds = ShopMock.findOneAndUpdate.mock.calls.filter(([, update]: any[]) => update.$inc.boostCredits > 0);
    expect(refunds).toHaveLength(1);
  });
});
