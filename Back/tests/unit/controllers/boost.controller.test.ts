import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/models/boost.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/boost.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, Boost: mockModel(), BoostStat: mockModel(), BoostExposure: mockModel(), BoostVisit: mockModel() };
});

vi.mock("../../../src/models/credit.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/credit.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, CreditLedger: mockModel(), CreditPurchase: mockModel(), PlatformSetting: mockModel() };
});

vi.mock("../../../src/models/promotion.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/promotion.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, Promotion: mockModel() };
});

vi.mock("../../../src/models/product.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Product: mockModel(), productBoutique: mockModel() };
});

vi.mock("../../../src/shared/helpers/productBoutique.helper.js", () => ({
  enrichProductBoutiques: vi.fn(async (items: { _id: unknown }[]) => items.map((item) => ({ id: String(item._id), boutique: { nom: "Boutique Kaloum" } }))),
}));

vi.mock("../../../src/shared/payment/payment.provider.js", () => ({
  getPaymentProvider: vi.fn(() => null),
  isSandboxPayment: vi.fn(() => false),
}));

// Le service a ses propres tests : ici, les codes HTTP et les réponses. Constantes et calculs purs réels.
vi.mock("../../../src/shared/services/boost.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/shared/services/boost.service.js")>();
  return {
    ...actual,
    applyBoostAction: vi.fn(),
    boostTotals: vi.fn(async () => new Map()),
    createBoost: vi.fn(),
    estimateBoost: vi.fn(),
    getBoostSettings: vi.fn(async () => actual.DEFAULT_BOOST_SETTINGS),
    managedBoost: vi.fn(),
    moveCredits: vi.fn(async () => 0),
    sponsoredOffers: vi.fn(async () => []),
    updateBoostSettings: vi.fn(),
  };
});

vi.mock("../../../src/shared/services/promotion.service.js", () => ({
  managedShop: vi.fn(),
  promotionContext: vi.fn(),
}));

vi.mock("express-validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("express-validator")>();
  return {
    ...actual,
    validationResult: vi.fn(() => ({ isEmpty: () => true, array: () => [] })),
  };
});

import { Types } from "mongoose";
import { validationResult } from "express-validator";
import { Boost, BoostGoal, BoostKind, BoostStat, BoostStatus } from "../../../src/models/boost.model.js";
import { CreditLedger, CreditPurchase, CreditPurchaseStatus, CreditReason } from "../../../src/models/credit.model.js";
import { Promotion } from "../../../src/models/promotion.model.js";
import { HttpError } from "../../../src/shared/middlewares/error.middleware.js";
import { getPaymentProvider, isSandboxPayment } from "../../../src/shared/payment/payment.provider.js";
import { enrichProductBoutiques } from "../../../src/shared/helpers/productBoutique.helper.js";
import {
  applyBoostAction,
  boostTotals,
  createBoost,
  DEFAULT_BOOST_SETTINGS,
  estimateBoost,
  getBoostSettings,
  managedBoost,
  moveCredits,
  sponsoredOffers,
  updateBoostSettings,
} from "../../../src/shared/services/boost.service.js";
import { managedShop } from "../../../src/shared/services/promotion.service.js";
import {
  boostActionHandler,
  createBoostHandler,
  creditsOfShop,
  estimateBoostHandler,
  getBoostHandler,
  getBoostSettingsHandler,
  getCreditPurchase,
  listAllBoosts,
  listBoostsOfShop,
  rechargeCredits,
  settleSandboxCredits,
  sponsoredHandler,
  updateBoostSettingsHandler,
} from "../../../src/controllers/boost.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockExpressSession, mockRequest, mockResponse } from "../../helpers/express.mock.js";
import { makeBoost, makeProductBoutique, makeShop, makeShopPromotion, oid } from "../../helpers/factories.js";

const BoostMock = Boost as unknown as Record<string, any>;
const BoostStatMock = BoostStat as unknown as Record<string, any>;
const LedgerMock = CreditLedger as unknown as Record<string, any>;
const PurchaseMock = CreditPurchase as unknown as Record<string, any>;
const PromotionMock = Promotion as unknown as Record<string, any>;

const SELLER = { id: oid().toString(), entityType: "shop" };
let shop: ReturnType<typeof makeShop>;

beforeEach(() => {
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);
  shop = makeShop({ nom: "Boutique Kaloum", boostCredits: 120_000 });
  vi.mocked(managedShop).mockResolvedValue(shop);
  vi.mocked(boostTotals).mockResolvedValue(new Map());
  vi.mocked(getBoostSettings).mockResolvedValue(DEFAULT_BOOST_SETTINGS);
  vi.mocked(sponsoredOffers).mockResolvedValue([]);
  vi.mocked(getPaymentProvider).mockReturnValue(null);
  vi.mocked(isSandboxPayment).mockReturnValue(false);
  BoostMock.find.mockReturnValue(mockQuery([]));
  BoostMock.countDocuments.mockReturnValue(mockQuery(0));
  BoostStatMock.find.mockReturnValue(mockQuery([]));
  PromotionMock.find.mockReturnValue(mockQuery([]));
  LedgerMock.find.mockReturnValue(mockQuery([]));
  PurchaseMock.findOne.mockReturnValue(mockQuery(null));
  PurchaseMock.create.mockImplementation(async (doc: any) => {
    const purchase: any = { _id: oid(), status: CreditPurchaseStatus.PENDING, ...doc };
    purchase.save = vi.fn().mockResolvedValue(purchase);
    return purchase;
  });
});

const failValidation = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({ isEmpty: () => false, array: () => messages.map((msg) => ({ msg })) } as any);
};

// ─────────────────────────────────────────────
describe("estimateBoostHandler", () => {
  it("convertit le formulaire et renvoie l'estimation", async () => {
    const estimate = { audienceSize: 500, totalBudget: 30_000 } as any;
    vi.mocked(estimateBoost).mockResolvedValueOnce(estimate);
    const offerId = String(oid());
    const res = mockResponse();

    await estimateBoostHandler(
      mockRequest({
        params: { id: String(shop._id) },
        body: { kind: BoostKind.PRODUCT, productBoutiqueIds: [offerId], dailyBudget: "10000", days: "3", goal: BoostGoal.VIEWS, audience: { mode: "custom", villes: ["Kindia"] } },
        user: SELLER,
      }),
      res
    );

    expect(estimateBoost).toHaveBeenCalledWith(SELLER, String(shop._id), {
      kind: BoostKind.PRODUCT,
      promotionId: undefined,
      productBoutiqueIds: [offerId],
      goal: BoostGoal.VIEWS,
      audience: { mode: "custom", villes: ["Kindia"] },
      dailyBudget: 10_000,
      days: 3,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toBe(estimate);
  });

  it("renvoie 422 quand le formulaire est invalide", async () => {
    failValidation(["Un boost dure de 1 à 30 jours."]);
    const res = mockResponse();

    await estimateBoostHandler(mockRequest({ params: { id: String(shop._id) }, body: {}, user: SELLER }), res);

    expect(res.statusCode).toBe(422);
    expect(estimateBoost).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("createBoostHandler", () => {
  it("lance le boost et renvoie son détail en 201", async () => {
    const offer = makeProductBoutique({ boutiqueId: shop._id });
    const promo = makeShopPromotion({ boutiqueId: shop._id, nom: "Remise d'octobre" });
    const boost = makeBoost({ boutiqueId: shop._id, kind: BoostKind.PROMOTION, promotionId: promo._id, productBoutiqueIds: [offer._id], reserved: 30_000, spent: 0 });
    vi.mocked(createBoost).mockResolvedValueOnce(boost);
    PromotionMock.find.mockReturnValue(mockQuery([promo]));
    const res = mockResponse();

    await createBoostHandler(
      mockRequest({ params: { id: String(shop._id) }, body: { kind: BoostKind.PROMOTION, promotionId: String(promo._id), dailyBudget: 10_000, days: 3 }, user: SELLER }),
      res
    );

    expect(createBoost).toHaveBeenCalledWith(SELLER, String(shop._id), expect.objectContaining({ kind: BoostKind.PROMOTION, promotionId: String(promo._id), productBoutiqueIds: undefined }));
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe("Boost lancé : vos produits sont mis en avant.");
    expect(res.body.data).toMatchObject({
      id: String(boost._id),
      kind: BoostKind.PROMOTION,
      kindLabel: "Boost de promotion",
      promotion: { id: String(promo._id), nom: "Remise d'octobre", endDate: promo.endDate },
      reserved: 30_000,
      remaining: 30_000,
      status: BoostStatus.ACTIVE,
      statusLabel: "En cours",
      availableActions: ["pause", "stop"],
      totals: { impressions: 0, visits: 0, visitRate: 0, costPerSale: null },
    });
  });

  it("garde le code d'un refus (crédits insuffisants)", async () => {
    vi.mocked(createBoost).mockRejectedValueOnce(new HttpError("Crédits insuffisants : rechargez votre portefeuille.", 400));
    const res = mockResponse();

    await createBoostHandler(mockRequest({ params: { id: String(shop._id) }, body: { kind: BoostKind.PRODUCT }, user: SELLER }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Crédits insuffisants : rechargez votre portefeuille.");
  });
});

// ─────────────────────────────────────────────
describe("listBoostsOfShop", () => {
  it("liste les boosts en cours, avec leurs totaux et les compteurs d'onglets", async () => {
    const boost = makeBoost({ boutiqueId: shop._id, spent: 4_500.6 });
    const query = mockQuery([boost]);
    BoostMock.find.mockReturnValue(query);
    BoostMock.countDocuments.mockReturnValueOnce(mockQuery(1)).mockReturnValueOnce(mockQuery(1)).mockReturnValueOnce(mockQuery(6));
    vi.mocked(boostTotals).mockResolvedValueOnce(
      new Map([[String(boost._id), { impressions: 1_000, reach: 400, visits: 25, carts: 3, orders: 2, revenue: 80_000, spent: 4_500.6 }]])
    );
    const res = mockResponse();

    await listBoostsOfShop(mockRequest({ params: { id: String(shop._id) }, user: SELLER }), res);

    expect(BoostMock.find).toHaveBeenCalledWith({ boutiqueId: shop._id, status: { $in: [BoostStatus.ACTIVE, BoostStatus.PAUSED] } });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(res.body.data).toMatchObject({ total: 1, page: 1, totalPages: 1, counts: { active: 1, ended: 6 } });
    expect(res.body.data.boosts[0]).toMatchObject({ spent: 4_501, totals: { spent: 4_501, visitRate: 2.5, costPerSale: 2_250 } });
  });

  it("lit l'onglet des boosts terminés", async () => {
    await listBoostsOfShop(mockRequest({ params: { id: String(shop._id) }, query: { tab: "ended" }, user: SELLER }), mockResponse());

    expect(BoostMock.find).toHaveBeenCalledWith({ boutiqueId: shop._id, status: { $in: [BoostStatus.ENDED, BoostStatus.STOPPED] } });
  });

  it("refuse la boutique d'un autre vendeur", async () => {
    vi.mocked(managedShop).mockRejectedValueOnce(new HttpError("Vous ne pouvez gérer que vos propres boutiques.", 403));
    const res = mockResponse();

    await listBoostsOfShop(mockRequest({ params: { id: String(oid()) }, user: SELLER }), res);

    expect(res.statusCode).toBe(403);
  });
});

describe("getBoostHandler", () => {
  it("renvoie un boost et ses statistiques jour par jour", async () => {
    const boost = makeBoost({ boutiqueId: shop._id, status: BoostStatus.STOPPED, refunded: 20_000 });
    vi.mocked(managedBoost).mockResolvedValueOnce(boost);
    const query = mockQuery([
      { boostId: boost._id, day: "2026-10-24", impressions: 300, reach: 120, visits: 9, carts: 1, orders: 0, revenue: 0, spent: 4_500.4 },
      { boostId: oid(), day: "2026-10-24", impressions: 1, reach: 1, visits: 0, carts: 0, orders: 0, revenue: 0, spent: 0 },
    ]);
    BoostStatMock.find.mockReturnValue(query);
    const res = mockResponse();

    await getBoostHandler(mockRequest({ params: { id: String(boost._id) }, user: SELLER }), res);

    expect(query.sort).toHaveBeenCalledWith({ day: 1 });
    expect(res.body.data.daily).toEqual([{ day: "2026-10-24", impressions: 300, reach: 120, visits: 9, carts: 1, orders: 0, revenue: 0, spent: 4_500 }]);
    // Un boost terminé n'a plus de budget restant ni d'action.
    expect(res.body.data).toMatchObject({ remaining: 0, refunded: 20_000, availableActions: [] });
  });

  it("renvoie 404 pour un boost introuvable", async () => {
    vi.mocked(managedBoost).mockRejectedValueOnce(new HttpError("Boost introuvable.", 404));
    const res = mockResponse();

    await getBoostHandler(mockRequest({ params: { id: "x" }, user: SELLER }), res);

    expect(res.statusCode).toBe(404);
  });
});

describe("boostActionHandler", () => {
  it("renvoie 404 pour une action inconnue", async () => {
    const res = mockResponse();

    await boostActionHandler(mockRequest({ params: { id: String(oid()), action: "delete" }, user: SELLER }), res);

    expect(res.statusCode).toBe(404);
    expect(applyBoostAction).not.toHaveBeenCalled();
  });

  it.each([
    ["pause", BoostStatus.PAUSED, "Boost en pause : vos produits ne sont plus montrés.", ["resume", "stop"]],
    ["resume", BoostStatus.ACTIVE, "Boost repris.", ["pause", "stop"]],
    ["stop", BoostStatus.STOPPED, "Boost arrêté : le budget non dépensé est rendu en crédits.", []],
  ])("applique %s", async (action, status, message, actions) => {
    const boost = makeBoost({ status });
    vi.mocked(applyBoostAction).mockResolvedValueOnce(boost);
    const res = mockResponse();

    await boostActionHandler(mockRequest({ params: { id: String(boost._id), action }, user: SELLER }), res);

    expect(applyBoostAction).toHaveBeenCalledWith(SELLER, String(boost._id), action);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe(message);
    expect(res.body.data.availableActions).toEqual(actions);
  });

  it("garde le code d'un refus", async () => {
    vi.mocked(applyBoostAction).mockRejectedValueOnce(new HttpError("Ce boost est déjà terminé.", 400));
    const res = mockResponse();

    await boostActionHandler(mockRequest({ params: { id: String(oid()), action: "stop" }, user: SELLER }), res);

    expect(res.statusCode).toBe(400);
  });
});

// ─────────────────────────────────────────────
describe("crédits", () => {
  it("renvoie le solde, les prix en vigueur et les derniers mouvements", async () => {
    const row = { _id: oid(), delta: -30_000, balanceAfter: 120_000, reason: CreditReason.BOOST_RESERVE, label: "Boost de 3 jours", createdAt: new Date() };
    const query = mockQuery([row]);
    LedgerMock.find.mockReturnValue(query);
    const res = mockResponse();

    await creditsOfShop(mockRequest({ params: { id: String(shop._id) }, user: SELLER }), res);

    expect(LedgerMock.find).toHaveBeenCalledWith({ boutiqueId: shop._id });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(query.limit).toHaveBeenCalledWith(50);
    expect(res.body.data).toEqual({
      balance: 120_000,
      settings: { costPerVisit: 500, costPerThousandViews: 5_000, monthlyCredits: 50_000, minDailyBudget: 10_000, minAudience: DEFAULT_BOOST_SETTINGS.minAudience },
      ledger: [{ id: String(row._id), delta: -30_000, balanceAfter: 120_000, reason: CreditReason.BOOST_RESERVE, label: "Boost de 3 jours", createdAt: row.createdAt }],
    });
  });

  describe("rechargeCredits", () => {
    it("refuse en 400 sans prestataire de paiement", async () => {
      const res = mockResponse();

      await rechargeCredits(mockRequest({ params: { id: String(shop._id) }, body: { amount: 50_000 }, user: SELLER }), res);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe("Le paiement en ligne n'est pas encore disponible.");
      expect(PurchaseMock.create).not.toHaveBeenCalled();
    });

    it("ouvre une recharge chez le prestataire et renvoie où payer", async () => {
      const initiate = vi.fn(async () => ({ providerRef: "PAY-42", redirectUrl: "http://localhost/paiement/42" }));
      vi.mocked(getPaymentProvider).mockReturnValue({ name: "sandbox", initiate } as any);
      const res = mockResponse();

      await rechargeCredits(mockRequest({ params: { id: String(shop._id) }, body: { amount: "50000.4" }, user: SELLER }), res);

      const doc = PurchaseMock.create.mock.calls[0]![0];
      expect(doc).toEqual({ boutiqueId: shop._id, amount: 50_000, createdBy: new Types.ObjectId(SELLER.id) });
      const purchase = await PurchaseMock.create.mock.results[0]!.value;
      expect(initiate).toHaveBeenCalledWith({
        orderId: `credits-${String(shop._id)}-${String(purchase._id)}`,
        reference: `CRD-${String(purchase._id).slice(-8)}`,
        amount: 50_000,
      });
      expect(purchase.providerRef).toBe("PAY-42");
      expect(purchase.save).toHaveBeenCalled();
      expect(res.statusCode).toBe(201);
      expect(res.body.data).toEqual({ purchaseId: String(purchase._id), amount: 50_000, status: CreditPurchaseStatus.PENDING, redirectUrl: "http://localhost/paiement/42" });
      // Rien n'est crédité avant le paiement.
      expect(moveCredits).not.toHaveBeenCalled();
    });
  });

  describe("getCreditPurchase", () => {
    it("renvoie une recharge de la boutique", async () => {
      const purchase = { _id: oid(), amount: 50_000, status: CreditPurchaseStatus.PAID };
      PurchaseMock.findOne.mockReturnValue(mockQuery(purchase));
      const res = mockResponse();

      await getCreditPurchase(mockRequest({ params: { id: String(shop._id), purchaseId: String(purchase._id) }, user: SELLER }), res);

      expect(PurchaseMock.findOne).toHaveBeenCalledWith({ _id: String(purchase._id), boutiqueId: shop._id });
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toEqual({ purchaseId: String(purchase._id), amount: 50_000, status: CreditPurchaseStatus.PAID });
    });

    it("renvoie 404 pour un identifiant invalide, sans rien lire", async () => {
      const res = mockResponse();

      await getCreditPurchase(mockRequest({ params: { id: String(shop._id), purchaseId: "pas-un-id" }, user: SELLER }), res);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe("Recharge introuvable.");
      expect(PurchaseMock.findOne).not.toHaveBeenCalled();
    });

    it("renvoie 404 pour la recharge d'une autre boutique", async () => {
      const res = mockResponse();

      await getCreditPurchase(mockRequest({ params: { id: String(shop._id), purchaseId: String(oid()) }, user: SELLER }), res);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe("Recharge introuvable.");
    });

    it("refuse la boutique d'un autre vendeur", async () => {
      vi.mocked(managedShop).mockRejectedValueOnce(new HttpError("Vous ne pouvez gérer que vos propres boutiques.", 403));
      const res = mockResponse();

      await getCreditPurchase(mockRequest({ params: { id: String(oid()), purchaseId: String(oid()) }, user: SELLER }), res);

      expect(res.statusCode).toBe(403);
    });
  });

  describe("settleSandboxCredits", () => {
    const pending = (over: Record<string, unknown> = {}) => {
      const purchase: any = { _id: oid(), amount: 50_000, status: CreditPurchaseStatus.PENDING, paidAt: null, ...over };
      purchase.save = vi.fn().mockResolvedValue(purchase);
      PurchaseMock.findOne.mockReturnValue(mockQuery(purchase));
      return purchase;
    };
    const settle = async (outcome: string, purchaseId = String(oid())) => {
      const res = mockResponse();
      await settleSandboxCredits(mockRequest({ params: { id: String(shop._id), purchaseId }, body: { outcome }, user: SELLER }), res);
      return res;
    };

    it("n'existe pas hors bac à sable", async () => {
      pending();

      const res = await settle("paid");

      expect(res.statusCode).toBe(404);
      expect(moveCredits).not.toHaveBeenCalled();
    });

    it("crédite le portefeuille quand le paiement simulé réussit", async () => {
      vi.mocked(isSandboxPayment).mockReturnValue(true);
      const purchase = pending();
      vi.mocked(managedShop).mockResolvedValueOnce(shop).mockResolvedValueOnce(makeShop({ _id: shop._id, boostCredits: 170_000 }));

      const res = await settle("paid", String(purchase._id));

      expect(purchase.status).toBe(CreditPurchaseStatus.PAID);
      expect(purchase.paidAt).toBeInstanceOf(Date);
      expect(moveCredits).toHaveBeenCalledWith(shop._id, 50_000, CreditReason.RECHARGE, "Recharge par mobile money", String(purchase._id));
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe("Crédits ajoutés à votre portefeuille.");
      expect(res.body.data).toEqual({ purchaseId: String(purchase._id), status: CreditPurchaseStatus.PAID, balance: 170_000 });
    });

    it("ne crédite rien quand le paiement simulé échoue", async () => {
      vi.mocked(isSandboxPayment).mockReturnValue(true);
      const purchase = pending();

      const res = await settle("failed");

      expect(purchase.status).toBe(CreditPurchaseStatus.FAILED);
      expect(moveCredits).not.toHaveBeenCalled();
      expect(res.body.message).toBe("Paiement refusé : aucun crédit ajouté.");
    });

    it("refuse en 409 une recharge déjà réglée, en 404 une recharge introuvable", async () => {
      vi.mocked(isSandboxPayment).mockReturnValue(true);
      pending({ status: CreditPurchaseStatus.PAID });
      expect((await settle("paid")).statusCode).toBe(409);

      PurchaseMock.findOne.mockReturnValue(mockQuery(null));
      expect((await settle("paid")).statusCode).toBe(404);
      expect(moveCredits).not.toHaveBeenCalled();
    });
  });
});

// ─────────────────────────────────────────────
describe("sponsoredHandler", () => {
  it("refuse un emplacement inconnu", async () => {
    const res = mockResponse();

    await sponsoredHandler(mockRequest({ query: { slot: "sidebar" } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Emplacement inconnu.");
  });

  it("choisit les offres de la page pour ce visiteur et dit pourquoi elles sont montrées", async () => {
    const userId = oid().toString();
    const offer = makeProductBoutique();
    const boost = makeBoost({ kind: BoostKind.PRODUCT, audience: { ...makeBoost().audience, mode: "custom", communes: ["Ratoma"], villes: ["Conakry"] } });
    vi.mocked(sponsoredOffers).mockResolvedValueOnce([{ offer, boost }]);
    const res = mockResponse();

    await sponsoredHandler(
      mockRequest({ query: { slot: "search", q: "ciment", categoryId: ["a", "b"] }, session: mockExpressSession({ id: userId, entityType: "user" }) }),
      res
    );

    expect(sponsoredOffers).toHaveBeenCalledWith({
      slot: "search",
      viewer: { key: `user:${userId}`, userId },
      q: "ciment",
      familleId: undefined,
      categoryId: undefined,
      sousCategoryId: undefined,
      offerId: undefined,
    });
    expect(enrichProductBoutiques).toHaveBeenCalledWith([offer]);
    expect(res.body.data).toEqual([
      {
        id: String(offer._id),
        boutique: { nom: "Boutique Kaloum" },
        sponsored: {
          boostId: String(boost._id),
          kind: BoostKind.PRODUCT,
          why: "Boutique Kaloum paie pour montrer ce produit aux clients intéressés par ce type d'article, à Ratoma, Conakry.",
        },
      },
    ]);
  });

  it("vise l'accueil par défaut, avec une empreinte anonyme pour un visiteur non connecté", async () => {
    const req = mockRequest();
    (req as any).ip = "10.0.0.1";
    (req as any).get = () => "Mozilla/5.0";

    await sponsoredHandler(req, mockResponse());

    const context = vi.mocked(sponsoredOffers).mock.calls[0]![0];
    expect(context.slot).toBe("home");
    expect(context.viewer.key).toMatch(/^anon:[0-9a-f]{32}$/);
    expect(context.viewer.userId).toBeUndefined();
  });

  it("n'évoque pas de zone pour une audience automatique", async () => {
    vi.mocked(sponsoredOffers).mockResolvedValueOnce([{ offer: makeProductBoutique(), boost: makeBoost() }]);
    const res = mockResponse();

    await sponsoredHandler(mockRequest({ query: { slot: "home" } }), res);

    expect(res.body.data[0].sponsored.why).toBe("Boutique Kaloum paie pour montrer ce produit aux clients intéressés par ce type d'article.");
  });
});

// ─────────────────────────────────────────────
describe("administration des boosts", () => {
  it("liste par défaut les boosts en cours ou en pause, ou ceux de l'état demandé", async () => {
    await listAllBoosts(mockRequest(), mockResponse());
    expect(BoostMock.find).toHaveBeenLastCalledWith({ status: { $in: [BoostStatus.ACTIVE, BoostStatus.PAUSED] } });

    await listAllBoosts(mockRequest({ query: { status: BoostStatus.STOPPED } }), mockResponse());
    expect(BoostMock.find).toHaveBeenLastCalledWith({ status: { $in: [BoostStatus.STOPPED] } });

    await listAllBoosts(mockRequest({ query: { status: "bogus" } }), mockResponse());
    expect(BoostMock.find).toHaveBeenLastCalledWith({ status: { $in: [BoostStatus.ACTIVE, BoostStatus.PAUSED] } });
  });

  it("renvoie les réglages avec le budget minimum", async () => {
    const res = mockResponse();

    await getBoostSettingsHandler(mockRequest(), res);

    expect(res.body.data).toEqual({ ...DEFAULT_BOOST_SETTINGS, minDailyBudget: 10_000 });
  });

  it("enregistre les nouveaux prix", async () => {
    vi.mocked(updateBoostSettings).mockResolvedValueOnce({ ...DEFAULT_BOOST_SETTINGS, costPerVisit: 800 });
    const res = mockResponse();

    await updateBoostSettingsHandler(mockRequest({ body: { costPerVisit: 800, minAudience: 1 } }), res);

    // L'audience minimale ne se règle pas depuis l'API.
    expect(updateBoostSettings).toHaveBeenCalledWith({ costPerVisit: 800, costPerThousandViews: undefined, monthlyCredits: undefined, minVisitsPerDay: undefined });
    expect(res.body.data.minDailyBudget).toBe(16_000);
    expect(res.body.message).toBe("Réglages enregistrés : ils valent pour les prochains boosts.");
  });

  it("renvoie 422 pour des réglages invalides", async () => {
    failValidation(["Invalid value"]);
    const res = mockResponse();

    await updateBoostSettingsHandler(mockRequest({ body: { costPerVisit: -1 } }), res);

    expect(res.statusCode).toBe(422);
    expect(updateBoostSettings).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
//  Régression corrigée (boost.controller.ts, settleSandboxCredits) : la recharge est lue
//  « en attente », marquée payée puis créditée, sans écriture conditionnelle.
//  Deux règlements simultanés (double envoi du formulaire, notification
//  rejouée) créditent deux fois. Un passage conditionnel
//  (findOneAndUpdate / updateOne sur status = pending) n'en laisserait passer
//  qu'un ; les simulations acceptent ce correctif.
// ─────────────────────────────────────────────
describe("régressions — règlements simultanés d'une recharge", () => {
  it("ne crédite qu'une fois une recharge réglée deux fois en même temps", async () => {
    vi.mocked(isSandboxPayment).mockReturnValue(true);
    const id = oid();
    const copy = () => {
      const purchase: any = { _id: id, amount: 50_000, status: CreditPurchaseStatus.PENDING, paidAt: null };
      purchase.save = vi.fn().mockResolvedValue(purchase);
      return purchase;
    };
    PurchaseMock.findOne.mockReturnValueOnce(mockQuery(copy())).mockReturnValueOnce(mockQuery(copy()));
    PurchaseMock.findOneAndUpdate.mockReturnValueOnce(mockQuery(copy())).mockReturnValue(mockQuery(null));
    PurchaseMock.updateOne.mockReturnValueOnce(mockQuery({ modifiedCount: 1 })).mockReturnValue(mockQuery({ modifiedCount: 0 }));
    const settle = () =>
      settleSandboxCredits(mockRequest({ params: { id: String(shop._id), purchaseId: String(id) }, body: { outcome: "paid" }, user: SELLER }), mockResponse());

    await Promise.all([settle(), settle()]);

    expect(moveCredits).toHaveBeenCalledTimes(1);
  });
});
