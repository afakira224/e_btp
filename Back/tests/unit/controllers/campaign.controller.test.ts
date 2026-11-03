import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/models/campaign.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Campaign: mockModel() };
});

vi.mock("../../../src/models/product.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Product: mockModel(), productBoutique: mockModel() };
});

// Mise en forme des offres : testée avec les listes d'offres.
vi.mock("../../../src/shared/helpers/productBoutique.helper.js", () => ({
  enrichProductBoutiques: vi.fn(async (items: { _id: unknown }[]) => items.map((item) => ({ id: String(item._id) }))),
}));

// Inscription et offres inscrites : testées dans promotion.service. Les règles pures restent réelles.
vi.mock("../../../src/shared/services/promotion.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/shared/services/promotion.service.js")>();
  return { ...actual, campaignOfferIds: vi.fn(async () => new Map()), joinCampaign: vi.fn(), syncCampaignPromotions: vi.fn(async () => 0) };
});

vi.mock("express-validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("express-validator")>();
  return {
    ...actual,
    validationResult: vi.fn(() => ({ isEmpty: () => true, array: () => [] })),
  };
});

import { Types } from "mongoose";
import { validationResult } from "express-validator";
import { Campaign } from "../../../src/models/campaign.model.js";
import { productBoutique } from "../../../src/models/product.model.js";
import { HttpError } from "../../../src/shared/middlewares/error.middleware.js";
import { enrichProductBoutiques } from "../../../src/shared/helpers/productBoutique.helper.js";
import { campaignOfferIds, joinCampaign, syncCampaignPromotions } from "../../../src/shared/services/promotion.service.js";
import {
  createCampaign,
  getCampaign,
  joinCampaignHandler,
  listCampaigns,
  updateCampaign,
} from "../../../src/controllers/campaign.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockExpressSession, mockRequest, mockResponse } from "../../helpers/express.mock.js";
import { makeCampaign, makeProductBoutique, makeShopPromotion, oid } from "../../helpers/factories.js";

const CampaignMock = Campaign as unknown as Record<string, any>;
const PbMock = productBoutique as unknown as Record<string, any>;

const DAY = 24 * 3600 * 1000;
const ADMIN = { id: oid().toString(), entityType: "admin" };
const SELLER = { id: oid().toString(), entityType: "shop" };

/** Campagne en cours : commencée hier, finie dans 10 jours. */
const running = (over: Record<string, unknown> = {}) =>
  makeCampaign({ startDate: new Date(Date.now() - DAY), endDate: new Date(Date.now() + 10 * DAY), ...over });

beforeEach(() => {
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);
  CampaignMock.find.mockReturnValue(mockQuery([]));
  CampaignMock.findOne.mockReturnValue(mockQuery(null));
  CampaignMock.findById.mockReturnValue(mockQuery(null));
  CampaignMock.create.mockImplementation(async (doc: any) => makeCampaign(doc));
  PbMock.find.mockReturnValue(mockQuery([]));
  vi.mocked(campaignOfferIds).mockResolvedValue(new Map());
});

const failValidation = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({ isEmpty: () => false, array: () => messages.map((msg) => ({ msg })) } as any);
};

// ─────────────────────────────────────────────
describe("listCampaigns", () => {
  it("liste au public les campagnes actives en cours ou à venir, par date de début", async () => {
    const query = mockQuery([]);
    CampaignMock.find.mockReturnValue(query);
    const res = mockResponse();

    await listCampaigns(mockRequest(), res);

    const filter = CampaignMock.find.mock.calls[0]![0];
    expect(filter.actif).toBe(true);
    expect(filter.endDate.$gte).toBeInstanceOf(Date);
    expect(query.sort).toHaveBeenCalledWith({ startDate: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("montre tout à l'administration qui le demande, et seulement à elle", async () => {
    await listCampaigns(mockRequest({ query: { all: "true" }, session: mockExpressSession(ADMIN) }), mockResponse());
    expect(CampaignMock.find.mock.calls[0]![0]).toEqual({});

    await listCampaigns(mockRequest({ query: { all: "true" }, session: mockExpressSession(SELLER) }), mockResponse());
    expect(CampaignMock.find.mock.calls[1]![0]).toHaveProperty("actif", true);
  });

  it("compte les offres inscrites encore en vente, sans doublon", async () => {
    const soldes = running({ nom: "Soldes", description: "Les soldes" });
    const rentree = running({ nom: "Rentrée", startDate: new Date(Date.now() + 2 * DAY) });
    const [a, b, hidden] = [oid(), oid(), oid()];
    CampaignMock.find.mockReturnValue(mockQuery([soldes, rentree]));
    vi.mocked(campaignOfferIds).mockResolvedValueOnce(new Map([[String(soldes._id), [a, b, hidden, a]]]));
    const visible = mockQuery([{ _id: a }, { _id: b }]);
    PbMock.find.mockReturnValue(visible);
    const res = mockResponse();

    await listCampaigns(mockRequest(), res);

    expect(PbMock.find).toHaveBeenCalledWith({ _id: { $in: [a, b, hidden, a] }, hiddenAt: null });
    expect(visible.select).toHaveBeenCalledWith("_id");
    expect(res.body.data).toEqual([
      {
        id: String(soldes._id),
        slug: soldes.slug,
        nom: "Soldes",
        description: "Les soldes",
        startDate: soldes.startDate,
        endDate: soldes.endDate,
        minDiscount: 10,
        familleIds: [],
        image: null,
        actif: true,
        state: "running",
        offerCount: 2,
      },
      expect.objectContaining({ id: String(rentree._id), state: "upcoming", offerCount: 0 }),
    ]);
  });

  it("renvoie 500 sur une erreur inattendue", async () => {
    CampaignMock.find.mockImplementation(() => {
      throw new Error("réplique indisponible");
    });
    const res = mockResponse();

    await listCampaigns(mockRequest(), res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
describe("getCampaign", () => {
  it("lit une campagne par son slug, avec ses offres en vente et en stock, les plus remisées d'abord", async () => {
    const campaign = running();
    CampaignMock.findOne.mockReturnValue(mockQuery(campaign));
    const ids = [oid(), oid()];
    vi.mocked(campaignOfferIds).mockResolvedValueOnce(new Map([[String(campaign._id), ids]]));
    const offers = [makeProductBoutique({ _id: ids[0] })];
    const query = mockQuery(offers);
    PbMock.find.mockReturnValue(query);
    const res = mockResponse();

    await getCampaign(mockRequest({ params: { slug: "soldes-octobre" } }), res);

    expect(CampaignMock.findOne).toHaveBeenCalledWith({ slug: "soldes-octobre" });
    expect(PbMock.find).toHaveBeenCalledWith({ _id: { $in: ids }, hiddenAt: null, stock: { $gt: 0 } });
    expect(query.sort).toHaveBeenCalledWith({ "promo.percent": -1 });
    expect(query.limit).toHaveBeenCalledWith(60);
    expect(enrichProductBoutiques).toHaveBeenCalledWith(offers);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ id: String(campaign._id), state: "running", offerCount: 1, offers: [{ id: String(ids[0]) }] });
  });

  it("lit aussi une campagne par son identifiant", async () => {
    const campaign = running();
    CampaignMock.findOne.mockReturnValue(mockQuery(campaign));

    await getCampaign(mockRequest({ params: { slug: String(campaign._id) } }), mockResponse());

    expect(CampaignMock.findOne).toHaveBeenCalledWith({ _id: String(campaign._id) });
  });

  it("ne renvoie aucune offre pour une campagne sans inscription", async () => {
    CampaignMock.findOne.mockReturnValue(mockQuery(running()));
    const res = mockResponse();

    await getCampaign(mockRequest({ params: { slug: "soldes-octobre" } }), res);

    expect(PbMock.find).toHaveBeenCalledWith({ _id: { $in: [] }, hiddenAt: null, stock: { $gt: 0 } });
    expect(res.body.data.offerCount).toBe(0);
  });

  it("renvoie 404 pour une campagne introuvable", async () => {
    const res = mockResponse();

    await getCampaign(mockRequest({ params: { slug: "inconnue" } }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Campagne introuvable.");
  });
});

// ─────────────────────────────────────────────
describe("createCampaign", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    nom: "Rentrée chantier",
    startDate: "2026-11-10T00:00:00.000Z",
    endDate: "2026-11-30T00:00:00.000Z",
    minDiscount: 15,
    ...over,
  });

  it("crée une campagne au slug tiré du nom, sans accent", async () => {
    const familleId = oid().toString();
    const res = mockResponse();

    await createCampaign(mockRequest({ body: body({ nom: "  Fête des Mères : -15 % !  ", familleIds: [familleId], description: "  Pour maman  " }), user: ADMIN }), res);

    expect(CampaignMock.findOne).toHaveBeenCalledWith({ slug: "fete-des-meres-15" });
    const created = CampaignMock.create.mock.calls[0]![0];
    expect(created).toMatchObject({
      slug: "fete-des-meres-15",
      nom: "Fête des Mères : -15 % !",
      description: "Pour maman",
      startDate: new Date("2026-11-10T00:00:00.000Z"),
      endDate: new Date("2026-11-30T00:00:00.000Z"),
      minDiscount: 15,
      familleIds: [new Types.ObjectId(familleId)],
      image: null,
      actif: true,
      createdBy: new Types.ObjectId(ADMIN.id),
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe("Campagne créée.");
    expect(res.body.data).toMatchObject({ slug: "fete-des-meres-15", offerCount: 0 });
  });

  it("garde le slug choisi par l'administration", async () => {
    await createCampaign(mockRequest({ body: body({ slug: "Rentree 2026" }), user: ADMIN }), mockResponse());

    expect(CampaignMock.create.mock.calls[0]![0].slug).toBe("rentree-2026");
  });

  it("refuse en 409 un slug déjà pris", async () => {
    CampaignMock.findOne.mockReturnValue(mockQuery(makeCampaign()));
    const res = mockResponse();

    await createCampaign(mockRequest({ body: body(), user: ADMIN }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe("Une campagne porte déjà ce nom : choisissez-en un autre.");
    expect(CampaignMock.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ endDate: "2026-11-10T00:00:00.000Z" }, "La fin vient après le début."],
    [{ endDate: "2026-12-31T00:00:00.000Z" }, "Une campagne dure 30 jours au plus."],
    [{ minDiscount: 80 }, "La remise minimale va de 5 à 70 %."],
  ])("refuse en 400 une campagne hors règles %o", async (over, message) => {
    const res = mockResponse();

    await createCampaign(mockRequest({ body: body(over), user: ADMIN }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(message);
  });

  it("renvoie 422 quand le formulaire est invalide", async () => {
    failValidation(["Le nom fait de 2 à 80 caractères."]);
    const res = mockResponse();

    await createCampaign(mockRequest({ body: {}, user: ADMIN }), res);

    expect(res.statusCode).toBe(422);
  });
});

// ─────────────────────────────────────────────
describe("updateCampaign", () => {
  it("modifie les champs fournis et revérifie les règles", async () => {
    const campaign = running();
    CampaignMock.findById.mockReturnValue(mockQuery(campaign));
    const res = mockResponse();

    await updateCampaign(mockRequest({ params: { id: String(campaign._id) }, body: { nom: " Soldes d'hiver ", actif: false, minDiscount: 20 }, user: ADMIN }), res);

    expect(campaign).toMatchObject({ nom: "Soldes d'hiver", actif: false, minDiscount: 20 });
    expect(campaign.save).toHaveBeenCalled();
    // Les promotions inscrites suivent la campagne (closes avec elle).
    expect(syncCampaignPromotions).toHaveBeenCalledWith(campaign, expect.any(Date));
    expect(res.statusCode).toBe(200);
    expect(res.body.data.state).toBe("ended");
  });

  it("refuse des dates hors règles sans enregistrer", async () => {
    const campaign = running();
    CampaignMock.findById.mockReturnValue(mockQuery(campaign));
    const res = mockResponse();

    await updateCampaign(
      mockRequest({ params: { id: String(campaign._id) }, body: { endDate: new Date(campaign.startDate.getTime() + 40 * DAY).toISOString() }, user: ADMIN }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Une campagne dure 30 jours au plus.");
    expect(campaign.save).not.toHaveBeenCalled();
  });

  it("renvoie 404 pour une campagne introuvable", async () => {
    const res = mockResponse();

    await updateCampaign(mockRequest({ params: { id: String(oid()) }, body: {}, user: ADMIN }), res);

    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────
describe("joinCampaignHandler", () => {
  it("inscrit les offres de la boutique et renvoie l'inscription", async () => {
    const campaignId = String(oid());
    const shopId = String(oid());
    const offerId = String(oid());
    const promo = makeShopPromotion({ campaignId: new Types.ObjectId(campaignId), nom: "Soldes — −15 %", discountValue: 15 });
    vi.mocked(joinCampaign).mockResolvedValueOnce(promo);
    const res = mockResponse();

    await joinCampaignHandler(
      mockRequest({ params: { id: campaignId }, body: { boutiqueId: shopId, productBoutiqueIds: [offerId], discountValue: "15" }, user: SELLER }),
      res
    );

    expect(joinCampaign).toHaveBeenCalledWith(SELLER, campaignId, { boutiqueId: shopId, productBoutiqueIds: [offerId], discountValue: 15, confirmHighDiscount: false });
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe("Offres inscrites à la campagne.");
    expect(res.body.data).toMatchObject({ id: String(promo._id), campaignId, nom: "Soldes — −15 %" });
  });

  it("garde le code d'un refus (remise trop faible, campagne terminée)", async () => {
    vi.mocked(joinCampaign).mockRejectedValueOnce(new HttpError("Cette campagne demande une remise de 20 % au moins.", 400));
    const res = mockResponse();

    await joinCampaignHandler(mockRequest({ params: { id: String(oid()) }, body: { boutiqueId: String(oid()), productBoutiqueIds: [], discountValue: 10 }, user: SELLER }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Cette campagne demande une remise de 20 % au moins.");
  });

  it("renvoie 422 sans rien inscrire quand le formulaire est invalide", async () => {
    failValidation(["Choisissez de 1 à 50 offres."]);
    const res = mockResponse();

    await joinCampaignHandler(mockRequest({ params: { id: String(oid()) }, body: {}, user: SELLER }), res);

    expect(res.statusCode).toBe(422);
    expect(joinCampaign).not.toHaveBeenCalled();
  });
});
