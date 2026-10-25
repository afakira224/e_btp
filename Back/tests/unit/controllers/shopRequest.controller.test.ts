import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// Les enums restent réels : le contrôleur les compare et les tests les nomment.
vi.mock("../../../src/models/shopRequest.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/shopRequest.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, ShopRequest: mockModel() };
});

vi.mock("../../../src/models/boutique.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Shop: mockModel() };
});

vi.mock("../../../src/models/famille.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Famille: mockModel() };
});

vi.mock("../../../src/models/user.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/user.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, User: mockModel(), EntitiesLogin: mockModel() };
});

// La mise à jour des sessions touche au store MongoDB : on vérifie l'appel.
vi.mock("../../../src/shared/config/session.config.js", () => ({
  updateUserSessionsRole: vi.fn(),
}));

vi.mock("../../../src/shared/helpers/mail.helper.js", () => ({
  sendShopRequestReceivedMail: vi.fn(() => 1),
  sendShopRequestApprovedMail: vi.fn(() => 2),
  sendShopRequestRejectedMail: vi.fn(() => 3),
}));

vi.mock("express-validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("express-validator")>();
  return {
    ...actual,
    validationResult: vi.fn(() => ({ isEmpty: () => true, array: () => [] })),
  };
});

import { validationResult } from "express-validator";
import {
  CatalogSize,
  SellerExperience,
  SellerType,
  ShopRequest,
  ShopRequestStatus,
} from "../../../src/models/shopRequest.model.js";
import { Shop } from "../../../src/models/boutique.model.js";
import { Famille } from "../../../src/models/famille.model.js";
import { EntitiesLogin, User } from "../../../src/models/user.model.js";
import { updateUserSessionsRole } from "../../../src/shared/config/session.config.js";
import {
  sendShopRequestApprovedMail,
  sendShopRequestReceivedMail,
  sendShopRequestRejectedMail,
} from "../../../src/shared/helpers/mail.helper.js";
import {
  approveShopRequest,
  cancelShopRequest,
  createShopRequest,
  getMyShopRequests,
  getShopRequestById,
  getShopRequests,
  rejectShopRequest,
} from "../../../src/controllers/shopRequest.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse, mockSession } from "../../helpers/express.mock.js";
import { makeShop, makeShopRequest, makeUser, oid } from "../../helpers/factories.js";

const RequestMock = ShopRequest as unknown as Record<string, any>;
const ShopMock = Shop as unknown as Record<string, any>;
const FamilleMock = Famille as unknown as Record<string, any>;
const UserMock = User as unknown as Record<string, any>;
const LoginMock = EntitiesLogin as unknown as Record<string, any>;

const ADMIN = { id: oid().toString(), entityType: "admin" };

let session: ReturnType<typeof mockSession>;

const failValidation = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({
    isEmpty: () => false,
    array: () => messages.map((msg) => ({ msg })),
  } as any);
};

beforeEach(() => {
  session = mockSession();
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);

  RequestMock.find.mockReturnValue(mockQuery([]));
  RequestMock.findOne.mockReturnValue(mockQuery(null));
  RequestMock.findById.mockReturnValue(mockQuery(null));
  RequestMock.countDocuments.mockReturnValue(mockQuery(0));
  RequestMock.aggregate.mockResolvedValue([]);
  // create() reçoit un objet seul : il renvoie le document, pas un tableau.
  RequestMock.create.mockImplementation(async (values: Record<string, unknown>) => makeShopRequest(values));

  ShopMock.findOne.mockReturnValue(mockQuery(null));
  ShopMock.create.mockImplementation(async (docs: any[]) => [makeShop(docs[0])]);
  FamilleMock.countDocuments.mockReturnValue(mockQuery(1));
  UserMock.findById.mockReturnValue(mockQuery(makeUser()));
  LoginMock.updateOne.mockReturnValue(mockQuery({ acknowledged: true }));
  vi.mocked(updateUserSessionsRole).mockResolvedValue(1);
});

// ─────────────────────────────────────────────
describe("createShopRequest", () => {
  const user = makeUser();
  const familleId = oid().toString();
  const body = (over: Record<string, unknown> = {}) => ({
    nom: "Quincaillerie Kipé",
    description: "Quincaillerie générale : visserie, outillage à main.",
    familleIds: [familleId],
    sellerType: SellerType.PARTICULIER,
    experience: SellerExperience.UN_A_TROIS,
    catalogSize: CatalogSize.MOINS_DE_50,
    hasPhysicalStore: true,
    adresse: "Kipé, Ratoma, Conakry",
    acceptTerms: true,
    ...over,
  });
  const asUser = (over: Record<string, unknown> = {}) =>
    mockRequest({ body: body(over), user: { id: user._id.toString(), entityType: "user" } });

  beforeEach(() => {
    UserMock.findById.mockReturnValue(mockQuery(user));
  });

  it("renvoie 422 quand le questionnaire est invalide", async () => {
    failValidation(["Le nom de la boutique est requis.", "Choisissez au moins un domaine d'activité."]);
    const res = mockResponse();

    await createShopRequest(asUser(), res);

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toBe("Le nom de la boutique est requis. | Choisissez au moins un domaine d'activité.");
    expect(RequestMock.create).not.toHaveBeenCalled();
  });

  it("renvoie 401 sans session", async () => {
    const res = mockResponse();

    await createShopRequest(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(401);
  });

  it("renvoie 404 quand le compte n'existe plus", async () => {
    UserMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await createShopRequest(asUser(), res);

    expect(res.statusCode).toBe(404);
  });

  it("renvoie 409 quand une demande est déjà en attente", async () => {
    RequestMock.findOne.mockReturnValue(mockQuery(makeShopRequest({ userId: user._id })));
    const res = mockResponse();

    await createShopRequest(asUser(), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe("Vous avez déjà une demande en cours d'examen.");
    expect(RequestMock.findOne).toHaveBeenCalledWith({
      userId: user._id.toString(),
      status: ShopRequestStatus.PENDING,
    });
  });

  it("renvoie 409 quand une boutique porte déjà ce nom, casse ignorée", async () => {
    ShopMock.findOne.mockReturnValue(mockQuery(makeShop({ nom: "QUINCAILLERIE KIPÉ" })));
    const res = mockResponse();

    await createShopRequest(asUser({ nom: "Quincaillerie (Kipé)" }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe("Une boutique porte déjà ce nom : choisissez-en un autre.");
    // Les caractères spéciaux du nom sont échappés avant d'entrer dans la regex.
    expect(ShopMock.findOne).toHaveBeenCalledWith({
      nom: { $regex: "^Quincaillerie \\(Kipé\\)$", $options: "i" },
    });
  });

  it("renvoie 400 quand un domaine est inconnu, les doublons étant comptés une fois", async () => {
    const other = oid().toString();
    FamilleMock.countDocuments.mockReturnValue(mockQuery(1));
    const res = mockResponse();

    await createShopRequest(asUser({ familleIds: [familleId, familleId, other] }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Domaine d'activité introuvable.");
    expect(FamilleMock.countDocuments).toHaveBeenCalledWith({
      _id: { $in: [familleId, other] },
      actif: true,
      deletedAt: null,
    });
  });

  it("enregistre la demande au nom de la session et prévient le demandeur", async () => {
    const res = mockResponse();
    const req = asUser({ userId: oid().toString(), rccm: "GN.TCC.2024.B.01234" });

    await createShopRequest(req, res);

    expect(res.statusCode).toBe(201);
    const [values] = RequestMock.create.mock.calls[0]!;
    // Le demandeur vient de la session, jamais du corps.
    expect(values.userId).toBe(user._id.toString());
    expect(values.status).toBe(ShopRequestStatus.PENDING);
    // Un particulier n'a pas de registre : le numéro envoyé est écarté.
    expect(values.rccm).toBeNull();
    expect(values.email).toBeNull();
    expect(values.acceptedTermsAt).toBeInstanceOf(Date);
    expect(sendShopRequestReceivedMail).toHaveBeenCalledWith(user, "Quincaillerie Kipé");
    expect(res.body.data.status).toBe(ShopRequestStatus.PENDING);
  });

  it("conserve le RCCM d'une entreprise", async () => {
    const res = mockResponse();

    await createShopRequest(
      asUser({ sellerType: SellerType.ENTREPRISE, rccm: "GN.TCC.2024.B.01234" }),
      res
    );

    expect(res.statusCode).toBe(201);
    expect(RequestMock.create.mock.calls[0]![0].rccm).toBe("GN.TCC.2024.B.01234");
  });

  it("répond 201 même si l'email de confirmation échoue", async () => {
    vi.mocked(sendShopRequestReceivedMail).mockImplementationOnce(() => {
      throw new Error("file d'envoi indisponible");
    });
    const res = mockResponse();

    await createShopRequest(asUser(), res);

    expect(res.statusCode).toBe(201);
  });

  it("renvoie 409 quand l'index unique tranche entre deux envois simultanés", async () => {
    RequestMock.create.mockRejectedValueOnce(Object.assign(new Error("E11000 duplicate key"), { code: 11000 }));
    const res = mockResponse();

    await createShopRequest(asUser(), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe("Vous avez déjà une demande en cours d'examen.");
  });

  it("renvoie 500 sur une erreur inattendue", async () => {
    RequestMock.create.mockRejectedValueOnce(new Error("mongo indisponible"));
    const res = mockResponse();

    await createShopRequest(asUser(), res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
describe("getMyShopRequests", () => {
  it("renvoie 401 sans session", async () => {
    const res = mockResponse();

    await getMyShopRequests(mockRequest(), res);

    expect(res.statusCode).toBe(401);
  });

  it("lit les demandes du titulaire de la session, les plus récentes d'abord", async () => {
    const userId = oid().toString();
    const query = mockQuery([makeShopRequest(), makeShopRequest({ status: ShopRequestStatus.REJECTED })]);
    RequestMock.find.mockReturnValue(query);
    const res = mockResponse();

    await getMyShopRequests(mockRequest({ user: { id: userId, entityType: "user" } }), res);

    expect(res.statusCode).toBe(200);
    expect(RequestMock.find).toHaveBeenCalledWith({ userId });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(res.body.data).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────
describe("cancelShopRequest", () => {
  const owner = oid();
  const asOwner = () =>
    mockRequest({ params: { id: oid().toString() }, user: { id: owner.toString(), entityType: "user" } });

  it("renvoie 404 quand la demande n'existe pas", async () => {
    const res = mockResponse();

    await cancelShopRequest(asOwner(), res);

    expect(res.statusCode).toBe(404);
  });

  it("refuse d'annuler la demande d'un autre compte", async () => {
    RequestMock.findById.mockReturnValue(mockQuery(makeShopRequest()));
    const res = mockResponse();

    await cancelShopRequest(asOwner(), res);

    expect(res.statusCode).toBe(403);
  });

  it("refuse d'annuler une demande déjà traitée", async () => {
    RequestMock.findById.mockReturnValue(
      mockQuery(makeShopRequest({ userId: owner, status: ShopRequestStatus.APPROVED }))
    );
    const res = mockResponse();

    await cancelShopRequest(asOwner(), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Cette demande a déjà été traitée (approuvée).");
  });

  it("annule une demande en attente", async () => {
    const request = makeShopRequest({ userId: owner });
    RequestMock.findById.mockReturnValue(mockQuery(request));
    const res = mockResponse();

    await cancelShopRequest(asOwner(), res);

    expect(res.statusCode).toBe(200);
    expect(request.status).toBe(ShopRequestStatus.CANCELLED);
    expect(request.save).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("getShopRequests", () => {
  it("renvoie 422 quand les filtres sont invalides", async () => {
    failValidation(["Statut invalide."]);
    const res = mockResponse();

    await getShopRequests(mockRequest({ query: { status: "inconnu" }, user: ADMIN }), res);

    expect(res.statusCode).toBe(422);
  });

  it("sert la file d'attente des plus anciennes aux plus récentes", async () => {
    const query = mockQuery([makeShopRequest()]);
    RequestMock.find.mockReturnValue(query);
    RequestMock.countDocuments.mockReturnValue(mockQuery(1));
    const res = mockResponse();

    await getShopRequests(
      mockRequest({ query: { status: ShopRequestStatus.PENDING, search: "kipé (2)" }, user: ADMIN }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(RequestMock.find).toHaveBeenCalledWith({
      status: ShopRequestStatus.PENDING,
      nom: { $regex: "kipé \\(2\\)", $options: "i" },
    });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: 1 });
    expect(res.body.data).toMatchObject({ total: 1, page: 1, totalPages: 1 });
  });

  it("présente l'historique des plus récemment traitées aux plus anciennes", async () => {
    const query = mockQuery([]);
    RequestMock.find.mockReturnValue(query);
    const res = mockResponse();

    await getShopRequests(mockRequest({ query: { status: ShopRequestStatus.APPROVED }, user: ADMIN }), res);

    expect(query.sort).toHaveBeenCalledWith({ updatedAt: -1 });
  });

  it("compte les demandes de chaque statut, zéro compris", async () => {
    RequestMock.aggregate.mockResolvedValue([
      { _id: ShopRequestStatus.PENDING, count: 3 },
      { _id: ShopRequestStatus.REJECTED, count: 1 },
    ]);
    const res = mockResponse();

    await getShopRequests(mockRequest({ user: ADMIN }), res);

    expect(res.body.data.counts).toEqual({ pending: 3, approved: 0, rejected: 1, cancelled: 0 });
  });
});

// ─────────────────────────────────────────────
describe("getShopRequestById", () => {
  const owner = oid();

  it("renvoie 404 quand la demande n'existe pas", async () => {
    const res = mockResponse();

    await getShopRequestById(mockRequest({ params: { id: oid().toString() }, user: ADMIN }), res);

    expect(res.statusCode).toBe(404);
  });

  it("refuse la demande d'un autre compte", async () => {
    RequestMock.findById.mockReturnValue(mockQuery(makeShopRequest({ userId: owner })));
    const res = mockResponse();

    await getShopRequestById(
      mockRequest({ params: { id: oid().toString() }, user: { id: oid().toString(), entityType: "user" } }),
      res
    );

    expect(res.statusCode).toBe(403);
  });

  it("la montre à son demandeur", async () => {
    RequestMock.findById.mockReturnValue(mockQuery(makeShopRequest({ userId: owner })));
    const res = mockResponse();

    await getShopRequestById(
      mockRequest({ params: { id: oid().toString() }, user: { id: owner.toString(), entityType: "user" } }),
      res
    );

    expect(res.statusCode).toBe(200);
  });

  it("la montre à l'administration, demandeur compris", async () => {
    const applicant = makeUser({ _id: owner });
    RequestMock.findById.mockReturnValue(mockQuery(makeShopRequest({ userId: applicant })));
    const res = mockResponse();

    await getShopRequestById(mockRequest({ params: { id: oid().toString() }, user: ADMIN }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.userId).toBe(owner.toString());
    expect(res.body.data.applicant).toMatchObject({ email: applicant.email, prenom: applicant.prenom });
  });
});

// ─────────────────────────────────────────────
describe("approveShopRequest", () => {
  const req = () => mockRequest({ params: { id: oid().toString() }, user: ADMIN });

  it("renvoie 404 quand la demande n'existe pas", async () => {
    const res = mockResponse();

    await approveShopRequest(req(), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it("refuse une demande déjà traitée", async () => {
    RequestMock.findById.mockReturnValue(mockQuery(makeShopRequest({ status: ShopRequestStatus.REJECTED })));
    const res = mockResponse();

    await approveShopRequest(req(), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Cette demande a déjà été traitée (refusée).");
    expect(ShopMock.create).not.toHaveBeenCalled();
  });

  it("renvoie 404 quand le compte du demandeur n'existe plus", async () => {
    RequestMock.findById.mockReturnValue(mockQuery(makeShopRequest()));
    UserMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await approveShopRequest(req(), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Le compte du demandeur n'existe plus.");
  });

  it("renvoie 409 quand une boutique a pris le nom entre-temps", async () => {
    RequestMock.findById.mockReturnValue(mockQuery(makeShopRequest()));
    ShopMock.findOne.mockReturnValue(mockQuery(makeShop({ nom: "Quincaillerie Kipé" })));
    const res = mockResponse();

    await approveShopRequest(req(), res);

    expect(res.statusCode).toBe(409);
    expect(ShopMock.create).not.toHaveBeenCalled();
    expect(session.commitTransaction).not.toHaveBeenCalled();
  });

  it("ouvre la boutique, fait du demandeur un gérant et le prévient", async () => {
    const user = makeUser({ role: "user", email: "ibrahima@example.com" });
    const request = makeShopRequest({ userId: user._id });
    RequestMock.findById.mockReturnValue(mockQuery(request));
    UserMock.findById.mockReturnValue(mockQuery(user));
    const res = mockResponse();

    await approveShopRequest(req(), res);

    expect(res.statusCode).toBe(200);

    // La boutique reprend les réponses ; sans email de boutique, celui du compte.
    const [[shopValues], options] = ShopMock.create.mock.calls[0]!;
    expect(shopValues).toMatchObject({
      ownerId: user._id,
      nom: request.nom,
      description: request.description,
      adresse: request.adresse,
      email: "ibrahima@example.com",
    });
    expect(options).toEqual({ session });

    // Le compte devient gérant, profil et identifiants.
    expect(user.role).toBe("shop");
    expect(user.save).toHaveBeenCalledWith({ session });
    expect(LoginMock.updateOne).toHaveBeenCalledWith(
      { entityId: user._id },
      { entityType: "shop" },
      { session }
    );

    // La demande est close et rattachée à sa boutique.
    expect(request.status).toBe(ShopRequestStatus.APPROVED);
    expect(request.reviewedBy?.toString()).toBe(ADMIN.id);
    expect(request.reviewedAt).toBeInstanceOf(Date);
    expect(request.shopId).toBeDefined();
    expect(res.body.data.shopId).toBe(request.shopId!.toString());
    expect(session.commitTransaction).toHaveBeenCalled();

    // Après la transaction : sessions ouvertes et email.
    expect(updateUserSessionsRole).toHaveBeenCalledWith(user._id.toString(), "shop");
    expect(sendShopRequestApprovedMail).toHaveBeenCalledWith(user, request.nom);
  });

  it("garde l'email de boutique donné dans la demande", async () => {
    RequestMock.findById.mockReturnValue(mockQuery(makeShopRequest({ email: "contact@kipe.gn" })));
    const res = mockResponse();

    await approveShopRequest(req(), res);

    expect(ShopMock.create.mock.calls[0]![0][0].email).toBe("contact@kipe.gn");
  });

  it("laisse son rôle à un administrateur demandeur", async () => {
    const admin = makeUser({ role: "admin" });
    RequestMock.findById.mockReturnValue(mockQuery(makeShopRequest({ userId: admin._id })));
    UserMock.findById.mockReturnValue(mockQuery(admin));
    const res = mockResponse();

    await approveShopRequest(req(), res);

    expect(res.statusCode).toBe(200);
    expect(admin.role).toBe("admin");
    expect(LoginMock.updateOne).not.toHaveBeenCalled();
    expect(updateUserSessionsRole).not.toHaveBeenCalled();
  });

  it("approuve même si les sessions ne peuvent pas être mises à jour", async () => {
    RequestMock.findById.mockReturnValue(mockQuery(makeShopRequest()));
    vi.mocked(updateUserSessionsRole).mockRejectedValueOnce(new Error("store indisponible"));
    const res = mockResponse();

    await approveShopRequest(req(), res);

    expect(res.statusCode).toBe(200);
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it("annule la transaction sur une erreur inattendue", async () => {
    RequestMock.findById.mockReturnValue(mockQuery(makeShopRequest()));
    ShopMock.create.mockRejectedValueOnce(new Error("mongo indisponible"));
    const res = mockResponse();

    await approveShopRequest(req(), res);

    expect(res.statusCode).toBe(500);
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.commitTransaction).not.toHaveBeenCalled();
    expect(updateUserSessionsRole).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("rejectShopRequest", () => {
  const reason = "Le numéro RCCM ne correspond à aucune entreprise enregistrée.";
  const req = () => mockRequest({ params: { id: oid().toString() }, body: { reason }, user: ADMIN });

  it("renvoie 422 sans motif valable", async () => {
    failValidation(["Le motif du refus est requis."]);
    const res = mockResponse();

    await rejectShopRequest(req(), res);

    expect(res.statusCode).toBe(422);
  });

  it("renvoie 404 quand la demande n'existe pas", async () => {
    const res = mockResponse();

    await rejectShopRequest(req(), res);

    expect(res.statusCode).toBe(404);
  });

  it("refuse une demande déjà traitée", async () => {
    RequestMock.findById.mockReturnValue(mockQuery(makeShopRequest({ status: ShopRequestStatus.CANCELLED })));
    const res = mockResponse();

    await rejectShopRequest(req(), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Cette demande a déjà été traitée (annulée).");
  });

  it("enregistre le refus et son motif, puis prévient le demandeur", async () => {
    const user = makeUser();
    const request = makeShopRequest({ userId: user._id });
    RequestMock.findById.mockReturnValue(mockQuery(request));
    UserMock.findById.mockReturnValue(mockQuery(user));
    const res = mockResponse();

    await rejectShopRequest(req(), res);

    expect(res.statusCode).toBe(200);
    expect(request.status).toBe(ShopRequestStatus.REJECTED);
    expect(request.rejectionReason).toBe(reason);
    expect(request.reviewedBy?.toString()).toBe(ADMIN.id);
    expect(request.save).toHaveBeenCalled();
    expect(sendShopRequestRejectedMail).toHaveBeenCalledWith(user, request.nom, reason);
    expect(res.body.data.rejectionReason).toBe(reason);
  });
});
