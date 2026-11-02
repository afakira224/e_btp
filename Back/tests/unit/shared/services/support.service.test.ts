import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import mongoose, { Types } from "mongoose";

// Seuls les modèles Mongoose sont simulés : enums et constantes restent réels.
vi.mock("../../../../src/models/boutique.model.js", async () => {
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { Shop: mockModel() };
});

vi.mock("../../../../src/models/product.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/product.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, Product: mockModel(), productBoutique: mockModel() };
});

vi.mock("../../../../src/models/review.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/review.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, Review: mockModel() };
});

vi.mock("../../../../src/models/sanction.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/sanction.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, Sanction: mockModel() };
});

vi.mock("../../../../src/models/shopOrder.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/shopOrder.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, ShopOrder: mockModel() };
});

vi.mock("../../../../src/models/supportMessage.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/supportMessage.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, SupportMessage: mockModel() };
});

vi.mock("../../../../src/models/supportTicket.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/supportTicket.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, SupportTicket: mockModel() };
});

vi.mock("../../../../src/models/user.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/user.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, User: mockModel() };
});

vi.mock("../../../../src/models/counter.model.js", () => ({
  nextSequence: vi.fn(async () => 7),
}));

vi.mock("../../../../src/shared/helpers/mail.helper.js", () => ({
  sendNoticeMail: vi.fn(() => 1),
}));

// Les sanctions ont leurs propres tests : seuls les appels sont vérifiés ici.
vi.mock("../../../../src/shared/services/sanction.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/shared/services/sanction.service.js")>();
  return { ...actual, applySanction: vi.fn(), liftSanction: vi.fn() };
});

// Avis : construits pour de vrai, envoyés pour de faux.
vi.mock("../../../../src/shared/services/support.notifications.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/shared/services/support.notifications.js")>();
  return { ...actual, deliverSupportNotices: vi.fn(async () => undefined) };
});

import { Shop } from "../../../../src/models/boutique.model.js";
import { nextSequence } from "../../../../src/models/counter.model.js";
import { Product, productBoutique } from "../../../../src/models/product.model.js";
import { Review } from "../../../../src/models/review.model.js";
import { Sanction, SanctionTargetKind, SanctionType } from "../../../../src/models/sanction.model.js";
import { ShopOrder, ShopOrderStatus } from "../../../../src/models/shopOrder.model.js";
import { SupportMessage, SupportMessageKind, SupportVisibility } from "../../../../src/models/supportMessage.model.js";
import {
  SupportOutcome,
  SupportParty,
  SupportPriority,
  SupportTargetKind,
  SupportTicket,
  SupportTicketStatus,
  SupportTicketType,
  type ISupportTicket,
} from "../../../../src/models/supportTicket.model.js";
import { EntityType, User } from "../../../../src/models/user.model.js";
import logger from "../../../../src/shared/logger/logger.js";
import { sendNoticeMail } from "../../../../src/shared/helpers/mail.helper.js";
import { HttpError } from "../../../../src/shared/middlewares/error.middleware.js";
import type { AuthUser } from "../../../../src/shared/middlewares/auth.middleware.js";
import { SupportAction, type SupportActionInput } from "../../../../src/shared/helpers/support.workflow.js";
import { applySanction, liftSanction } from "../../../../src/shared/services/sanction.service.js";
import { deliverSupportNotices, type SupportNotice } from "../../../../src/shared/services/support.notifications.js";
import {
  applySupportAction,
  createTicket,
  postMessage,
  runSupportDeadlines,
  startSupportScheduler,
  stopSupportScheduler,
  supportParties,
  toAttachments,
  viewerOf,
  type CreateTicketInput,
  type PostMessageInput,
} from "../../../../src/shared/services/support.service.js";
import { mockQuery } from "../../../helpers/model.mock.js";
import { mockSession } from "../../../helpers/express.mock.js";
import {
  makeProduct,
  makeProductBoutique,
  makeReview,
  makeSanction,
  makeShop,
  makeShopOrder,
  makeSupportMessage,
  makeSupportTicket,
  makeUser,
  oid,
} from "../../../helpers/factories.js";

const ShopMock = Shop as unknown as Record<string, any>;
const ProductMock = Product as unknown as Record<string, any>;
const PbMock = productBoutique as unknown as Record<string, any>;
const ReviewMock = Review as unknown as Record<string, any>;
const SanctionMock = Sanction as unknown as Record<string, any>;
const ShopOrderMock = ShopOrder as unknown as Record<string, any>;
const MessageMock = SupportMessage as unknown as Record<string, any>;
const TicketMock = SupportTicket as unknown as Record<string, any>;
const UserMock = User as unknown as Record<string, any>;

const { REQUESTER, SHOP, ADMIN, SYSTEM } = SupportParty;
const S = SupportTicketStatus;
const T = SupportTicketType;
const A = SupportAction;
const NOW = new Date("2026-10-25T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const later = (ms: number) => new Date(NOW.getTime() + ms);

// ── Les personnes ───────────────────────────
const clientId = oid();
const ownerId = oid();
const adminId = oid();
const client = makeUser({ _id: clientId, prenom: "Aïssatou", nom: "Barry", email: "aissatou@example.com", role: EntityType.USER });
const owner = makeUser({ _id: ownerId, prenom: "Ibrahima", nom: "Sow", email: "ibrahima@kaloum.gn", role: EntityType.SHOP });
const admin = makeUser({ _id: adminId, prenom: "Kadiatou", nom: "Bah", role: EntityType.ADMIN });
const shop = makeShop({ ownerId, nom: "Boutique Kaloum" });

const CLIENT: AuthUser = { id: clientId.toString(), entityType: EntityType.USER };
const OWNER: AuthUser = { id: ownerId.toString(), entityType: EntityType.SHOP };
const OTHER_OWNER: AuthUser = { id: oid().toString(), entityType: EntityType.SHOP };
const ADMIN_USER: AuthUser = { id: adminId.toString(), entityType: EntityType.ADMIN };
const STRANGER: AuthUser = { id: oid().toString(), entityType: EntityType.USER };

let session: ReturnType<typeof mockSession>;

/** Recherche par identifiant parmi les documents fournis. */
const byId = (docs: any[]) => (id: unknown) => mockQuery(docs.find((d) => String(d._id) === String(id)) ?? null);

/** Dernière demande et derniers messages enregistrés. */
const createdTicket = (): any => TicketMock.create.mock.calls.at(-1)?.[0][0];
const createdMessages = (): any[] => MessageMock.create.mock.calls.at(-1)?.[0] ?? [];

/** Avis transmis au dernier envoi. */
const delivered = (): SupportNotice[] => vi.mocked(deliverSupportNotices).mock.calls.at(-1)?.[0] ?? [];
const recipients = () => delivered().map((notice) => notice.recipient);

/** Une demande sur une commande du client, chez la boutique de test. */
const orderTicket = (over: Record<string, unknown> = {}): ISupportTicket =>
  makeSupportTicket({
    number: "SUP-000042",
    type: T.ORDER_PROBLEM,
    status: S.AWAITING_SHOP,
    requester: { userId: clientId, accountType: "user", name: "Aïssatou Barry", email: "aissatou@example.com" },
    target: { kind: SupportTargetKind.SHOP_ORDER, id: oid(), label: "CMD-42-1" },
    boutiqueId: shop._id,
    ...over,
  });

const givenTicket = (ticket: ISupportTicket) => {
  const query = mockQuery(ticket);
  TicketMock.findById.mockReturnValue(query);
  return query;
};

beforeEach(() => {
  session = mockSession();
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
  vi.mocked(nextSequence).mockResolvedValue(7);
  vi.mocked(deliverSupportNotices).mockResolvedValue(undefined);
  vi.mocked(applySanction).mockResolvedValue(makeSanction() as any);
  vi.mocked(liftSanction).mockResolvedValue(makeSanction() as any);

  UserMock.findById.mockImplementation(byId([client, owner, admin]));
  ShopMock.findById.mockImplementation(byId([shop]));
  ShopOrderMock.findById.mockReturnValue(mockQuery(null));
  PbMock.findById.mockReturnValue(mockQuery(null));
  ProductMock.findById.mockReturnValue(mockQuery(null));
  ReviewMock.findById.mockReturnValue(mockQuery(null));
  SanctionMock.findById.mockReturnValue(mockQuery(null));
  SanctionMock.findOne.mockReturnValue(mockQuery(null));

  TicketMock.findOne.mockReturnValue(mockQuery(null));
  TicketMock.findById.mockReturnValue(mockQuery(null));
  TicketMock.find.mockReturnValue(mockQuery([]));
  TicketMock.countDocuments.mockReturnValue(mockQuery(0));
  TicketMock.distinct.mockReturnValue(mockQuery([]));
  TicketMock.create.mockImplementation(async (docs: any[]) => docs.map((d) => makeSupportTicket(d)));
  MessageMock.create.mockImplementation(async (docs: any[]) => docs.map((d) => makeSupportMessage(d)));
});

// ─────────────────────────────────────────────
describe("supportParties — qui est qui sur une demande", () => {
  it("ne reconnaît personne sans session", async () => {
    await expect(supportParties(undefined, orderTicket())).resolves.toEqual([]);
  });

  it("reconnaît le demandeur à son compte", async () => {
    await expect(supportParties(CLIENT, orderTicket())).resolves.toEqual([REQUESTER]);
  });

  it("reconnaît l'administration sans lire de boutique", async () => {
    await expect(supportParties(ADMIN_USER, orderTicket())).resolves.toEqual([ADMIN]);
    expect(ShopMock.findById).not.toHaveBeenCalled();
  });

  it("reconnaît le gérant de la boutique partie, dans la transaction s'il y en a une", async () => {
    const query = mockQuery(shop);
    ShopMock.findById.mockReturnValue(query);

    await expect(supportParties(OWNER, orderTicket(), session as any)).resolves.toEqual([SHOP]);
    expect(ShopMock.findById).toHaveBeenCalledWith(String(shop._id));
    expect(query.session).toHaveBeenCalledWith(session);
  });

  it("ne reconnaît pas le gérant d'une autre boutique", async () => {
    await expect(supportParties(OTHER_OWNER, orderTicket())).resolves.toEqual([]);
  });

  it("reconnaît une boutique demandeuse à la boutique au nom de laquelle elle écrit", async () => {
    const report = makeSupportTicket({ type: T.CUSTOMER_REPORT, requester: { userId: oid(), accountType: "shop", name: "Ibrahima Sow" }, requesterShopId: shop._id });

    await expect(supportParties(OWNER, report)).resolves.toEqual([REQUESTER]);
  });

  it("ne fait pas de la boutique visée par un signalement une partie", async () => {
    const report = makeSupportTicket({ type: T.LISTING_REPORT, boutiqueId: shop._id });

    await expect(supportParties(OWNER, report)).resolves.toEqual([]);
  });
});

describe("viewerOf", () => {
  it("lit d'abord en administration, puis en boutique, puis en demandeur", () => {
    expect(viewerOf([REQUESTER, ADMIN])).toBe(ADMIN);
    expect(viewerOf([REQUESTER, SHOP])).toBe(SHOP);
    expect(viewerOf([REQUESTER])).toBe(REQUESTER);
    expect(viewerOf([])).toBeNull();
  });
});

describe("toAttachments", () => {
  it("décrit chaque fichier téléversé par son adresse publique", () => {
    const files = [{ path: "uploads/files/a.pdf", originalname: "facture.pdf", mimetype: "application/pdf", size: 4096 }] as Express.Multer.File[];

    expect(toAttachments(files, (p) => `/${p}`)).toEqual([
      { url: "/uploads/files/a.pdf", name: "facture.pdf", mimetype: "application/pdf", size: 4096 },
    ]);
  });
});

// ─────────────────────────────────────────────
describe("createTicket — contrôles communs", () => {
  const question = (over: Partial<CreateTicketInput> = {}): CreateTicketInput => ({
    type: T.GENERAL_QUESTION,
    reason: "account",
    description: "Comment changer mon adresse email ?",
    ...over,
  });

  it("exige une session, sauf pour une question d'un visiteur", async () => {
    await expect(createTicket(undefined, question(), [], NOW)).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      createTicket(undefined, { ...question(), type: T.ORDER_PROBLEM, reason: "delay", guest: { name: "Fatou", email: "f@example.com" } }, [], NOW)
    ).rejects.toMatchObject({ statusCode: 401, message: "Session absente ou expirée, veuillez vous connecter." });
    expect(TicketMock.create).not.toHaveBeenCalled();
  });

  it("refuse une clé héritée d'Object comme motif", async () => {
    await expect(createTicket(CLIENT, question({ type: T.ORDER_PROBLEM, reason: "toString" }), [], NOW)).rejects.toMatchObject({ statusCode: 400 });
    await expect(createTicket(CLIENT, question({ type: T.ORDER_PROBLEM, reason: "constructor" }), [], NOW)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuse un motif qui n'existe pas pour ce type, en donnant la liste", async () => {
    const attempt = createTicket(CLIENT, question({ type: T.ORDER_PROBLEM, reason: "scam" }), [], NOW);

    await expect(attempt).rejects.toBeInstanceOf(HttpError);
    await expect(attempt).rejects.toMatchObject({
      statusCode: 400,
      message: "Motif invalide. Valeurs acceptées : delay, not_received, shop_unreachable, refund_not_received, other.",
    });
  });

  it("exige quelques phrases pour le motif « Autre »", async () => {
    await expect(createTicket(CLIENT, question({ reason: "other", description: "  Un souci.  " }), [], NOW)).rejects.toMatchObject({
      statusCode: 400,
      message: "Décrivez le problème en quelques phrases (20 caractères au moins).",
    });
    await expect(createTicket(CLIENT, question({ reason: "other", description: "Je ne reçois plus aucun email." }), [], NOW)).resolves.toBeDefined();
  });

  it("refuse un type qui ne s'ouvre pas directement", async () => {
    await expect(createTicket(CLIENT, question({ type: T.RETURN, reason: "damaged" }), [], NOW)).rejects.toMatchObject({
      statusCode: 400,
      message: "Ce type de demande ne s'ouvre pas ici.",
    });
  });

  it("renvoie 404 quand le compte a disparu", async () => {
    await expect(createTicket(STRANGER, question(), [], NOW)).rejects.toMatchObject({ statusCode: 404, message: "Compte introuvable." });
  });

  it("enregistre la question d'un visiteur sans compte, à son nom et à son email", async () => {
    const { ticket, message } = await createTicket(
      undefined,
      question({ reason: "usage", guest: { name: "Fatou Camara", email: "fatou@example.com" } }),
      [],
      NOW
    );

    expect(UserMock.findById).not.toHaveBeenCalled();
    expect(createdTicket().requester).toEqual({ userId: null, accountType: "guest", name: "Fatou Camara", email: "fatou@example.com" });
    expect(createdMessages()[0].author).toEqual({ userId: null, party: REQUESTER, name: "Fatou Camara" });
    expect(ticket.status).toBe(S.AWAITING_ADMIN);
    expect(message.body).toBe("Comment changer mon adresse email ?");
  });

  it("titre une question d'après son motif et prévient l'administration", async () => {
    await createTicket(CLIENT, question(), [], NOW);

    expect(createdTicket()).toMatchObject({
      subject: "Mon compte",
      target: null,
      boutiqueId: null,
      requesterShopId: null,
      status: S.AWAITING_ADMIN,
      deadlineAt: later(72 * HOUR),
      reminderAt: later(24 * HOUR),
    });
    expect(recipients()).toEqual(["requester", "admin"]);
  });

  it("laisse un gérant écrire au nom de sa boutique, pas d'une autre", async () => {
    await createTicket(OWNER, question({ shopId: shop._id.toString() }), [], NOW);
    expect(createdTicket()).toMatchObject({ requesterShopId: shop._id, requester: { accountType: EntityType.SHOP } });

    await expect(createTicket(OTHER_OWNER, question({ shopId: shop._id.toString() }), [], NOW)).rejects.toMatchObject({
      statusCode: 403,
      message: "Vous ne pouvez écrire qu'au nom de vos boutiques.",
    });
    await expect(createTicket(OWNER, question({ shopId: oid().toString() }), [], NOW)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("garde l'objet saisi, nettoyé", async () => {
    await createTicket(CLIENT, question({ subject: "  Changer d'email  " }), [], NOW);

    expect(createdTicket().subject).toBe("Changer d'email");
  });

  it("enregistre la demande et son premier message dans une seule transaction", async () => {
    const files = [{ url: "/uploads/files/capture.png", name: "capture.png", mimetype: "image/png", size: 1000 }];

    const { ticket } = await createTicket(CLIENT, question({ description: "  Comment changer mon adresse email ?  " }), files, NOW);

    expect(TicketMock.create.mock.calls[0]![1]).toEqual({ session });
    expect(MessageMock.create.mock.calls[0]![1]).toEqual({ session });
    expect(createdMessages()[0]).toEqual({
      ticketId: ticket._id,
      author: { userId: clientId, party: REQUESTER, name: "Aïssatou Barry" },
      visibility: SupportVisibility.PUBLIC,
      kind: SupportMessageKind.MESSAGE,
      body: "Comment changer mon adresse email ?",
      attachments: files,
      containsContact: false,
    });
    expect(session.commitTransaction).toHaveBeenCalledOnce();
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it("annule la transaction et ne prévient personne si le message ne s'enregistre pas", async () => {
    MessageMock.create.mockRejectedValueOnce(new Error("disque plein"));

    await expect(createTicket(CLIENT, question(), [], NOW)).rejects.toThrow("disque plein");
    expect(session.abortTransaction).toHaveBeenCalledOnce();
    expect(session.commitTransaction).not.toHaveBeenCalled();
    expect(deliverSupportNotices).not.toHaveBeenCalled();
  });

  it("lève une erreur quand la demande n'a pas pu être créée", async () => {
    TicketMock.create.mockResolvedValueOnce([]);

    await expect(createTicket(CLIENT, question(), [], NOW)).rejects.toThrow("La demande n'a pas pu être enregistrée.");
    expect(session.abortTransaction).toHaveBeenCalledOnce();
  });

  it("signale un numéro ou un email dans la description", async () => {
    const result = await createTicket(CLIENT, question({ description: "Rappelez-moi au 622 12 34 56 s'il vous plaît." }), [], NOW);

    expect(createdMessages()[0].containsContact).toBe(true);
    expect(result.contactWarning).toBe(true);
  });
});

// ─────────────────────────────────────────────
describe("createTicket — problème de commande", () => {
  const ourPart = (over: Record<string, unknown> = {}) =>
    makeShopOrder({ userId: clientId, boutiqueId: shop._id, reference: "CMD-42-1", status: ShopOrderStatus.SHIPPED, ...over });

  const report = (targetId: string | undefined, over: Partial<CreateTicketInput> = {}) =>
    createTicket(CLIENT, { type: T.ORDER_PROBLEM, reason: "delay", description: "Ma commande devait arriver lundi.", targetId, ...over }, [], NOW);

  const givenPart = (part: any) => ShopOrderMock.findById.mockImplementation(byId([part]));

  it("exige une commande valide", async () => {
    await expect(report(undefined)).rejects.toMatchObject({ statusCode: 400, message: "Précisez ce que vous signalez." });
    await expect(report("CMD-42-1")).rejects.toMatchObject({ statusCode: 400 });
    await expect(report(oid().toString())).rejects.toMatchObject({ statusCode: 404, message: "Commande introuvable." });
  });

  it("refuse la commande d'un autre client", async () => {
    const part = ourPart({ userId: oid() });
    givenPart(part);

    await expect(report(part._id.toString())).rejects.toMatchObject({
      statusCode: 403,
      message: "Vous ne pouvez signaler un problème que sur vos commandes.",
    });
  });

  it("refuse une commande qui attend encore son paiement", async () => {
    const part = ourPart({ status: ShopOrderStatus.AWAITING_PAYMENT });
    givenPart(part);

    await expect(report(part._id.toString())).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuse un problème plus de 30 jours après la dernière livraison", async () => {
    const part = ourPart({
      status: ShopOrderStatus.COMPLETED,
      statusHistory: [{ status: ShopOrderStatus.DELIVERED, changedAt: ago(31 * DAY) }],
    });
    givenPart(part);

    await expect(report(part._id.toString())).rejects.toMatchObject({
      statusCode: 400,
      message: "Plus de 30 jours ont passé : posez plutôt une question à l'équipe de la plateforme.",
    });
  });

  it("compte les 30 jours depuis la livraison la plus récente", async () => {
    const part = ourPart({
      status: ShopOrderStatus.DELIVERED,
      statusHistory: [
        { status: ShopOrderStatus.DELIVERED, changedAt: ago(40 * DAY) },
        { status: ShopOrderStatus.DELIVERED, changedAt: ago(5 * DAY) },
      ],
    });
    givenPart(part);

    await expect(report(part._id.toString())).resolves.toBeDefined();
  });

  it("compte les 30 jours depuis la fin d'une commande jamais livrée", async () => {
    const part = ourPart({ status: ShopOrderStatus.CANCELLED, updatedAt: ago(31 * DAY) });
    givenPart(part);

    await expect(report(part._id.toString())).rejects.toMatchObject({ statusCode: 400 });
  });

  it("accepte sans limite de date une commande encore en cours", async () => {
    const part = ourPart({ status: ShopOrderStatus.SHIPPED, updatedAt: ago(60 * DAY) });
    givenPart(part);

    await expect(report(part._id.toString())).resolves.toBeDefined();
  });

  it("refuse une seconde demande ouverte sur la même commande", async () => {
    const part = ourPart();
    givenPart(part);
    TicketMock.findOne.mockReturnValue(mockQuery(makeSupportTicket({ number: "SUP-000003" })));

    await expect(report(part._id.toString())).rejects.toMatchObject({
      statusCode: 409,
      message: "Une demande est déjà ouverte pour cette commande (SUP-000003).",
    });
    expect(TicketMock.findOne).toHaveBeenCalledWith({
      type: T.ORDER_PROBLEM,
      "target.id": part._id,
      status: { $in: [S.AWAITING_SHOP, S.AWAITING_REQUESTER, S.AWAITING_ADMIN] },
    });
  });

  it("ouvre la demande chez la boutique, 48 heures pour répondre, et prévient client et boutique", async () => {
    const part = ourPart();
    givenPart(part);

    const { ticket, contactWarning } = await report(part._id.toString());

    expect(createdTicket()).toEqual({
      number: "SUP-000007",
      type: T.ORDER_PROBLEM,
      reason: "delay",
      subject: "Retard — CMD-42-1",
      status: S.AWAITING_SHOP,
      priority: SupportPriority.NORMAL,
      requester: { userId: clientId, accountType: EntityType.USER, name: "Aïssatou Barry", email: "aissatou@example.com" },
      target: { kind: SupportTargetKind.SHOP_ORDER, id: part._id, label: "CMD-42-1" },
      boutiqueId: shop._id,
      requesterShopId: null,
      orderId: part.orderId,
      deadlineAt: later(48 * HOUR),
      reminderAt: later(24 * HOUR),
      lastMessageAt: NOW,
    });
    expect(contactWarning).toBe(false);
    expect(recipients()).toEqual(["requester", "shop"]);
    expect(vi.mocked(deliverSupportNotices).mock.calls[0]![1]).toBe(ticket);
    // Pas de signalement : ni doublon ni abus à vérifier.
    expect(TicketMock.countDocuments).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("createTicket — signalement d'annonce", () => {
  const product = makeProduct({ name: "Galaxy A15" });
  const offer = makeProductBoutique({ productId: product._id, boutiqueId: shop._id });

  const reportOffer = (user: AuthUser, reason = "misleading", over: Partial<CreateTicketInput> = {}) =>
    createTicket(user, { type: T.LISTING_REPORT, reason, description: "La photo ne correspond pas au produit.", targetId: offer._id.toString(), ...over }, [], NOW);

  beforeEach(() => {
    PbMock.findById.mockImplementation(byId([offer]));
    ProductMock.findById.mockImplementation(byId([product]));
  });

  it("renvoie 404 quand l'annonce n'existe pas", async () => {
    await expect(reportOffer(CLIENT, "misleading", { targetId: oid().toString() })).rejects.toMatchObject({
      statusCode: 404,
      message: "Annonce introuvable.",
    });
  });

  it("refuse qu'une boutique signale sa propre annonce", async () => {
    await expect(reportOffer(OWNER)).rejects.toMatchObject({ statusCode: 400, message: "Vous ne pouvez pas signaler votre propre annonce." });
  });

  it("adresse le signalement à l'administration, avec l'annonce et sa boutique pour dossier", async () => {
    await reportOffer(CLIENT);

    expect(createdTicket()).toMatchObject({
      type: T.LISTING_REPORT,
      subject: "Description trompeuse — Galaxy A15 — Boutique Kaloum",
      status: S.AWAITING_ADMIN,
      priority: SupportPriority.NORMAL,
      target: { kind: SupportTargetKind.OFFER, id: offer._id, label: "Galaxy A15 — Boutique Kaloum" },
      boutiqueId: shop._id,
      reminderAt: later(24 * HOUR),
    });
    expect(recipients()).toEqual(["requester", "admin"]);
  });

  it("nomme l'annonce par défaut quand le produit ou la boutique ont disparu", async () => {
    ProductMock.findById.mockReturnValue(mockQuery(null));
    ShopMock.findById.mockReturnValue(mockQuery(null));

    await reportOffer(CLIENT);

    expect(createdTicket().target.label).toBe("Annonce — boutique");
  });

  it("limite l'objet généré à 120 caractères", async () => {
    ProductMock.findById.mockReturnValue(mockQuery(makeProduct({ name: "Perceuse ".repeat(20) })));

    await reportOffer(CLIENT);

    expect(createdTicket().subject).toHaveLength(120);
  });

  it("passe en urgence une contrefaçon : première réponse sous 4 heures", async () => {
    await reportOffer(CLIENT, "counterfeit");

    expect(createdTicket()).toMatchObject({ priority: SupportPriority.URGENT, reminderAt: later(4 * HOUR), deadlineAt: later(72 * HOUR) });
  });

  it("refuse qu'un même auteur signale deux fois la même annonce", async () => {
    TicketMock.findOne.mockReturnValue(mockQuery(makeSupportTicket({ number: "SUP-000003" })));

    await expect(reportOffer(CLIENT)).rejects.toMatchObject({
      statusCode: 409,
      message: "Vous avez déjà signalé ceci (SUP-000003) : l'équipe l'examine.",
    });
    expect(TicketMock.findOne).toHaveBeenCalledWith({
      "requester.userId": new Types.ObjectId(CLIENT.id),
      "target.id": offer._id,
      status: { $in: [S.AWAITING_SHOP, S.AWAITING_REQUESTER, S.AWAITING_ADMIN] },
    });
  });

  it("passe en priorité basse l'auteur de 5 signalements rejetés en 30 jours", async () => {
    TicketMock.countDocuments.mockReturnValue(mockQuery(5));

    await reportOffer(CLIENT);

    expect(createdTicket().priority).toBe(SupportPriority.LOW);
    expect(TicketMock.countDocuments).toHaveBeenCalledWith({
      "requester.userId": new Types.ObjectId(CLIENT.id),
      type: { $in: [T.LISTING_REPORT, T.SHOP_REPORT, T.REVIEW_REPORT, T.CUSTOMER_REPORT] },
      "resolution.outcome": SupportOutcome.REJECTED,
      resolvedAt: { $gte: ago(30 * DAY) },
    });
  });

  it("garde la priorité normale en dessous de 5 signalements rejetés", async () => {
    TicketMock.countDocuments.mockReturnValue(mockQuery(4));

    await reportOffer(CLIENT);

    expect(createdTicket().priority).toBe(SupportPriority.NORMAL);
  });

  describe("masquage provisoire", () => {
    it("masque l'annonce signalée par 3 comptes pour contrefaçon en 7 jours", async () => {
      TicketMock.distinct.mockReturnValue(mockQuery([oid(), oid(), clientId]));

      const { ticket } = await reportOffer(CLIENT, "counterfeit");

      expect(TicketMock.distinct).toHaveBeenCalledWith("requester.userId", {
        type: T.LISTING_REPORT,
        "target.id": offer._id,
        reason: { $in: ["counterfeit", "prohibited"] },
        createdAt: { $gte: ago(7 * DAY) },
        "resolution.outcome": { $ne: SupportOutcome.REJECTED },
      });
      expect(applySanction).toHaveBeenCalledWith({
        type: SanctionType.HIDE,
        targetKind: SanctionTargetKind.OFFER,
        targetId: String(offer._id),
        reason: expect.stringContaining("3 signalements pour contrefaçon en moins de 7 jours"),
        ticketId: String(ticket._id),
        provisional: true,
        createdBy: null,
        now: NOW,
      });
      expect(logger.warn).toHaveBeenCalled();
    });

    it("attend un troisième compte : les signalements de visiteurs ne comptent pas", async () => {
      TicketMock.distinct.mockReturnValue(mockQuery([oid(), clientId, null]));

      await reportOffer(CLIENT, "prohibited");

      expect(applySanction).not.toHaveBeenCalled();
    });

    it("ne masque pas pour un motif qui n'est pas grave", async () => {
      await reportOffer(CLIENT, "abusive_price");

      expect(TicketMock.distinct).not.toHaveBeenCalled();
      expect(applySanction).not.toHaveBeenCalled();
    });

    it("ne masque pas une annonce déjà masquée", async () => {
      PbMock.findById.mockImplementation(byId([{ ...offer, hiddenAt: ago(HOUR) }]));

      await reportOffer(CLIENT, "counterfeit");

      expect(TicketMock.distinct).not.toHaveBeenCalled();
    });

    it("garde la demande même si le masquage échoue", async () => {
      TicketMock.distinct.mockReturnValue(mockQuery([oid(), oid(), clientId]));
      vi.mocked(applySanction).mockRejectedValueOnce(new Error("Cette annonce est déjà masquée."));

      await expect(reportOffer(CLIENT, "counterfeit")).resolves.toBeDefined();
      expect(logger.error).toHaveBeenCalledWith("Masquage provisoire non appliqué : Cette annonce est déjà masquée.");
      expect(deliverSupportNotices).toHaveBeenCalled();
    });
  });
});

// ─────────────────────────────────────────────
describe("createTicket — signalement d'une boutique, d'un avis, d'un client", () => {
  it("signale une boutique, jamais la sienne", async () => {
    const reportShop = (user: AuthUser, targetId = shop._id.toString()) =>
      createTicket(user, { type: T.SHOP_REPORT, reason: "scam", description: "Elle a encaissé sans livrer.", targetId }, [], NOW);

    await expect(reportShop(CLIENT, oid().toString())).rejects.toMatchObject({ statusCode: 404, message: "Boutique introuvable." });
    await expect(reportShop(OWNER)).rejects.toMatchObject({ statusCode: 400, message: "Vous ne pouvez pas signaler votre propre boutique." });

    await reportShop(CLIENT);

    expect(createdTicket()).toMatchObject({
      target: { kind: SupportTargetKind.SHOP, id: shop._id, label: "Boutique Kaloum" },
      boutiqueId: shop._id,
      priority: SupportPriority.URGENT,
    });
  });

  describe("avis", () => {
    const authorId = oid();
    const author = makeUser({ _id: authorId, prenom: "Fatou" });
    const product = makeProduct({ name: "Galaxy A15" });
    const offer = makeProductBoutique({ productId: product._id, boutiqueId: shop._id });
    const review = makeReview({ userId: authorId, productBoutiqueId: offer._id });

    const reportReview = (user: AuthUser, targetId = review._id.toString()) =>
      createTicket(user, { type: T.REVIEW_REPORT, reason: "fake", description: "Cet avis est écrit par la boutique.", targetId }, [], NOW);

    beforeEach(() => {
      ReviewMock.findById.mockImplementation(byId([review]));
      PbMock.findById.mockImplementation(byId([offer]));
      ProductMock.findById.mockImplementation(byId([product]));
      UserMock.findById.mockImplementation(byId([client, owner, author]));
    });

    it("renvoie 404 quand l'avis n'existe pas", async () => {
      await expect(reportReview(CLIENT, oid().toString())).rejects.toMatchObject({ statusCode: 404, message: "Avis introuvable." });
    });

    it("refuse que l'on signale son propre avis", async () => {
      await expect(reportReview({ id: authorId.toString(), entityType: EntityType.USER })).rejects.toMatchObject({
        statusCode: 400,
        message: "Vous ne pouvez pas signaler votre propre avis.",
      });
    });

    it("nomme l'avis par son auteur et son produit, rattaché à la boutique de l'offre", async () => {
      await reportReview(CLIENT);

      expect(createdTicket()).toMatchObject({
        target: { kind: SupportTargetKind.REVIEW, id: review._id, label: "Avis de Fatou sur Galaxy A15" },
        boutiqueId: shop._id,
        status: S.AWAITING_ADMIN,
      });
    });

    it("garde un libellé lisible quand l'offre a disparu", async () => {
      PbMock.findById.mockReturnValue(mockQuery(null));

      await reportReview(CLIENT);

      expect(createdTicket()).toMatchObject({ target: { label: "Avis de Fatou sur un produit" }, boutiqueId: null });
    });
  });

  describe("client", () => {
    const part = makeShopOrder({
      userId: clientId,
      boutiqueId: shop._id,
      reference: "CMD-42-1",
      customer: { prenom: "Aïssatou", nom: "Barry", telephone: "620000000" },
    });

    const reportCustomer = (user: AuthUser, targetId = part._id.toString()) =>
      createTicket(user, { type: T.CUSTOMER_REPORT, reason: "repeated_absence", description: "Absent aux trois livraisons.", targetId }, [], NOW);

    beforeEach(() => {
      ShopOrderMock.findById.mockImplementation(byId([part]));
    });

    it("réserve le signalement d'un client aux boutiques", async () => {
      await expect(reportCustomer(CLIENT)).rejects.toMatchObject({ statusCode: 403, message: "Seule une boutique signale un client." });
    });

    it("exige une commande de la boutique", async () => {
      await expect(reportCustomer(OWNER, oid().toString())).rejects.toMatchObject({ statusCode: 404 });
      await expect(reportCustomer(OTHER_OWNER)).rejects.toMatchObject({
        statusCode: 403,
        message: "Vous ne pouvez signaler que les clients de vos commandes.",
      });
    });

    it("vise le client de la commande, au nom de la boutique demandeuse", async () => {
      await reportCustomer(OWNER);

      expect(createdTicket()).toMatchObject({
        target: { kind: SupportTargetKind.USER, id: clientId, label: "Aïssatou Barry (commande CMD-42-1)" },
        requesterShopId: shop._id,
        boutiqueId: null,
        orderId: part.orderId,
        requester: { userId: ownerId, accountType: EntityType.SHOP, name: "Ibrahima Sow" },
      });
    });

    it("nomme « Client » une commande sans coordonnées figées", async () => {
      ShopOrderMock.findById.mockImplementation(byId([{ ...part, customer: undefined }]));

      await reportCustomer(OWNER);

      expect(createdTicket().target.label).toBe("Client (commande CMD-42-1)");
    });
  });
});

// ─────────────────────────────────────────────
describe("createTicket — contestation d'une mesure", () => {
  const suspension = makeSanction({
    type: SanctionType.SUSPENSION,
    target: { kind: SanctionTargetKind.SHOP, id: shop._id, label: "Boutique Kaloum" },
    notifiedUserId: ownerId,
  });

  const contest = (user: AuthUser, sanction: any = suspension) => {
    SanctionMock.findById.mockImplementation(byId([sanction]));
    return createTicket(user, { type: T.SANCTION_APPEAL, reason: "appeal", description: "Le client a menti sur la livraison.", targetId: sanction._id.toString() }, [], NOW);
  };

  it("renvoie 404 quand la mesure n'existe pas", async () => {
    await expect(
      createTicket(OWNER, { type: T.SANCTION_APPEAL, reason: "appeal", description: "Je conteste cette mesure.", targetId: oid().toString() }, [], NOW)
    ).rejects.toMatchObject({ statusCode: 404, message: "Mesure introuvable." });
  });

  it("ne laisse contester que la personne visée", async () => {
    await expect(contest(CLIENT)).rejects.toMatchObject({ statusCode: 403, message: "Vous ne pouvez contester qu'une mesure qui vous vise." });
  });

  it("refuse de contester une mesure levée", async () => {
    await expect(contest(OWNER, { ...suspension, liftedAt: ago(DAY) })).rejects.toMatchObject({
      statusCode: 400,
      message: "Cette mesure est déjà levée.",
    });
  });

  it("refuse une seconde contestation ouverte", async () => {
    TicketMock.findOne.mockReturnValue(mockQuery(makeSupportTicket({ number: "SUP-000005" })));

    await expect(contest(OWNER)).rejects.toMatchObject({ statusCode: 409, message: "Une contestation est déjà ouverte (SUP-000005)." });
    expect(TicketMock.findOne).toHaveBeenCalledWith({
      type: T.SANCTION_APPEAL,
      "target.id": suspension._id,
      status: { $in: [S.AWAITING_SHOP, S.AWAITING_REQUESTER, S.AWAITING_ADMIN] },
    });
  });

  it("suit la contestation d'une boutique depuis son Espace boutique", async () => {
    await contest(OWNER);

    expect(createdTicket()).toMatchObject({
      target: { kind: SupportTargetKind.SANCTION, id: suspension._id, label: "Suspension — Boutique Kaloum" },
      requesterShopId: shop._id,
      boutiqueId: null,
      status: S.AWAITING_ADMIN,
    });
  });

  it("rattache la contestation d'une annonce masquée à la boutique de l'annonce", async () => {
    const offer = makeProductBoutique({ boutiqueId: shop._id });
    PbMock.findById.mockImplementation(byId([offer]));

    await contest(OWNER, makeSanction({ type: SanctionType.HIDE, target: { kind: SanctionTargetKind.OFFER, id: offer._id, label: "Galaxy A15" }, notifiedUserId: ownerId }));

    expect(createdTicket()).toMatchObject({ requesterShopId: shop._id, target: { label: "Masquage — Galaxy A15" } });
  });

  it("laisse un client bloqué contester depuis son compte", async () => {
    await contest(CLIENT, makeSanction({ type: SanctionType.BLOCK, target: { kind: SanctionTargetKind.USER, id: clientId, label: "Aïssatou Barry" }, notifiedUserId: clientId }));

    expect(createdTicket()).toMatchObject({ requesterShopId: null, target: { label: "Blocage — Aïssatou Barry" } });
  });
});

// ─────────────────────────────────────────────
describe("postMessage", () => {
  const write = (user: AuthUser | undefined, ticket: ISupportTicket, input: PostMessageInput, attachments: any[] = []) => {
    givenTicket(ticket);
    return postMessage(user, String(ticket._id), input, attachments, NOW);
  };

  it("renvoie 404 quand la demande n'existe pas, et annule la transaction", async () => {
    await expect(postMessage(CLIENT, oid().toString(), { body: "Bonjour" }, [], NOW)).rejects.toMatchObject({ statusCode: 404 });
    expect(session.abortTransaction).toHaveBeenCalledOnce();
  });

  it("refuse en 403 qui ne participe pas", async () => {
    await expect(write(STRANGER, orderTicket(), { body: "Bonjour" })).rejects.toMatchObject({
      statusCode: 403,
      message: "Vous ne participez pas à cette demande.",
    });
    expect(MessageMock.create).not.toHaveBeenCalled();
  });

  it("refuse en 400 une note interne d'une partie, ou un message sur une demande fermée", async () => {
    await expect(write(OWNER, orderTicket(), { body: "Note", internal: true })).rejects.toMatchObject({
      statusCode: 400,
      message: "Seule l'administration écrit des notes internes.",
    });
    await expect(write(CLIENT, orderTicket({ status: S.CLOSED }), { body: "Bonjour" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("passe la main au client quand la boutique répond, et le prévient", async () => {
    const ticket = orderTicket();
    const query = givenTicket(ticket);
    const files = [{ url: "/uploads/files/bordereau.pdf", name: "bordereau.pdf", mimetype: "application/pdf", size: 10 }];

    const result = await postMessage(OWNER, String(ticket._id), { body: "  Le colis part demain.  " }, files, NOW);

    expect(query.session).toHaveBeenCalledWith(session);
    expect(createdMessages()).toEqual([
      {
        ticketId: ticket._id,
        author: { userId: new Types.ObjectId(OWNER.id), party: SHOP, name: "Boutique Kaloum" },
        visibility: SupportVisibility.PUBLIC,
        kind: SupportMessageKind.MESSAGE,
        body: "Le colis part demain.",
        attachments: files,
        containsContact: false,
      },
    ]);
    expect(ticket).toMatchObject({
      status: S.AWAITING_REQUESTER,
      shopRespondedAt: NOW,
      deadlineAt: later(7 * DAY),
      reminderAt: later(3 * DAY),
      lastMessageAt: NOW,
    });
    expect(ticket.save).toHaveBeenCalledWith({ session });
    expect(recipients()).toEqual(["requester"]);
    expect(delivered()[0]!.paragraphs[1]).toBe("Boutique Kaloum a écrit dans la demande.");
    expect(result).toMatchObject({ ticket, contactWarning: false });
  });

  it("garde la date de la première réponse de la boutique", async () => {
    const ticket = orderTicket({ shopRespondedAt: ago(DAY) });

    await write(OWNER, ticket, { body: "Encore un mot." });

    expect(ticket.shopRespondedAt).toEqual(ago(DAY));
  });

  it("rend la main à la boutique quand le client répond", async () => {
    const ticket = orderTicket({ status: S.AWAITING_REQUESTER });

    await write(CLIENT, ticket, { body: "Toujours rien reçu." });

    expect(createdMessages()[0].author).toMatchObject({ party: REQUESTER, name: "Aïssatou Barry" });
    expect(ticket).toMatchObject({ status: S.AWAITING_SHOP, deadlineAt: later(48 * HOUR) });
    expect(recipients()).toEqual(["shop"]);
  });

  it("ne touche pas à l'échéance quand une partie écrit hors de son tour", async () => {
    const ticket = orderTicket({ deadlineAt: later(HOUR) });

    await write(CLIENT, ticket, { body: "Des nouvelles ?" });

    expect(ticket).toMatchObject({ status: S.AWAITING_SHOP, deadlineAt: later(HOUR), lastMessageAt: NOW });
  });

  it("garde une note interne de l'administration hors du fil public, sans prévenir personne", async () => {
    const ticket = orderTicket({ status: S.AWAITING_ADMIN, escalatedAt: ago(DAY) });

    await write(ADMIN_USER, ticket, { body: "Troisième plainte ce mois-ci.", internal: true });

    expect(createdMessages()[0]).toMatchObject({
      visibility: SupportVisibility.INTERNAL,
      author: { party: ADMIN, name: "Équipe de la plateforme" },
    });
    expect(ticket).toMatchObject({ status: S.AWAITING_ADMIN, adminRespondedAt: null, lastMessageAt: null });
    expect(ticket.save).toHaveBeenCalledWith({ session });
    expect(deliverSupportNotices).not.toHaveBeenCalled();
  });

  it("laisse l'administration demander une pièce au client, et prévient les deux parties", async () => {
    const ticket = orderTicket({ status: S.AWAITING_ADMIN, escalatedAt: ago(DAY) });

    await write(ADMIN_USER, ticket, { body: "Envoyez une photo du colis.", waitFor: REQUESTER });

    expect(ticket).toMatchObject({ status: S.AWAITING_REQUESTER, adminRespondedAt: NOW, deadlineAt: later(7 * DAY) });
    expect(recipients()).toEqual(["requester", "shop"]);
  });

  it("rend la main à l'administration quand la pièce demandée arrive", async () => {
    const ticket = orderTicket({ status: S.AWAITING_REQUESTER, escalatedAt: ago(DAY) });

    await write(CLIENT, ticket, { body: "Voici la photo." });

    expect(ticket.status).toBe(S.AWAITING_ADMIN);
    expect(recipients()).toEqual(["shop", "admin"]);
  });

  it("prévient l'administration d'un message sur une question", async () => {
    const ticket = makeSupportTicket({
      type: T.GENERAL_QUESTION,
      status: S.AWAITING_REQUESTER,
      requester: { userId: clientId, accountType: "user", name: "Aïssatou Barry" },
    });

    await write(CLIENT, ticket, { body: "Voici mon numéro de commande." });

    expect(ticket.status).toBe(S.AWAITING_ADMIN);
    expect(recipients()).toEqual(["admin"]);
  });

  it("signale un moyen de contact dans le message", async () => {
    const result = await write(CLIENT, orderTicket({ status: S.AWAITING_REQUESTER }), { body: "Écrivez-moi sur WhatsApp." });

    expect(createdMessages()[0].containsContact).toBe(true);
    expect(result.contactWarning).toBe(true);
  });
});

// ─────────────────────────────────────────────
describe("applySupportAction — contrôles", () => {
  it("renvoie 404 quand la demande n'existe pas", async () => {
    await expect(applySupportAction(CLIENT, oid().toString(), A.CLOSE, {}, NOW)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("renvoie 403 à qui ne participe pas", async () => {
    givenTicket(orderTicket());

    await expect(applySupportAction(STRANGER, oid().toString(), A.CLOSE, {}, NOW)).rejects.toMatchObject({
      statusCode: 403,
      message: "Vous ne participez pas à cette demande.",
    });
  });

  it("renvoie 400 avec la règle enfreinte, sans rien écrire ni prévenir", async () => {
    const ticket = orderTicket();
    givenTicket(ticket);

    await expect(applySupportAction(CLIENT, String(ticket._id), A.RESOLVE, {}, NOW)).rejects.toMatchObject({
      statusCode: 400,
      message: "Seule l'administration tranche une demande.",
    });
    expect(ticket.save).not.toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalledOnce();
    expect(deliverSupportNotices).not.toHaveBeenCalled();
  });
});

describe("applySupportAction — entre le client et la boutique", () => {
  const act = (user: AuthUser, ticket: ISupportTicket, action: SupportAction, input: SupportActionInput = {}) => {
    givenTicket(ticket);
    return applySupportAction(user, String(ticket._id), action, input, NOW);
  };

  it("enregistre la proposition de la boutique et passe la main au client", async () => {
    const ticket = orderTicket();

    await act(OWNER, ticket, A.PROPOSE, { kind: "refund", details: "  Je rembourse la livraison.  " });

    expect(ticket.proposal).toEqual({ kind: "refund", details: "Je rembourse la livraison.", status: "pending", at: NOW, by: new Types.ObjectId(OWNER.id) });
    expect(ticket).toMatchObject({ status: S.AWAITING_REQUESTER, shopRespondedAt: NOW, deadlineAt: later(7 * DAY) });
    expect(createdMessages()).toEqual([
      {
        ticketId: ticket._id,
        author: { userId: new Types.ObjectId(OWNER.id), party: SHOP, name: "Boutique Kaloum" },
        visibility: SupportVisibility.PUBLIC,
        kind: SupportMessageKind.PROPOSAL,
        body: "Remboursement : Je rembourse la livraison.",
      },
    ]);
    expect(MessageMock.create.mock.calls[0]![1]).toEqual({ session, ordered: true });
    expect(ticket.save).toHaveBeenCalledWith({ session });
    expect(recipients()).toEqual(["requester"]);
    expect(delivered()[0]!.title).toBe("La boutique vous propose une solution");
  });

  it("résout la demande quand le client accepte la proposition", async () => {
    const ticket = orderTicket({
      status: S.AWAITING_REQUESTER,
      proposal: { kind: "new_date", details: "Livraison jeudi.", status: "pending", at: ago(HOUR), by: ownerId },
    });

    await act(CLIENT, ticket, A.ACCEPT);

    expect(ticket.proposal!.status).toBe("accepted");
    expect(ticket.resolution).toEqual({ outcome: SupportOutcome.AGREED, note: "Livraison jeudi.", by: REQUESTER, at: NOW });
    expect(ticket).toMatchObject({ status: S.RESOLVED, resolvedAt: NOW, deadlineAt: later(7 * DAY), reminderAt: null });
    expect(createdMessages()[0]).toMatchObject({ author: { party: REQUESTER, name: "Aïssatou Barry" }, body: "Le client accepte la solution proposée." });
    expect(recipients()).toEqual(["shop"]);
  });

  it("décline la proposition en attente quand la boutique demande l'arbitrage", async () => {
    const ticket = orderTicket({
      status: S.AWAITING_REQUESTER,
      proposal: { kind: "refund", details: "Remboursement partiel.", status: "pending", at: ago(HOUR), by: ownerId },
    });

    await act(OWNER, ticket, A.ESCALATE, { reason: "  Le client refuse tout arrangement.  " });

    expect(ticket.proposal!.status).toBe("declined");
    expect(ticket).toMatchObject({ escalatedAt: NOW, status: S.AWAITING_ADMIN, deadlineAt: later(72 * HOUR) });
    expect(createdMessages()[0]).toMatchObject({ kind: SupportMessageKind.EVENT, body: "Arbitrage demandé : Le client refuse tout arrangement." });
    expect(recipients()).toEqual(["admin", "requester"]);
  });

  it("transmet la demande du client à l'administration, avec un message par défaut", async () => {
    const ticket = orderTicket({ status: S.AWAITING_REQUESTER });

    await act(CLIENT, ticket, A.ESCALATE);

    expect(createdMessages()[0].body).toBe("Arbitrage demandé : l'administration reprend la demande.");
    expect(recipients()).toEqual(["admin", "shop"]);
  });

  it("enregistre le recours d'une partie et rend la demande à l'administration", async () => {
    const ticket = orderTicket({
      status: S.RESOLVED,
      resolvedAt: ago(2 * DAY),
      resolution: { outcome: SupportOutcome.REJECTED, by: ADMIN, at: ago(2 * DAY) },
      assignee: adminId,
    });

    await act(CLIENT, ticket, A.APPEAL, { reason: "  Je n'ai jamais reçu le colis.  " });

    expect(ticket.appeal).toEqual({ by: REQUESTER, userId: new Types.ObjectId(CLIENT.id), reason: "Je n'ai jamais reçu le colis.", at: NOW });
    expect(ticket).toMatchObject({ assignee: null, status: S.AWAITING_ADMIN });
    expect(createdMessages()[0].body).toBe("Recours : Je n'ai jamais reçu le colis.");
    expect(recipients()).toEqual(["admin"]);
    expect(delivered()[0]!.title).toBe("Recours sur une décision");
  });

  it("enregistre le recours de la boutique à son nom", async () => {
    const ticket = orderTicket({ status: S.RESOLVED, resolvedAt: ago(DAY) });

    await act(OWNER, ticket, A.APPEAL, { reason: "Le client a bien reçu le colis." });

    expect(ticket.appeal!.by).toBe(SHOP);
  });

  it("ferme la demande retirée par le client", async () => {
    const ticket = orderTicket({ deadlineAt: later(HOUR), reminderAt: later(HOUR) });

    await act(CLIENT, ticket, A.CLOSE);

    expect(ticket.resolution).toEqual({ outcome: SupportOutcome.WITHDRAWN, note: undefined, by: REQUESTER, at: NOW });
    expect(ticket).toMatchObject({ status: S.CLOSED, closedAt: NOW, deadlineAt: null, reminderAt: null });
    expect(createdMessages()[0].body).toBe("Le demandeur ferme sa demande.");
    expect(recipients()).toEqual(["shop"]);
    expect(delivered()[0]!.paragraphs[1]).toBe("La demande est fermée.");
  });

  it("garde la décision d'une demande résolue qu'on ferme", async () => {
    const resolution = { outcome: SupportOutcome.AGREED, note: "Livraison jeudi.", by: REQUESTER, at: ago(DAY) };
    const ticket = orderTicket({ status: S.RESOLVED, resolvedAt: ago(DAY), resolution });

    await act(CLIENT, ticket, A.CLOSE);

    expect(ticket.resolution).toBe(resolution);
    expect(ticket.status).toBe(S.CLOSED);
  });

  it("rouvre une demande fermée chez la boutique, décision effacée", async () => {
    const ticket = orderTicket({
      status: S.CLOSED,
      closedAt: ago(2 * DAY),
      resolvedAt: ago(3 * DAY),
      resolution: { outcome: SupportOutcome.AGREED, by: REQUESTER, at: ago(3 * DAY) },
    });

    await act(CLIENT, ticket, A.REOPEN, { reason: "  Le colis n'est jamais arrivé.  " });

    expect(ticket).toMatchObject({
      reopenedAt: NOW,
      closedAt: null,
      resolvedAt: null,
      resolution: null,
      status: S.AWAITING_SHOP,
      deadlineAt: later(48 * HOUR),
    });
    expect(createdMessages()[0].body).toBe("Demande rouverte : Le colis n'est jamais arrivé.");
    expect(recipients()).toEqual(["shop"]);
  });

  it("rouvre chez l'administration une demande qu'elle avait reprise, ou une question", async () => {
    const escalated = orderTicket({ status: S.CLOSED, closedAt: ago(DAY), escalatedAt: ago(5 * DAY) });
    await act(CLIENT, escalated, A.REOPEN, { reason: "Rien n'a changé." });
    expect(escalated.status).toBe(S.AWAITING_ADMIN);
    expect(recipients()).toEqual(["shop", "admin"]);

    const question = makeSupportTicket({
      type: T.GENERAL_QUESTION,
      reason: "account",
      status: S.CLOSED,
      closedAt: ago(DAY),
      requester: { userId: clientId, accountType: "user", name: "Aïssatou Barry" },
    });
    await act(CLIENT, question, A.REOPEN, { reason: "Toujours bloqué." });
    expect(question.status).toBe(S.AWAITING_ADMIN);
    expect(recipients()).toEqual(["admin"]);
  });

  it("enregistre la note du client, sans message", async () => {
    const ticket = orderTicket({ status: S.RESOLVED, resolvedAt: ago(DAY) });

    await act(CLIENT, ticket, A.RATE, { rating: 5, comment: "  Merci  " });

    expect(ticket.satisfaction).toEqual({ rating: 5, comment: "Merci", at: NOW });
    expect(MessageMock.create).not.toHaveBeenCalled();
    expect(ticket.save).toHaveBeenCalledWith({ session });
  });

  it("n'enregistre pas de commentaire vide", async () => {
    const ticket = orderTicket({ status: S.CLOSED, closedAt: ago(DAY) });

    await act(CLIENT, ticket, A.RATE, { rating: 2, comment: "   " });

    expect(ticket.satisfaction).toEqual({ rating: 2, comment: undefined, at: NOW });
  });
});

describe("applySupportAction — l'administration", () => {
  const act = (ticket: ISupportTicket, action: SupportAction, input: SupportActionInput = {}) => {
    givenTicket(ticket);
    return applySupportAction(ADMIN_USER, String(ticket._id), action, input, NOW);
  };

  it("tranche, motive et prévient les deux parties", async () => {
    const ticket = orderTicket({ status: S.AWAITING_ADMIN, escalatedAt: ago(DAY) });

    await act(ticket, A.RESOLVE, { outcome: SupportOutcome.UPHELD, note: "  La boutique rembourse.  " });

    expect(ticket.resolution).toEqual({
      outcome: SupportOutcome.UPHELD,
      note: "La boutique rembourse.",
      by: ADMIN,
      decidedBy: new Types.ObjectId(ADMIN_USER.id),
      at: NOW,
    });
    expect(ticket).toMatchObject({ status: S.RESOLVED, resolvedAt: NOW, adminRespondedAt: NOW, deadlineAt: later(7 * DAY) });
    expect(createdMessages()[0]).toMatchObject({
      kind: SupportMessageKind.DECISION,
      author: { party: ADMIN, name: "Équipe de la plateforme" },
      body: "Donnée en faveur du demandeur — La boutique rembourse.",
    });
    expect(recipients()).toEqual(["requester", "shop"]);
    expect(delivered()[0]!.paragraphs[1]).toBe("Donnée en faveur du demandeur : La boutique rembourse.");
    expect(SanctionMock.findOne).not.toHaveBeenCalled();
  });

  it("ferme définitivement la demande quand il tranche un recours", async () => {
    const ticket = orderTicket({
      status: S.AWAITING_ADMIN,
      escalatedAt: ago(5 * DAY),
      appeal: { by: REQUESTER, userId: clientId, reason: "Je conteste.", at: ago(DAY) },
    });

    await act(ticket, A.RESOLVE, { outcome: SupportOutcome.REJECTED, note: "Décision confirmée." });

    expect(ticket).toMatchObject({ status: S.CLOSED, closedAt: NOW, deadlineAt: null });
  });

  it("classe une demande sans décision, motif à l'appui", async () => {
    const ticket = orderTicket();

    await act(ticket, A.CLOSE, { note: "  Doublon de SUP-000041.  " });

    expect(ticket.resolution).toEqual({
      outcome: SupportOutcome.REJECTED,
      note: "Doublon de SUP-000041.",
      by: ADMIN,
      decidedBy: new Types.ObjectId(ADMIN_USER.id),
      at: NOW,
    });
    expect(createdMessages()[0].body).toBe("Demande classée : Doublon de SUP-000041.");
    expect(recipients()).toEqual(["requester", "shop"]);
  });

  it("classe avec un motif par défaut", async () => {
    const ticket = orderTicket();

    await act(ticket, A.CLOSE);

    expect(ticket.resolution!.note).toBe("Classée par l'administration.");
    expect(createdMessages()[0].body).toBe("Demande classée.");
  });

  it("prend la demande en charge pour lui-même ou pour un collègue, sans message", async () => {
    const ticket = orderTicket({ status: S.AWAITING_ADMIN });
    await act(ticket, A.ASSIGN);
    expect(ticket.assignee).toEqual(new Types.ObjectId(ADMIN_USER.id));

    const colleague = oid().toString();
    await act(ticket, A.ASSIGN, { assignee: colleague });
    expect(ticket.assignee).toEqual(new Types.ObjectId(colleague));

    expect(MessageMock.create).not.toHaveBeenCalled();
    expect(delivered()).toEqual([]);
  });

  describe("masquage provisoire d'une annonce signalée", () => {
    const offerId = oid();
    const report = () =>
      makeSupportTicket({
        type: T.LISTING_REPORT,
        reason: "counterfeit",
        status: S.AWAITING_ADMIN,
        target: { kind: SupportTargetKind.OFFER, id: offerId, label: "Galaxy A15 — Boutique Kaloum" },
        boutiqueId: shop._id,
      });
    const provisional = makeSanction({
      type: SanctionType.HIDE,
      provisional: true,
      target: { kind: SanctionTargetKind.OFFER, id: offerId, label: "Galaxy A15" },
      notifiedUserId: owner._id,
    });

    it("lève le masquage quand les signalements sont rejetés", async () => {
      SanctionMock.findOne.mockReturnValue(mockQuery(provisional));

      await act(report(), A.RESOLVE, { outcome: SupportOutcome.REJECTED, note: "Produit authentique, facture à l'appui." });

      expect(SanctionMock.findOne).toHaveBeenCalledWith({ "target.id": offerId, provisional: true, liftedAt: null });
      expect(liftSanction).toHaveBeenCalledWith(String(provisional._id), ADMIN_USER.id, "Signalements non fondés après examen.", NOW);
    });

    it("confirme le masquage quand les signalements sont fondés", async () => {
      const pending = makeSanction({ ...provisional, provisional: true });
      SanctionMock.findOne.mockReturnValue(mockQuery(pending));

      await act(report(), A.RESOLVE, { outcome: SupportOutcome.UPHELD, note: "Contrefaçon avérée." });

      expect(pending.provisional).toBe(false);
      expect(pending.save).toHaveBeenCalled();
      expect(liftSanction).not.toHaveBeenCalled();
      // Le provisoire n'avait pas été annoncé : la boutique reçoit le motif à la confirmation.
      expect(sendNoticeMail).toHaveBeenCalledWith(expect.objectContaining({ to: owner.email, subject: "Masquage : Galaxy A15" }));
    });

    it("ne cherche aucune mesure pour une simple réponse", async () => {
      await act(report(), A.RESOLVE, { outcome: SupportOutcome.ANSWERED, note: "Information transmise." });

      expect(SanctionMock.findOne).not.toHaveBeenCalled();
    });

    it("ne fait rien quand l'annonce n'a pas été masquée", async () => {
      await act(report(), A.RESOLVE, { outcome: SupportOutcome.REJECTED, note: "Rien à signaler." });

      expect(SanctionMock.findOne).toHaveBeenCalled();
      expect(liftSanction).not.toHaveBeenCalled();
    });
  });
});

// ─────────────────────────────────────────────
describe("runSupportDeadlines", () => {
  /** Rappels et échéances dus ; `fresh` : la demande relue dans la transaction. */
  const given = (opts: { reminders?: ISupportTicket[]; deadlines?: ISupportTicket[]; fresh?: ISupportTicket | null }) => {
    TicketMock.find.mockImplementation((filter: Record<string, unknown>) =>
      mockQuery(filter.reminderAt ? (opts.reminders ?? []) : (opts.deadlines ?? []))
    );
    if (opts.fresh !== undefined) TicketMock.findById.mockReturnValue(mockQuery(opts.fresh));
    else TicketMock.findById.mockImplementation(byId(opts.deadlines ?? []));
  };

  it("cherche les rappels et les échéances passés", async () => {
    await expect(runSupportDeadlines(NOW)).resolves.toEqual({ reminders: 0, steps: 0, errors: 0 });

    expect(TicketMock.find).toHaveBeenCalledWith({ reminderAt: { $lte: NOW } });
    expect(TicketMock.find).toHaveBeenCalledWith({ deadlineAt: { $lte: NOW } });
  });

  describe("rappels", () => {
    it("rappelle à la boutique qu'il lui reste 24 heures, une seule fois", async () => {
      const ticket = orderTicket({ reminderAt: ago(HOUR) });
      given({ reminders: [ticket] });

      const summary = await runSupportDeadlines(NOW);

      expect(recipients()).toEqual(["shop"]);
      expect(delivered()[0]).toMatchObject({ title: "Plus que 24 heures pour répondre" });
      expect(ticket.reminderAt).toBeNull();
      expect(ticket.save).toHaveBeenCalled();
      expect(summary.reminders).toBe(1);
    });

    it("rappelle au demandeur que sa réponse est attendue, et à l'administration sa première réponse", async () => {
      given({ reminders: [orderTicket({ status: S.AWAITING_REQUESTER, reminderAt: ago(HOUR) })] });
      await runSupportDeadlines(NOW);
      expect(delivered()[0]).toMatchObject({ recipient: "requester", title: "Votre réponse est attendue" });

      given({ reminders: [orderTicket({ status: S.AWAITING_ADMIN, reminderAt: ago(HOUR) })] });
      await runSupportDeadlines(NOW);
      expect(delivered()[0]).toMatchObject({ recipient: "admin", title: "Demande en attente de réponse" });
    });

    it("efface un rappel devenu sans objet sans prévenir personne", async () => {
      const ticket = orderTicket({ status: S.RESOLVED, reminderAt: ago(HOUR) });
      given({ reminders: [ticket] });

      const summary = await runSupportDeadlines(NOW);

      expect(deliverSupportNotices).not.toHaveBeenCalled();
      expect(ticket.reminderAt).toBeNull();
      expect(summary.reminders).toBe(1);
    });

    it("compte l'erreur d'un rappel et passe au suivant", async () => {
      const failing = orderTicket({ number: "SUP-000001", reminderAt: ago(HOUR) });
      (failing.save as any).mockRejectedValueOnce(new Error("écriture refusée"));
      const next = orderTicket({ number: "SUP-000002", reminderAt: ago(HOUR) });
      given({ reminders: [failing, next] });

      const summary = await runSupportDeadlines(NOW);

      expect(summary).toEqual({ reminders: 1, steps: 0, errors: 1 });
      expect(logger.error).toHaveBeenCalledWith("Rappel de SUP-000001 non envoyé : écriture refusée");
    });
  });

  describe("échéances", () => {
    const systemMessage = () => createdMessages()[0];

    it("escalade une demande que la boutique laisse sans réponse 48 heures", async () => {
      const ticket = orderTicket({ deadlineAt: ago(HOUR) });
      given({ deadlines: [ticket] });

      const summary = await runSupportDeadlines(NOW);

      expect(ticket).toMatchObject({ escalatedAt: NOW, status: S.AWAITING_ADMIN, deadlineAt: later(72 * HOUR), reminderAt: later(24 * HOUR) });
      expect(systemMessage()).toEqual({
        ticketId: ticket._id,
        author: { userId: null, party: SYSTEM, name: "Équipe de la plateforme" },
        visibility: SupportVisibility.PUBLIC,
        kind: SupportMessageKind.EVENT,
        body: "La boutique n'a pas répondu sous 48 heures : l'administration reprend la demande.",
      });
      expect(MessageMock.create.mock.calls[0]![1]).toEqual({ session });
      expect(ticket.save).toHaveBeenCalledWith({ session });
      expect(recipients()).toEqual(["admin", "requester", "shop"]);
      expect(summary).toEqual({ reminders: 0, steps: 1, errors: 0 });
      expect(session.commitTransaction).toHaveBeenCalledOnce();
    });

    it("rend à l'administration une demande escaladée dont la pièce n'arrive pas", async () => {
      const ticket = orderTicket({ status: S.AWAITING_REQUESTER, escalatedAt: ago(8 * DAY), deadlineAt: ago(HOUR) });
      given({ deadlines: [ticket] });

      await runSupportDeadlines(NOW);

      expect(ticket.status).toBe(S.AWAITING_ADMIN);
      expect(systemMessage().body).toBe("Pas de réponse dans les délais : la demande revient à l'administration.");
      expect(recipients()).toEqual(["admin"]);
    });

    it("ferme une demande dont le demandeur ne répond plus depuis 7 jours", async () => {
      const ticket = orderTicket({ status: S.AWAITING_REQUESTER, deadlineAt: ago(HOUR) });
      given({ deadlines: [ticket] });

      await runSupportDeadlines(NOW);

      expect(ticket.resolution).toEqual({ outcome: SupportOutcome.EXPIRED, by: SYSTEM, at: NOW });
      expect(ticket).toMatchObject({ status: S.CLOSED, closedAt: NOW, deadlineAt: null, reminderAt: null });
      expect(systemMessage().body).toMatch(/^Sans réponse du demandeur sous 7 jours/);
      expect(recipients()).toEqual(["requester"]);
    });

    it("ferme définitivement une décision sans recours, en silence", async () => {
      const ticket = orderTicket({ status: S.RESOLVED, resolvedAt: ago(8 * DAY), deadlineAt: ago(DAY) });
      given({ deadlines: [ticket] });

      const summary = await runSupportDeadlines(NOW);

      expect(ticket).toMatchObject({ status: S.CLOSED, closedAt: NOW, deadlineAt: null });
      expect(MessageMock.create).not.toHaveBeenCalled();
      expect(delivered()).toEqual([]);
      expect(summary.steps).toBe(1);
    });

    it("alerte l'administration d'une décision en retard, une seule fois", async () => {
      const ticket = orderTicket({ status: S.AWAITING_ADMIN, escalatedAt: ago(4 * DAY), deadlineAt: ago(HOUR) });
      given({ deadlines: [ticket] });

      await runSupportDeadlines(NOW);

      expect(ticket).toMatchObject({ status: S.AWAITING_ADMIN, deadlineAt: null });
      expect(delivered()[0]).toMatchObject({ recipient: "admin", title: "Délai de décision dépassé" });
    });

    it("efface l'échéance d'une demande fermée", async () => {
      const ticket = orderTicket({ status: S.CLOSED, deadlineAt: ago(HOUR) });
      given({ deadlines: [ticket] });

      await runSupportDeadlines(NOW);

      expect(ticket.deadlineAt).toBeNull();
      expect(ticket.save).toHaveBeenCalledWith({ session });
    });

    it("ne fait rien quand quelqu'un a répondu entre-temps", async () => {
      const due = orderTicket({ deadlineAt: ago(HOUR) });
      const fresh = orderTicket({ _id: due._id, status: S.AWAITING_REQUESTER, deadlineAt: later(7 * DAY) });
      given({ deadlines: [due], fresh });

      const summary = await runSupportDeadlines(NOW);

      expect(fresh.save).not.toHaveBeenCalled();
      expect(deliverSupportNotices).not.toHaveBeenCalled();
      expect(summary.steps).toBe(0);
    });

    it("ne fait rien quand l'échéance a été repoussée ou effacée", async () => {
      const due = orderTicket({ deadlineAt: ago(HOUR) });
      given({ deadlines: [due], fresh: orderTicket({ _id: due._id, deadlineAt: later(HOUR) }) });
      expect((await runSupportDeadlines(NOW)).steps).toBe(0);

      given({ deadlines: [due], fresh: orderTicket({ _id: due._id, deadlineAt: null }) });
      expect((await runSupportDeadlines(NOW)).steps).toBe(0);

      given({ deadlines: [due], fresh: null });
      expect((await runSupportDeadlines(NOW)).steps).toBe(0);
    });

    it("compte l'erreur d'une échéance, annule sa transaction et passe à la suivante", async () => {
      const failing = orderTicket({ number: "SUP-000001", deadlineAt: ago(HOUR) });
      (failing.save as any).mockRejectedValueOnce(new Error("conflit d'écriture"));
      const next = orderTicket({ number: "SUP-000002", status: S.RESOLVED, deadlineAt: ago(HOUR) });
      given({ deadlines: [failing, next] });

      const summary = await runSupportDeadlines(NOW);

      expect(summary).toEqual({ reminders: 0, steps: 1, errors: 1 });
      expect(session.abortTransaction).toHaveBeenCalledOnce();
      expect(logger.error).toHaveBeenCalledWith("Échéance de SUP-000001 non appliquée : conflit d'écriture");
      expect(next.status).toBe(S.CLOSED);
    });
  });
});

describe("startSupportScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopSupportScheduler();
    vi.useRealTimers();
  });

  it("passe une première fois tout de suite, puis à chaque intervalle, jusqu'à l'arrêt", async () => {
    startSupportScheduler(60_000);
    expect(TicketMock.find).toHaveBeenCalledWith({ reminderAt: { $lte: expect.any(Date) } });
    await vi.advanceTimersByTimeAsync(0);
    const firstPass = TicketMock.find.mock.calls.length;
    expect(firstPass).toBe(2); // rappels, puis échéances

    // Un second démarrage ne double pas la tâche.
    startSupportScheduler(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(TicketMock.find.mock.calls.length).toBe(firstPass * 2);

    stopSupportScheduler();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(TicketMock.find.mock.calls.length).toBe(firstPass * 2);
  });
});
