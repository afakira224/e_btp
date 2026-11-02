import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

// Seuls les modèles Mongoose sont simulés : enums et constantes restent réels.
vi.mock("../../../src/models/boutique.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Shop: mockModel() };
});

vi.mock("../../../src/models/sanction.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/sanction.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, Sanction: mockModel() };
});

vi.mock("../../../src/models/supportMessage.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/supportMessage.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, SupportMessage: mockModel() };
});

vi.mock("../../../src/models/supportTicket.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/supportTicket.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, SupportTicket: mockModel() };
});

vi.mock("../../../src/models/user.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/user.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, User: mockModel() };
});

vi.mock("../../../src/shared/helpers/fileUpload.js", () => ({
  getFileUrl: vi.fn((p: string) => `/uploads/files/${p.split(/[\\/]/).pop()}`),
  deleteFileByUrl: vi.fn(),
  cleanupUploadedFiles: vi.fn(),
}));

// Les écritures ont leurs propres tests (support.service) : seuls leurs appels
// sont vérifiés ici. Qui est qui sur une demande reste calculé pour de vrai.
vi.mock("../../../src/shared/services/support.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/shared/services/support.service.js")>();
  return { ...actual, createTicket: vi.fn(), postMessage: vi.fn(), applySupportAction: vi.fn() };
});

vi.mock("express-validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("express-validator")>();
  return {
    ...actual,
    validationResult: vi.fn(() => ({ isEmpty: () => true, array: () => [] })),
  };
});

import { validationResult } from "express-validator";
import { Shop } from "../../../src/models/boutique.model.js";
import { Sanction, SanctionTargetKind, SanctionType } from "../../../src/models/sanction.model.js";
import { SupportMessage, SupportVisibility } from "../../../src/models/supportMessage.model.js";
import {
  SupportOutcome,
  SupportParty,
  SupportPriority,
  SupportTargetKind,
  SupportTicket,
  SupportTicketStatus,
  SupportTicketType,
  type ISupportTicket,
} from "../../../src/models/supportTicket.model.js";
import logger from "../../../src/shared/logger/logger.js";
import { HttpError } from "../../../src/shared/middlewares/error.middleware.js";
import { cleanupUploadedFiles } from "../../../src/shared/helpers/fileUpload.js";
import { SHOP_FORBIDDEN_MESSAGE } from "../../../src/shared/helpers/shopAccess.js";
import { SupportAction } from "../../../src/shared/helpers/support.workflow.js";
import { applySupportAction, createTicket, postMessage } from "../../../src/shared/services/support.service.js";
import {
  contactSupport,
  createSupportTicket,
  getSupportTicket,
  listSupportTickets,
  performSupportAction,
  postSupportMessage,
} from "../../../src/controllers/support.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse } from "../../helpers/express.mock.js";
import { makeSanction, makeShop, makeSupportMessage, makeSupportTicket, oid } from "../../helpers/factories.js";

const ShopMock = Shop as unknown as Record<string, any>;
const SanctionMock = Sanction as unknown as Record<string, any>;
const MessageMock = SupportMessage as unknown as Record<string, any>;
const TicketMock = SupportTicket as unknown as Record<string, any>;

const S = SupportTicketStatus;
const T = SupportTicketType;
const DAY = 24 * 60 * 60 * 1000;
const OPEN = [S.AWAITING_SHOP, S.AWAITING_REQUESTER, S.AWAITING_ADMIN];
const DONE = [S.RESOLVED, S.CLOSED];

const clientId = oid();
const ownerId = oid();
const shop = makeShop({ ownerId, nom: "Boutique Kaloum" });

type User = { id: string; entityType: string };
const CLIENT: User = { id: clientId.toString(), entityType: "user" };
const OWNER: User = { id: ownerId.toString(), entityType: "shop" };
const OTHER_OWNER: User = { id: oid().toString(), entityType: "shop" };
const ADMIN: User = { id: oid().toString(), entityType: "admin" };
const STRANGER: User = { id: oid().toString(), entityType: "user" };

const CONTACT_WARNING =
  "Votre message contient un numéro ou une adresse : ne payez jamais en dehors de la plateforme, vous ne seriez pas protégé.";

/** Une demande du client sur une commande chez la boutique de test. */
const orderTicket = (over: Record<string, unknown> = {}): ISupportTicket =>
  makeSupportTicket({
    number: "SUP-000042",
    requester: { userId: clientId, accountType: "user", name: "Aïssatou Barry", email: "aissatou@example.com" },
    target: { kind: SupportTargetKind.SHOP_ORDER, id: oid(), label: "CMD-42-1" },
    boutiqueId: shop._id,
    ...over,
  });

const uploaded = [
  { path: "uploads/files/2026-10-25/colis.jpg", originalname: "colis.jpg", mimetype: "image/jpeg", size: 2048 },
] as Express.Multer.File[];

const withFiles = (req: any, files = uploaded) => {
  req.files = files;
  return req;
};

const failValidation = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({
    isEmpty: () => false,
    array: () => messages.map((msg) => ({ msg })),
  } as any);
};

beforeEach(() => {
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);
  ShopMock.findById.mockImplementation((id: unknown) => mockQuery(String(id) === String(shop._id) ? shop : null));
  TicketMock.find.mockReturnValue(mockQuery([]));
  TicketMock.findById.mockReturnValue(mockQuery(null));
  TicketMock.countDocuments.mockReturnValue(mockQuery(0));
  MessageMock.find.mockReturnValue(mockQuery([]));
  SanctionMock.find.mockReturnValue(mockQuery([]));
});

// ─────────────────────────────────────────────
describe("createSupportTicket", () => {
  const body = { type: T.ORDER_PROBLEM, reason: "delay", description: "Ma commande devait arriver lundi.", targetId: oid().toString() };

  it("renvoie 422 et supprime les pièces jointes quand la validation échoue", async () => {
    failValidation(["Le motif est requis.", "Cible invalide."]);
    const res = mockResponse();

    await createSupportTicket(withFiles(mockRequest({ body, user: CLIENT })), res);

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toBe("Le motif est requis. | Cible invalide.");
    expect(cleanupUploadedFiles).toHaveBeenCalledWith(uploaded);
    expect(createTicket).not.toHaveBeenCalled();
  });

  it("ouvre la demande avec ses pièces jointes et la renvoie telle que le demandeur la voit", async () => {
    const ticket = orderTicket();
    vi.mocked(createTicket).mockResolvedValue({ ticket, message: makeSupportMessage(), contactWarning: false });
    const res = mockResponse();

    await createSupportTicket(withFiles(mockRequest({ body: { ...body, subject: "Colis en retard" }, user: CLIENT })), res);

    expect(createTicket).toHaveBeenCalledWith(
      CLIENT,
      { type: T.ORDER_PROBLEM, reason: "delay", description: body.description, subject: "Colis en retard", targetId: body.targetId, shopId: undefined },
      [{ url: "/uploads/files/colis.jpg", name: "colis.jpg", mimetype: "image/jpeg", size: 2048 }]
    );
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe("Demande SUP-000042 enregistrée.");
    expect(res.body.data).toMatchObject({
      id: ticket._id.toString(),
      viewer: SupportParty.REQUESTER,
      statusLabel: "Chez la boutique",
      availableActions: [SupportAction.CLOSE],
    });
    expect(res.body.data).not.toHaveProperty("warning");
    expect(cleanupUploadedFiles).not.toHaveBeenCalled();
  });

  it("avertit le demandeur qui a laissé un numéro ou une adresse", async () => {
    vi.mocked(createTicket).mockResolvedValue({ ticket: orderTicket(), message: makeSupportMessage(), contactWarning: true });
    const res = mockResponse();

    await createSupportTicket(mockRequest({ body, user: CLIENT }), res);

    expect(res.body.data.warning).toBe(CONTACT_WARNING);
  });

  it("renvoie le code du refus et supprime les pièces jointes", async () => {
    vi.mocked(createTicket).mockRejectedValue(new HttpError("Une demande est déjà ouverte pour cette commande (SUP-000003).", 409));
    const res = mockResponse();

    await createSupportTicket(withFiles(mockRequest({ body, user: CLIENT })), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ success: false, message: "Une demande est déjà ouverte pour cette commande (SUP-000003).", data: null });
    expect(cleanupUploadedFiles).toHaveBeenCalledWith(uploaded);
  });

  it("renvoie 500 et journalise une erreur inattendue", async () => {
    vi.mocked(createTicket).mockRejectedValue(new Error("base indisponible"));
    const res = mockResponse();

    await createSupportTicket(mockRequest({ body, user: CLIENT }), res);

    expect(res.statusCode).toBe(500);
    expect(logger.error).toHaveBeenCalledWith("Erreur ouverture de demande : base indisponible");
  });
});

// ─────────────────────────────────────────────
describe("contactSupport", () => {
  const body = { name: "Fatou Camara", email: "fatou@example.com", message: "Je n'arrive pas à créer mon compte." };

  it("renvoie 422 quand le formulaire est invalide", async () => {
    failValidation(["Email invalide."]);
    const res = mockResponse();

    await contactSupport(mockRequest({ body }), res);

    expect(res.statusCode).toBe(422);
    expect(createTicket).not.toHaveBeenCalled();
  });

  it("enregistre la question d'un visiteur et ne renvoie que son numéro", async () => {
    vi.mocked(createTicket).mockResolvedValue({
      ticket: makeSupportTicket({ number: "SUP-000099", type: T.GENERAL_QUESTION }),
      message: makeSupportMessage(),
      contactWarning: false,
    });
    const res = mockResponse();

    await contactSupport(mockRequest({ body: { ...body, subject: "Inscription" } }), res);

    expect(createTicket).toHaveBeenCalledWith(undefined, {
      type: T.GENERAL_QUESTION,
      reason: "usage",
      description: body.message,
      subject: "Inscription",
      guest: { name: "Fatou Camara", email: "fatou@example.com" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toEqual({ number: "SUP-000099" });
    expect(res.body.message).toBe("Message reçu (SUP-000099) : l'équipe vous répond par email sous 24 heures.");
  });

  it("garde le motif choisi par le visiteur", async () => {
    vi.mocked(createTicket).mockResolvedValue({ ticket: makeSupportTicket(), message: makeSupportMessage(), contactWarning: false });

    await contactSupport(mockRequest({ body: { ...body, reason: "payment" } }), mockResponse());

    expect(vi.mocked(createTicket).mock.calls[0]![1].reason).toBe("payment");
  });

  it("renvoie le code du refus", async () => {
    vi.mocked(createTicket).mockRejectedValue(new HttpError("Motif invalide.", 400));
    const res = mockResponse();

    await contactSupport(mockRequest({ body }), res);

    expect(res.statusCode).toBe(400);
  });
});

// ─────────────────────────────────────────────
describe("listSupportTickets", () => {
  const list = async (query: Record<string, unknown>, user: User = CLIENT) => {
    const res = mockResponse();
    await listSupportTickets(mockRequest({ query, user }), res);
    return res;
  };
  const lastFilter = () => TicketMock.find.mock.calls.at(-1)?.[0];
  /** Filtres passés à countDocuments : le total, puis un par onglet. */
  const countFilters = () => TicketMock.countDocuments.mock.calls.map((call: any[]) => call[0]);

  it("renvoie 422 quand les paramètres sont invalides", async () => {
    failValidation(["Onglet invalide."]);

    const res = await list({ tab: "archives" });

    expect(res.statusCode).toBe(422);
    expect(TicketMock.find).not.toHaveBeenCalled();
  });

  describe("mes demandes", () => {
    it("liste les demandes du compte, les plus récemment modifiées d'abord", async () => {
      const query = mockQuery([orderTicket()]);
      TicketMock.find.mockReturnValue(query);
      TicketMock.countDocuments
        .mockReturnValueOnce(mockQuery(1))
        .mockReturnValueOnce(mockQuery(1))
        .mockReturnValueOnce(mockQuery(4));

      const res = await list({});

      const base = { "requester.userId": new Types.ObjectId(CLIENT.id) };
      expect(TicketMock.find).toHaveBeenCalledWith({ $and: [base] });
      expect(query.sort).toHaveBeenCalledWith({ updatedAt: -1 });
      expect(query.skip).toHaveBeenCalledWith(0);
      expect(query.limit).toHaveBeenCalledWith(20);
      expect(countFilters()).toEqual([
        { $and: [base] },
        { $and: [base, { status: { $in: OPEN } }] },
        { $and: [base, { status: { $in: DONE } }] },
      ]);
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toMatchObject({ total: 1, page: 1, totalPages: 1, counts: { open: 1, done: 4 } });
      expect(res.body.data.tickets[0]).toMatchObject({ viewer: SupportParty.REQUESTER, statusLabel: "Chez la boutique" });
    });

    it("filtre par onglet, par type et par recherche, caractères spéciaux échappés", async () => {
      await list({ tab: "done", type: T.LISTING_REPORT, search: "  CMD-42.1 " });

      const pattern = { $regex: "CMD-42\\.1", $options: "i" };
      expect(lastFilter()).toEqual({
        $and: [
          { "requester.userId": new Types.ObjectId(CLIENT.id) },
          { status: { $in: DONE } },
          { type: T.LISTING_REPORT },
          { $or: [{ number: pattern }, { subject: pattern }, { "target.label": pattern }] },
        ],
      });
    });

    it("ignore un onglet d'une autre portée", async () => {
      await list({ tab: "urgent" });

      expect(lastFilter()).toEqual({ $and: [{ "requester.userId": new Types.ObjectId(CLIENT.id) }] });
    });

    it("pagine et plafonne la limite à 100", async () => {
      const query = mockQuery([]);
      TicketMock.find.mockReturnValue(query);
      TicketMock.countDocuments.mockReturnValue(mockQuery(250));

      const res = await list({ page: "3", limit: "500" });

      expect(query.skip).toHaveBeenCalledWith(200);
      expect(query.limit).toHaveBeenCalledWith(100);
      expect(res.body.data).toMatchObject({ total: 250, page: 3, totalPages: 3 });
    });

    it("renvoie 500 quand la lecture échoue", async () => {
      TicketMock.find.mockImplementation(() => {
        throw new Error("base indisponible");
      });

      const res = await list({});

      expect(res.statusCode).toBe(500);
      expect(logger.error).toHaveBeenCalledWith("Erreur liste des demandes : base indisponible");
    });
  });

  describe("la file de l'administration", () => {
    it("refuse la file à qui n'est pas administrateur", async () => {
      const res = await list({ scope: "admin" }, OWNER);

      expect(res.statusCode).toBe(403);
      expect(TicketMock.find).not.toHaveBeenCalled();
    });

    it("lit « À traiter » comme une file, des plus anciennes aux plus récentes", async () => {
      const query = mockQuery([orderTicket({ status: S.AWAITING_ADMIN, escalatedAt: new Date() })]);
      TicketMock.find.mockReturnValue(query);

      const res = await list({ scope: "admin", tab: "todo" }, ADMIN);

      expect(lastFilter()).toEqual({ $and: [{}, { status: S.AWAITING_ADMIN }] });
      expect(query.sort).toHaveBeenCalledWith({ createdAt: 1 });
      expect(res.body.data.tickets[0]).toMatchObject({ viewer: SupportParty.ADMIN, statusLabel: "À traiter" });
      expect(Object.keys(res.body.data.counts)).toEqual(["urgent", "todo", "reports", "waiting", "done"]);
    });

    it("isole les urgences et les signalements ouverts", async () => {
      await list({ scope: "admin", tab: "urgent" }, ADMIN);
      expect(lastFilter().$and[1]).toEqual({ priority: SupportPriority.URGENT, status: { $in: OPEN } });

      await list({ scope: "admin", tab: "reports" }, ADMIN);
      expect(lastFilter().$and[1]).toEqual({
        type: { $in: [T.LISTING_REPORT, T.SHOP_REPORT, T.REVIEW_REPORT, T.CUSTOMER_REPORT] },
        status: { $in: OPEN },
      });
    });

    it("trie les autres onglets par modification", async () => {
      const query = mockQuery([]);
      TicketMock.find.mockReturnValue(query);

      await list({ scope: "admin", tab: "waiting" }, ADMIN);

      expect(lastFilter().$and[1]).toEqual({ status: { $in: [S.AWAITING_SHOP, S.AWAITING_REQUESTER] } });
      expect(query.sort).toHaveBeenCalledWith({ updatedAt: -1 });
    });
  });

  describe("l'espace d'une boutique", () => {
    const party = { boutiqueId: shop._id, type: { $in: [T.ORDER_PROBLEM, T.RETURN] } };
    const own = { requesterShopId: shop._id };

    it("exige la boutique, existante, gérée par le compte", async () => {
      expect((await list({ scope: "shop" }, OWNER)).body.message).toBe("Précisez la boutique dont vous lisez les demandes.");
      expect((await list({ scope: "shop", boutiqueId: oid().toString() }, OWNER)).statusCode).toBe(404);

      const res = await list({ scope: "shop", boutiqueId: shop._id.toString() }, OTHER_OWNER);
      expect(res.statusCode).toBe(403);
      expect(res.body.message).toBe(SHOP_FORBIDDEN_MESSAGE);
      expect(TicketMock.find).not.toHaveBeenCalled();
    });

    it("montre les demandes où la boutique est partie et celles qu'elle a ouvertes, jamais les signalements qui la visent", async () => {
      await list({ scope: "shop", boutiqueId: shop._id.toString() }, OWNER);

      expect(lastFilter()).toEqual({ $and: [{ $or: [party, own] }] });
    });

    it("met dans « À traiter » ce qu'on attend de la boutique, partie ou demandeuse", async () => {
      const res = await list({ scope: "shop", boutiqueId: shop._id.toString(), tab: "todo" }, OWNER);

      expect(lastFilter().$and[1]).toEqual({
        $or: [
          { ...party, status: S.AWAITING_SHOP },
          { ...own, status: S.AWAITING_REQUESTER },
        ],
      });
      expect(Object.keys(res.body.data.counts)).toEqual(["todo", "waiting", "admin", "done"]);
    });

    it("montre chaque demande depuis la place de la boutique sur elle", async () => {
      const asParty = orderTicket();
      const asRequester = makeSupportTicket({
        type: T.CUSTOMER_REPORT,
        status: S.AWAITING_REQUESTER,
        requester: { userId: ownerId, accountType: "shop", name: "Ibrahima Sow" },
        requesterShopId: shop._id,
      });
      TicketMock.find.mockReturnValue(mockQuery([asParty, asRequester]));

      const res = await list({ scope: "shop", boutiqueId: shop._id.toString() }, OWNER);

      const [first, second] = res.body.data.tickets;
      expect(first).toMatchObject({ viewer: SupportParty.SHOP, statusLabel: "À vous de répondre", availableActions: [SupportAction.PROPOSE, SupportAction.ESCALATE] });
      expect(second).toMatchObject({ viewer: SupportParty.REQUESTER, statusLabel: "À vous de répondre", availableActions: [SupportAction.CLOSE] });
    });
  });
});

// ─────────────────────────────────────────────
describe("getSupportTicket", () => {
  const read = async (ticket: ISupportTicket | null, user: User) => {
    TicketMock.findById.mockReturnValue(mockQuery(ticket));
    const res = mockResponse();
    await getSupportTicket(mockRequest({ params: { id: ticket ? String(ticket._id) : oid().toString() }, user }), res);
    return res;
  };

  const messages = (ticket: ISupportTicket) => [
    makeSupportMessage({ ticketId: ticket._id, body: "Où est mon colis ?" }),
    makeSupportMessage({
      ticketId: ticket._id,
      author: { userId: oid(), party: SupportParty.ADMIN, name: "Équipe de la plateforme" },
      visibility: SupportVisibility.INTERNAL,
      body: "Troisième plainte contre cette boutique.",
    }),
  ];

  it("renvoie 422 quand l'identifiant est invalide", async () => {
    failValidation(["Identifiant de demande invalide."]);
    const res = mockResponse();

    await getSupportTicket(mockRequest({ params: { id: "SUP-1" }, user: CLIENT }), res);

    expect(res.statusCode).toBe(422);
  });

  it("renvoie 404 quand la demande n'existe pas", async () => {
    const res = await read(null, CLIENT);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Demande introuvable.");
  });

  it("renvoie 403 à qui ne participe pas", async () => {
    const res = await read(orderTicket(), STRANGER);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Vous ne participez pas à cette demande.");
  });

  it("montre au demandeur le fil public, dans l'ordre, sans dossier", async () => {
    const ticket = orderTicket();
    const query = mockQuery(messages(ticket));
    MessageMock.find.mockReturnValue(query);

    const res = await read(ticket, CLIENT);

    expect(MessageMock.find).toHaveBeenCalledWith({ ticketId: ticket._id });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.viewer).toBe(SupportParty.REQUESTER);
    expect(res.body.data.messages.map((m: any) => m.body)).toEqual(["Où est mon colis ?"]);
    expect(res.body.data).not.toHaveProperty("dossier");
    expect(SanctionMock.find).not.toHaveBeenCalled();
  });

  it("montre la demande à la boutique partie, sans notes internes", async () => {
    const ticket = orderTicket();
    MessageMock.find.mockReturnValue(mockQuery(messages(ticket)));

    const res = await read(ticket, OWNER);

    expect(res.body.data.viewer).toBe(SupportParty.SHOP);
    expect(res.body.data.messages).toHaveLength(1);
  });

  it("donne à l'administration les notes internes et le dossier de la cible", async () => {
    const offerId = oid();
    const ticket = makeSupportTicket({
      type: T.LISTING_REPORT,
      reason: "counterfeit",
      status: S.AWAITING_ADMIN,
      target: { kind: SupportTargetKind.OFFER, id: offerId, label: "Galaxy A15 — Boutique Kaloum" },
      boutiqueId: shop._id,
    });
    MessageMock.find.mockReturnValue(mockQuery(messages(ticket)));
    const earlier = makeSupportTicket({
      number: "SUP-000010",
      type: T.SHOP_REPORT,
      reason: "scam",
      status: S.CLOSED,
      resolution: { outcome: SupportOutcome.REJECTED, by: SupportParty.ADMIN, at: new Date() },
    });
    const relatedQuery = mockQuery([earlier]);
    TicketMock.find.mockReturnValue(relatedQuery);
    const warning = makeSanction({
      type: SanctionType.WARNING,
      target: { kind: SanctionTargetKind.SHOP, id: shop._id, label: "Boutique Kaloum" },
      startsAt: new Date(Date.now() - 30 * DAY),
    });
    SanctionMock.find.mockReturnValue(mockQuery([warning]));

    const res = await read(ticket, ADMIN);

    expect(res.body.data.messages).toHaveLength(2);
    expect(TicketMock.find).toHaveBeenCalledWith({ $or: [{ "target.id": offerId }, { boutiqueId: shop._id }], _id: { $ne: ticket._id } });
    expect(relatedQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(relatedQuery.limit).toHaveBeenCalledWith(20);
    expect(SanctionMock.find).toHaveBeenCalledWith({
      $or: [
        { "target.kind": SanctionTargetKind.OFFER, "target.id": offerId },
        { "target.kind": SanctionTargetKind.SHOP, "target.id": shop._id },
      ],
    });
    expect(res.body.data.dossier).toEqual({
      tickets: [
        {
          id: earlier._id.toString(),
          number: "SUP-000010",
          type: T.SHOP_REPORT,
          reason: "scam",
          status: S.CLOSED,
          outcome: SupportOutcome.REJECTED,
          createdAt: earlier.createdAt,
        },
      ],
      sanctions: [expect.objectContaining({ id: warning._id.toString(), type: SanctionType.WARNING, state: "active" })],
      // Déjà averti : la mesure suivante du barème est une suspension de 7 jours.
      suggestion: { shop: { type: SanctionType.SUSPENSION, days: 7 } },
    });
  });

  it("suggère une mesure contre un client signalé", async () => {
    const ticket = makeSupportTicket({
      type: T.CUSTOMER_REPORT,
      status: S.AWAITING_ADMIN,
      target: { kind: SupportTargetKind.USER, id: clientId, label: "Aïssatou Barry (commande CMD-42-1)" },
      requesterShopId: shop._id,
    });

    const res = await read(ticket, ADMIN);

    expect(SanctionMock.find).toHaveBeenCalledWith({ $or: [{ "target.kind": SanctionTargetKind.USER, "target.id": clientId }] });
    expect(res.body.data.dossier.suggestion).toEqual({ user: { type: SanctionType.WARNING } });
  });

  it("ouvre un dossier vide pour une question sans cible", async () => {
    const ticket = makeSupportTicket({ type: T.GENERAL_QUESTION, reason: "account", status: S.AWAITING_ADMIN });

    const res = await read(ticket, ADMIN);

    expect(TicketMock.find).not.toHaveBeenCalled();
    expect(SanctionMock.find).not.toHaveBeenCalled();
    expect(res.body.data.dossier).toEqual({ tickets: [], sanctions: [], suggestion: {} });
  });
});

// ─────────────────────────────────────────────
describe("postSupportMessage", () => {
  const send = async (body: Record<string, unknown>, user: User = CLIENT, files?: Express.Multer.File[]) => {
    const res = mockResponse();
    const req = mockRequest({ params: { id: "507f1f77bcf86cd799439011" }, body, user });
    await postSupportMessage(files ? withFiles(req, files) : req, res);
    return res;
  };

  it("renvoie 422 et supprime les pièces jointes quand la validation échoue", async () => {
    failValidation(["Message : 1 à 2 000 caractères."]);

    const res = await send({ body: "" }, CLIENT, uploaded);

    expect(res.statusCode).toBe(422);
    expect(cleanupUploadedFiles).toHaveBeenCalledWith(uploaded);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("écrit le message avec ses pièces jointes et renvoie la demande à jour", async () => {
    const ticket = orderTicket({ status: S.AWAITING_REQUESTER });
    vi.mocked(postMessage).mockResolvedValue({ ticket, message: makeSupportMessage(), contactWarning: false } as any);
    MessageMock.find.mockReturnValue(mockQuery([makeSupportMessage({ body: "Le colis part demain." })]));

    const res = await send({ body: "Le colis part demain." }, OWNER, uploaded);

    expect(postMessage).toHaveBeenCalledWith(
      OWNER,
      "507f1f77bcf86cd799439011",
      { body: "Le colis part demain.", internal: false, waitFor: undefined },
      [{ url: "/uploads/files/colis.jpg", name: "colis.jpg", mimetype: "image/jpeg", size: 2048 }]
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Message envoyé.");
    expect(res.body.data).toMatchObject({ viewer: SupportParty.SHOP, statusLabel: "Chez le client" });
    expect(res.body.data.messages).toHaveLength(1);
  });

  it("ne tient pour note interne qu'un vrai booléen, et ignore une réponse attendue vide", async () => {
    vi.mocked(postMessage).mockResolvedValue({ ticket: orderTicket(), message: makeSupportMessage(), contactWarning: false } as any);

    await send({ body: "Note", internal: "true", waitFor: "" }, ADMIN);
    expect(vi.mocked(postMessage).mock.calls.at(-1)![2]).toEqual({ body: "Note", internal: false, waitFor: undefined });

    await send({ body: "Une photo ?", internal: true, waitFor: SupportParty.REQUESTER }, ADMIN);
    expect(vi.mocked(postMessage).mock.calls.at(-1)![2]).toEqual({ body: "Une photo ?", internal: true, waitFor: SupportParty.REQUESTER });
  });

  it("avertit l'auteur d'un message contenant un moyen de contact", async () => {
    vi.mocked(postMessage).mockResolvedValue({ ticket: orderTicket(), message: makeSupportMessage(), contactWarning: true } as any);

    const res = await send({ body: "Appelez le 622 12 34 56" });

    expect(res.body.data.warning).toBe(CONTACT_WARNING);
  });

  it("renvoie le code du refus et supprime les pièces jointes", async () => {
    vi.mocked(postMessage).mockRejectedValue(new HttpError("Vous ne participez pas à cette demande.", 403));

    const res = await send({ body: "Bonjour" }, STRANGER, uploaded);

    expect(res.statusCode).toBe(403);
    expect(cleanupUploadedFiles).toHaveBeenCalledWith(uploaded);
  });
});

// ─────────────────────────────────────────────
describe("performSupportAction", () => {
  const perform = async (action: string, body: Record<string, unknown> = {}, user: User = CLIENT) => {
    const res = mockResponse();
    await performSupportAction(mockRequest({ params: { id: "507f1f77bcf86cd799439011", action }, body, user }), res);
    return res;
  };

  it("renvoie 422 quand l'action ou la saisie est invalide", async () => {
    failValidation(["Action inconnue."]);

    const res = await perform("refund");

    expect(res.statusCode).toBe(422);
    expect(applySupportAction).not.toHaveBeenCalled();
  });

  it("applique l'action et renvoie la demande à jour avec son fil", async () => {
    const ticket = orderTicket({ status: S.AWAITING_REQUESTER, proposal: { kind: "refund", details: "Remboursement", status: "pending", at: new Date(), by: ownerId } });
    vi.mocked(applySupportAction).mockResolvedValue(ticket);
    MessageMock.find.mockReturnValue(mockQuery([makeSupportMessage()]));

    const res = await perform("propose", { kind: "refund", details: "Remboursement" }, OWNER);

    expect(applySupportAction).toHaveBeenCalledWith(OWNER, "507f1f77bcf86cd799439011", "propose", {
      kind: "refund",
      details: "Remboursement",
      outcome: undefined,
      note: undefined,
      reason: undefined,
      rating: undefined,
      comment: undefined,
      assignee: undefined,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Demande mise à jour.");
    expect(res.body.data).toMatchObject({ viewer: SupportParty.SHOP, proposal: { kindLabel: "Remboursement" } });
    expect(res.body.data.messages).toHaveLength(1);
  });

  it("ne transmet que des textes et une note numérique", async () => {
    vi.mocked(applySupportAction).mockResolvedValue(orderTicket({ status: S.RESOLVED }));

    await perform("rate", { rating: "5", comment: ["Merci"], note: 42 });
    expect(vi.mocked(applySupportAction).mock.calls.at(-1)![3]).toMatchObject({ rating: undefined, comment: undefined, note: undefined });

    await perform("rate", { rating: 4, comment: "Merci" });
    expect(vi.mocked(applySupportAction).mock.calls.at(-1)![3]).toMatchObject({ rating: 4, comment: "Merci" });
  });

  it("transmet la décision de l'administration", async () => {
    vi.mocked(applySupportAction).mockResolvedValue(orderTicket({ status: S.RESOLVED }));

    await perform("resolve", { outcome: SupportOutcome.UPHELD, note: "La boutique rembourse.", assignee: ADMIN.id }, ADMIN);

    expect(vi.mocked(applySupportAction).mock.calls[0]![3]).toMatchObject({
      outcome: SupportOutcome.UPHELD,
      note: "La boutique rembourse.",
      assignee: ADMIN.id,
    });
  });

  it("renvoie le refus des règles en 400", async () => {
    vi.mocked(applySupportAction).mockRejectedValue(new HttpError("Seule l'administration tranche une demande.", 400));

    const res = await perform("resolve", { outcome: SupportOutcome.UPHELD });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Seule l'administration tranche une demande.");
  });

  it("renvoie 500 et journalise l'action en échec", async () => {
    vi.mocked(applySupportAction).mockRejectedValue(new Error("transaction interrompue"));

    const res = await perform("close");

    expect(res.statusCode).toBe(500);
    expect(logger.error).toHaveBeenCalledWith("Erreur action close sur une demande : transaction interrompue");
  });
});
