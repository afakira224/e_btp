import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

vi.mock("../../../src/models/sanction.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/sanction.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, Sanction: mockModel() };
});

// Les effets des mesures ont leurs propres tests (sanction.service).
vi.mock("../../../src/shared/services/sanction.service.js", () => ({
  applySanction: vi.fn(),
  liftSanction: vi.fn(),
  requestLift: vi.fn(),
}));

vi.mock("express-validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("express-validator")>();
  return {
    ...actual,
    validationResult: vi.fn(() => ({ isEmpty: () => true, array: () => [] })),
  };
});

import { validationResult } from "express-validator";
import { Sanction, SanctionTargetKind, SanctionType } from "../../../src/models/sanction.model.js";
import logger from "../../../src/shared/logger/logger.js";
import { HttpError } from "../../../src/shared/middlewares/error.middleware.js";
import { applySanction, liftSanction, requestLift } from "../../../src/shared/services/sanction.service.js";
import {
  createSanction,
  liftSanctionHandler,
  listSanctions,
  mySanctions,
  requestLiftHandler,
} from "../../../src/controllers/sanction.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse } from "../../helpers/express.mock.js";
import { makeSanction, oid } from "../../helpers/factories.js";

const SanctionMock = Sanction as unknown as Record<string, any>;

const DAY = 24 * 60 * 60 * 1000;
const ADMIN = { id: oid().toString(), entityType: "admin" };
const OWNER = { id: oid().toString(), entityType: "shop" };
const SANCTION_ID = "507f1f77bcf86cd799439011";

const failValidation = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({
    isEmpty: () => false,
    array: () => messages.map((msg) => ({ msg })),
  } as any);
};

beforeEach(() => {
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);
  SanctionMock.find.mockReturnValue(mockQuery([]));
});

// ─────────────────────────────────────────────
describe("createSanction", () => {
  const body = {
    type: SanctionType.SUSPENSION,
    targetKind: SanctionTargetKind.SHOP,
    targetId: oid().toString(),
    reason: "Paiements demandés hors plateforme.",
    ticketId: oid().toString(),
    days: 7,
  };

  it("renvoie 422 quand la validation échoue", async () => {
    failValidation(["Mesure invalide.", "Cible invalide."]);
    const res = mockResponse();

    await createSanction(mockRequest({ body, user: ADMIN }), res);

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toBe("Mesure invalide. | Cible invalide.");
    expect(applySanction).not.toHaveBeenCalled();
  });

  it("applique la mesure au nom de l'administrateur et la renvoie", async () => {
    const sanction = makeSanction({ type: SanctionType.SUSPENSION, endsAt: new Date(Date.now() + 7 * DAY) });
    vi.mocked(applySanction).mockResolvedValue(sanction);
    const res = mockResponse();

    await createSanction(mockRequest({ body, user: ADMIN }), res);

    expect(applySanction).toHaveBeenCalledWith({
      type: SanctionType.SUSPENSION,
      targetKind: SanctionTargetKind.SHOP,
      targetId: body.targetId,
      reason: body.reason,
      ticketId: body.ticketId,
      days: 7,
      createdBy: ADMIN.id,
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe("Mesure appliquée.");
    expect(res.body.data).toMatchObject({ id: sanction._id.toString(), type: SanctionType.SUSPENSION, state: "active" });
  });

  it("ignore une demande ou une durée mal typées", async () => {
    vi.mocked(applySanction).mockResolvedValue(makeSanction());

    await createSanction(mockRequest({ body: { ...body, ticketId: 42, days: "7", reason: undefined }, user: ADMIN }), mockResponse());

    expect(vi.mocked(applySanction).mock.calls[0]![0]).toMatchObject({ ticketId: undefined, days: undefined, reason: "" });
  });

  it("renvoie le code du refus", async () => {
    vi.mocked(applySanction).mockRejectedValue(new HttpError("Ce compte est déjà bloqué.", 409));
    const res = mockResponse();

    await createSanction(mockRequest({ body, user: ADMIN }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ success: false, message: "Ce compte est déjà bloqué.", data: null });
  });

  it("renvoie 500 et journalise une erreur inattendue", async () => {
    vi.mocked(applySanction).mockRejectedValue(new Error("transaction interrompue"));
    const res = mockResponse();

    await createSanction(mockRequest({ body, user: ADMIN }), res);

    expect(res.statusCode).toBe(500);
    expect(logger.error).toHaveBeenCalledWith("Erreur application d'une sanction : transaction interrompue");
  });
});

// ─────────────────────────────────────────────
describe("listSanctions", () => {
  const list = async (query: Record<string, unknown> = {}) => {
    const res = mockResponse();
    await listSanctions(mockRequest({ query, user: ADMIN }), res);
    return res;
  };

  it("renvoie 422 quand les filtres sont invalides", async () => {
    failValidation(["Cible invalide."]);

    expect((await list({ targetKind: "order" })).statusCode).toBe(422);
    expect(SanctionMock.find).not.toHaveBeenCalled();
  });

  it("liste les 100 dernières mesures, les plus récentes d'abord", async () => {
    const query = mockQuery([makeSanction()]);
    SanctionMock.find.mockReturnValue(query);

    const res = await list();

    expect(SanctionMock.find).toHaveBeenCalledWith({});
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(query.limit).toHaveBeenCalledWith(100);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("donne l'historique d'une cible", async () => {
    const targetId = oid().toString();

    await list({ targetKind: SanctionTargetKind.OFFER, targetId });

    expect(SanctionMock.find).toHaveBeenCalledWith({ "target.kind": SanctionTargetKind.OFFER, "target.id": new Types.ObjectId(targetId) });
  });

  it("isole les mesures à revoir : masquage provisoire, remise en ligne demandée", async () => {
    await list({ pending: "true" });

    expect(SanctionMock.find).toHaveBeenCalledWith({
      liftedAt: null,
      $or: [{ provisional: true }, { liftRequestedAt: { $ne: null } }],
    });
  });

  it("ne filtre pas quand « pending » vaut false", async () => {
    await list({ pending: "false" });

    expect(SanctionMock.find).toHaveBeenCalledWith({});
  });

  it("dit l'état de chaque mesure", async () => {
    SanctionMock.find.mockReturnValue(
      mockQuery([
        makeSanction({ type: SanctionType.SUSPENSION, endsAt: new Date(Date.now() - DAY) }),
        makeSanction({ liftedAt: new Date() }),
        makeSanction(),
      ])
    );

    const res = await list();

    expect(res.body.data.map((s: any) => s.state)).toEqual(["ended", "lifted", "active"]);
  });
});

// ─────────────────────────────────────────────
describe("mySanctions", () => {
  it("liste les mesures qui visent le compte connecté", async () => {
    const query = mockQuery([makeSanction()]);
    SanctionMock.find.mockReturnValue(query);
    const res = mockResponse();

    await mySanctions(mockRequest({ user: OWNER }), res);

    expect(SanctionMock.find).toHaveBeenCalledWith({ notifiedUserId: new Types.ObjectId(OWNER.id) });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("renvoie 500 quand la lecture échoue", async () => {
    SanctionMock.find.mockImplementation(() => {
      throw new Error("base indisponible");
    });
    const res = mockResponse();

    await mySanctions(mockRequest({ user: OWNER }), res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
describe("liftSanctionHandler", () => {
  it("renvoie 422 quand l'identifiant est invalide", async () => {
    failValidation(["Identifiant de mesure invalide."]);
    const res = mockResponse();

    await liftSanctionHandler(mockRequest({ params: { id: "42" }, user: ADMIN }), res);

    expect(res.statusCode).toBe(422);
    expect(liftSanction).not.toHaveBeenCalled();
  });

  it("lève la mesure au nom de l'administrateur, motif à l'appui", async () => {
    vi.mocked(liftSanction).mockResolvedValue(makeSanction({ liftedAt: new Date(), liftReason: "Annonce corrigée." }));
    const res = mockResponse();

    await liftSanctionHandler(mockRequest({ params: { id: SANCTION_ID }, body: { reason: "Annonce corrigée." }, user: ADMIN }), res);

    expect(liftSanction).toHaveBeenCalledWith(SANCTION_ID, ADMIN.id, "Annonce corrigée.");
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Mesure levée.");
    expect(res.body.data).toMatchObject({ state: "lifted", liftReason: "Annonce corrigée." });
  });

  it("ignore un motif qui n'est pas un texte", async () => {
    vi.mocked(liftSanction).mockResolvedValue(makeSanction({ liftedAt: new Date() }));

    await liftSanctionHandler(mockRequest({ params: { id: SANCTION_ID }, body: { reason: 42 }, user: ADMIN }), mockResponse());

    expect(liftSanction).toHaveBeenCalledWith(SANCTION_ID, ADMIN.id, undefined);
  });

  it("renvoie 409 pour une mesure déjà levée", async () => {
    vi.mocked(liftSanction).mockRejectedValue(new HttpError("Cette mesure est déjà levée.", 409));
    const res = mockResponse();

    await liftSanctionHandler(mockRequest({ params: { id: SANCTION_ID }, user: ADMIN }), res);

    expect(res.statusCode).toBe(409);
  });
});

// ─────────────────────────────────────────────
describe("requestLiftHandler", () => {
  it("transmet la demande de remise en ligne du compte connecté", async () => {
    vi.mocked(requestLift).mockResolvedValue(makeSanction({ type: SanctionType.HIDE, liftRequestedAt: new Date() }));
    const res = mockResponse();

    await requestLiftHandler(mockRequest({ params: { id: SANCTION_ID }, user: OWNER }), res);

    expect(requestLift).toHaveBeenCalledWith(SANCTION_ID, OWNER.id);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Demande de remise en ligne transmise.");
    expect(res.body.data.liftRequestedAt).not.toBeNull();
  });

  it("renvoie 403 pour une mesure qui vise quelqu'un d'autre", async () => {
    vi.mocked(requestLift).mockRejectedValue(new HttpError("Cette mesure ne vous concerne pas.", 403));
    const res = mockResponse();

    await requestLiftHandler(mockRequest({ params: { id: SANCTION_ID }, user: OWNER }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Cette mesure ne vous concerne pas.");
  });

  it("renvoie 422 quand l'identifiant est invalide", async () => {
    failValidation(["Identifiant de mesure invalide."]);
    const res = mockResponse();

    await requestLiftHandler(mockRequest({ params: { id: "42" }, user: OWNER }), res);

    expect(res.statusCode).toBe(422);
    expect(requestLift).not.toHaveBeenCalled();
  });
});
