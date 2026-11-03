import { describe, it, expect, vi, beforeEach } from "vitest";

// Les écritures et les règles sont testées dans promotion.service : ici, les codes HTTP et les réponses.
vi.mock("../../../src/shared/services/promotion.service.js", () => ({
  applyPromotionAction: vi.fn(),
  createShopPromotion: vi.fn(),
  listShopPromotions: vi.fn(),
  managedPromotion: vi.fn(),
  managedShop: vi.fn(),
  promotionStats: vi.fn(),
  updateShopPromotion: vi.fn(),
}));

// Résumé des offres (nom, prix, photo) lu dans les modèles simulés.
vi.mock("../../../src/models/product.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Product: mockModel(), productBoutique: mockModel() };
});

vi.mock("express-validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("express-validator")>();
  return {
    ...actual,
    validationResult: vi.fn(() => ({ isEmpty: () => true, array: () => [] })),
  };
});

import { validationResult } from "express-validator";
import { Product, productBoutique } from "../../../src/models/product.model.js";
import { PromotionStatus, PromotionType } from "../../../src/models/promotion.model.js";
import { HttpError } from "../../../src/shared/middlewares/error.middleware.js";
import {
  applyPromotionAction,
  createShopPromotion,
  listShopPromotions,
  managedPromotion,
  managedShop,
  promotionStats,
  updateShopPromotion,
} from "../../../src/shared/services/promotion.service.js";
import {
  createPromotionOfShop,
  getPromotionOfShop,
  listPromotionsOfShop,
  promotionActionOfShop,
  updatePromotionOfShop,
} from "../../../src/controllers/shopPromotion.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse } from "../../helpers/express.mock.js";
import { makeProduct, makeProductBoutique, makeShop, makeShopPromotion, oid } from "../../helpers/factories.js";

const PbMock = productBoutique as unknown as Record<string, any>;
const ProductMock = Product as unknown as Record<string, any>;

const SELLER = { id: oid().toString(), entityType: "shop" };
const DAY = 24 * 3600 * 1000;

let shop: ReturnType<typeof makeShop>;

beforeEach(() => {
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);
  shop = makeShop({ nom: "Boutique Kaloum", promotionsBlockedUntil: null });
  vi.mocked(managedShop).mockResolvedValue(shop);
  vi.mocked(promotionStats).mockImplementation(async (promos) => new Map(promos.map((promo) => [String(promo._id), { orders: 2, units: 3, revenue: 24_000, discount: 6_000 }])));
  PbMock.find.mockReturnValue(mockQuery([]));
  ProductMock.find.mockReturnValue(mockQuery([]));
});

const failValidation = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({ isEmpty: () => false, array: () => messages.map((msg) => ({ msg })) } as any);
};

/** Promotion en cours de la boutique, sur une offre au catalogue. */
const livePromotion = (over: Record<string, unknown> = {}) => {
  const product = makeProduct({ name: "Ciment CPJ 42.5" });
  const offer = makeProductBoutique({ boutiqueId: shop._id, productId: product._id, price: 95_000, urlImages: ["/uploads/images/ciment.jpg"] });
  PbMock.find.mockReturnValue(mockQuery([offer]));
  ProductMock.find.mockReturnValue(mockQuery([product]));
  const promo = makeShopPromotion({
    boutiqueId: shop._id,
    productBoutiqueIds: [offer._id],
    startDate: new Date(Date.now() - DAY),
    endDate: new Date(Date.now() + 5 * DAY),
    ...over,
  });
  return { promo, offer };
};

// ─────────────────────────────────────────────
describe("listPromotionsOfShop", () => {
  it("liste un onglet avec les offres, les ventes et les compteurs", async () => {
    const { promo, offer } = livePromotion();
    vi.mocked(listShopPromotions).mockResolvedValue({ items: [promo], total: 1, page: 1, totalPages: 1, counts: { active: 1, scheduled: 0, ended: 4 } });
    const res = mockResponse();

    await listPromotionsOfShop(mockRequest({ params: { id: String(shop._id) }, query: { tab: "active" }, user: SELLER }), res);

    expect(res.statusCode).toBe(200);
    expect(listShopPromotions).toHaveBeenCalledWith(shop._id, "active", 1, 20);
    const data = res.body.data;
    expect(data).toMatchObject({ total: 1, page: 1, totalPages: 1, counts: { active: 1, scheduled: 0, ended: 4 }, promotionsBlockedUntil: null });
    expect(data.promotions[0]).toMatchObject({
      id: String(promo._id),
      boutiqueId: String(shop._id),
      type: PromotionType.PRODUCT_DISCOUNT,
      typeLabel: "Remise produit",
      status: PromotionStatus.ACTIVE,
      statusLabel: "En cours",
      offers: [{ id: String(offer._id), name: "Ciment CPJ 42.5", price: 95_000, image: "/uploads/images/ciment.jpg" }],
      stats: { orders: 2, units: 3, revenue: 24_000, discount: 6_000 },
      availableActions: ["pause", "extend", "stop"],
    });
  });

  it("retombe sur l'onglet « en cours » pour un onglet inconnu, et lit la pagination", async () => {
    vi.mocked(listShopPromotions).mockResolvedValue({ items: [], total: 0, page: 2, totalPages: 0, counts: { active: 0, scheduled: 0, ended: 0 } });

    await listPromotionsOfShop(mockRequest({ params: { id: String(shop._id) }, query: { tab: "bogus", page: "2", limit: "500" }, user: SELLER }), mockResponse());

    expect(listShopPromotions).toHaveBeenCalledWith(shop._id, "active", 2, 50);
  });

  it("signale jusqu'à quand les promotions sont suspendues par la modération", async () => {
    const until = new Date(Date.now() + 7 * DAY);
    shop.promotionsBlockedUntil = until;
    vi.mocked(listShopPromotions).mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 0, counts: { active: 0, scheduled: 0, ended: 0 } });
    const res = mockResponse();

    await listPromotionsOfShop(mockRequest({ params: { id: String(shop._id) }, user: SELLER }), res);

    expect(res.body.data.promotionsBlockedUntil).toBe(until);
  });

  it("garde le code d'une erreur métier (boutique d'un autre vendeur)", async () => {
    vi.mocked(managedShop).mockRejectedValueOnce(new HttpError("Vous ne pouvez gérer que vos propres boutiques.", 403));
    const res = mockResponse();

    await listPromotionsOfShop(mockRequest({ params: { id: String(oid()) }, user: SELLER }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ success: false, message: "Vous ne pouvez gérer que vos propres boutiques." });
  });

  it("renvoie 500 sur une erreur inattendue", async () => {
    vi.mocked(listShopPromotions).mockRejectedValueOnce(new Error("réplique indisponible"));
    const res = mockResponse();

    await listPromotionsOfShop(mockRequest({ params: { id: String(shop._id) }, user: SELLER }), res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
describe("createPromotionOfShop", () => {
  const body = { type: PromotionType.PRODUCT_DISCOUNT, nom: "Remise d'octobre", discountValue: 20 };

  it("renvoie 422 sans rien créer quand le formulaire est invalide", async () => {
    failValidation(["Type invalide.", "Le nom fait de 2 à 80 caractères."]);
    const res = mockResponse();

    await createPromotionOfShop(mockRequest({ params: { id: String(shop._id) }, body, user: SELLER }), res);

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toBe("Type invalide. | Le nom fait de 2 à 80 caractères.");
    expect(createShopPromotion).not.toHaveBeenCalled();
  });

  it.each([
    [PromotionStatus.ACTIVE, "Promotion lancée : elle est en ligne."],
    [PromotionStatus.SCHEDULED, "Promotion programmée."],
    [PromotionStatus.DRAFT, "Brouillon enregistré."],
  ])("renvoie 201 pour une promotion %s", async (status, message) => {
    const { promo } = livePromotion({ status, ...(status === PromotionStatus.SCHEDULED ? { startDate: new Date(Date.now() + DAY) } : {}) });
    vi.mocked(createShopPromotion).mockResolvedValueOnce(promo);
    const res = mockResponse();

    await createPromotionOfShop(mockRequest({ params: { id: String(shop._id) }, body, user: SELLER }), res);

    expect(createShopPromotion).toHaveBeenCalledWith(SELLER, String(shop._id), body);
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe(message);
    expect(res.body.data).toMatchObject({ id: String(promo._id), status });
  });

  it("renvoie le motif d'un refus des règles en 400", async () => {
    vi.mocked(createShopPromotion).mockRejectedValueOnce(new HttpError("La remise va de 5 à 70 %.", 400));
    const res = mockResponse();

    await createPromotionOfShop(mockRequest({ params: { id: String(shop._id) }, body, user: SELLER }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("La remise va de 5 à 70 %.");
  });

  it("renvoie 409 pour un code déjà pris", async () => {
    vi.mocked(createShopPromotion).mockRejectedValueOnce(new HttpError("Ce code est déjà pris : choisissez-en un autre.", 409));
    const res = mockResponse();

    await createPromotionOfShop(mockRequest({ params: { id: String(shop._id) }, body, user: SELLER }), res);

    expect(res.statusCode).toBe(409);
  });
});

// ─────────────────────────────────────────────
describe("getPromotionOfShop", () => {
  it("renvoie la promotion de la boutique, sans prix par quantité sans fin", async () => {
    const { promo } = livePromotion({ type: PromotionType.QUANTITY_TIERS, endDate: new Date("9999-12-31T00:00:00.000Z"), tiers: [{ minQuantity: 3, discountValue: 10 }] });
    vi.mocked(managedPromotion).mockResolvedValueOnce({ promo, shop });
    const res = mockResponse();

    await getPromotionOfShop(mockRequest({ params: { id: String(shop._id), promotionId: String(promo._id) }, user: SELLER }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ endDate: null, tiers: [{ minQuantity: 3, discountValue: 10 }], availableActions: ["pause", "stop"] });
  });

  it("renvoie 404 pour la promotion d'une autre boutique que celle de l'adresse", async () => {
    const { promo } = livePromotion();
    vi.mocked(managedPromotion).mockResolvedValueOnce({ promo, shop });
    const res = mockResponse();

    await getPromotionOfShop(mockRequest({ params: { id: String(oid()), promotionId: String(promo._id) }, user: SELLER }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Promotion introuvable.");
  });
});

// ─────────────────────────────────────────────
describe("updatePromotionOfShop", () => {
  it("modifie une promotion de la boutique de l'adresse", async () => {
    const { promo } = livePromotion({ status: PromotionStatus.DRAFT });
    vi.mocked(managedPromotion).mockResolvedValueOnce({ promo, shop });
    vi.mocked(updateShopPromotion).mockResolvedValueOnce(promo);
    const res = mockResponse();
    const body = { type: PromotionType.PRODUCT_DISCOUNT, nom: "Remise revue", discountValue: 25 };

    await updatePromotionOfShop(mockRequest({ params: { id: String(shop._id), promotionId: String(promo._id) }, body, user: SELLER }), res);

    expect(updateShopPromotion).toHaveBeenCalledWith(SELLER, String(promo._id), body);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Promotion modifiée.");
  });

  it("renvoie 404 sans rien modifier pour la promotion d'une autre boutique", async () => {
    const { promo } = livePromotion();
    vi.mocked(managedPromotion).mockResolvedValueOnce({ promo, shop });
    const res = mockResponse();

    await updatePromotionOfShop(mockRequest({ params: { id: String(oid()), promotionId: String(promo._id) }, body: {}, user: SELLER }), res);

    expect(res.statusCode).toBe(404);
    expect(updateShopPromotion).not.toHaveBeenCalled();
  });

  it("renvoie 422 quand le formulaire est invalide", async () => {
    failValidation(["Promotion invalide."]);
    const res = mockResponse();

    await updatePromotionOfShop(mockRequest({ params: { id: String(shop._id), promotionId: "x" }, user: SELLER }), res);

    expect(res.statusCode).toBe(422);
    expect(managedPromotion).not.toHaveBeenCalled();
  });

  it("renvoie 400 pour une promotion commencée", async () => {
    const { promo } = livePromotion();
    vi.mocked(managedPromotion).mockResolvedValueOnce({ promo, shop });
    vi.mocked(updateShopPromotion).mockRejectedValueOnce(new HttpError("Une promotion commencée ne se modifie plus : prolongez-la ou arrêtez-la.", 400));
    const res = mockResponse();

    await updatePromotionOfShop(mockRequest({ params: { id: String(shop._id), promotionId: String(promo._id) }, body: {}, user: SELLER }), res);

    expect(res.statusCode).toBe(400);
  });
});

// ─────────────────────────────────────────────
describe("promotionActionOfShop", () => {
  const act = async (action: string, body: Record<string, unknown> = {}) => {
    const res = mockResponse();
    await promotionActionOfShop(mockRequest({ params: { id: String(oid()), action }, body, user: SELLER }), res);
    return res;
  };

  it("renvoie 404 pour une action inconnue, sans rien appliquer", async () => {
    const res = await act("delete");

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Action inconnue.");
    expect(applyPromotionAction).not.toHaveBeenCalled();
  });

  it.each([
    ["pause", "Promotion en pause : les prix reviennent à la normale."],
    ["resume", "Promotion reprise."],
    ["extend", "Promotion prolongée."],
    ["stop", "Promotion arrêtée."],
  ])("applique l'action %s et renvoie la promotion à jour", async (action, message) => {
    const { promo } = livePromotion();
    vi.mocked(applyPromotionAction).mockResolvedValueOnce(promo);

    const res = await act(action, { endDate: "2026-12-01T00:00:00.000Z" });

    expect(applyPromotionAction).toHaveBeenCalledWith(SELLER, expect.any(String), action, { endDate: "2026-12-01T00:00:00.000Z" });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe(message);
    expect(res.body.data.id).toBe(String(promo._id));
  });

  it("dit « lancée » ou « programmée » selon la date de début", async () => {
    const { promo: live } = livePromotion();
    vi.mocked(applyPromotionAction).mockResolvedValueOnce(live);
    expect((await act("launch")).body.message).toBe("Promotion lancée.");

    const { promo: later } = livePromotion({ status: PromotionStatus.SCHEDULED, startDate: new Date(Date.now() + DAY) });
    vi.mocked(applyPromotionAction).mockResolvedValueOnce(later);
    expect((await act("launch")).body.message).toBe("Promotion programmée.");
  });

  it("renvoie le refus des règles en 400", async () => {
    vi.mocked(applyPromotionAction).mockRejectedValueOnce(new HttpError("Seul un brouillon se lance.", 400));

    const res = await act("launch");

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Seul un brouillon se lance.");
  });

  it("renvoie 422 quand le formulaire est invalide", async () => {
    failValidation(["Date de fin invalide."]);

    const res = await act("extend", { endDate: "demain" });

    expect(res.statusCode).toBe(422);
    expect(applyPromotionAction).not.toHaveBeenCalled();
  });
});
