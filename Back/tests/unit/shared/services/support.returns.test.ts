import { describe, it, expect, vi, beforeEach } from "vitest";

// Seuls les modèles Mongoose sont simulés : enums et constantes restent réels.
vi.mock("../../../../src/models/supportTicket.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/supportTicket.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, SupportTicket: mockModel() };
});

vi.mock("../../../../src/models/supportMessage.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/supportMessage.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, SupportMessage: mockModel() };
});

vi.mock("../../../../src/models/user.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/user.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, User: mockModel() };
});

// Le compteur des numéros lisibles (SUP-000042).
vi.mock("../../../../src/models/counter.model.js", () => ({
  nextSequence: vi.fn(async () => 42),
}));

import { Types } from "mongoose";
import { nextSequence } from "../../../../src/models/counter.model.js";
import { ShopOrderStatus } from "../../../../src/models/shopOrder.model.js";
import { SupportMessage, SupportMessageKind, SupportVisibility } from "../../../../src/models/supportMessage.model.js";
import {
  SupportOutcome,
  SupportParty,
  SupportPriority,
  SupportTargetKind,
  SupportTicket,
  SupportTicketStatus,
  SupportTicketType,
} from "../../../../src/models/supportTicket.model.js";
import { User } from "../../../../src/models/user.model.js";
import { ShopOrderAction, type ActionInput } from "../../../../src/shared/helpers/shopOrder.workflow.js";
import { supportNumber, syncReturnTicket } from "../../../../src/shared/services/support.returns.js";
import { mockQuery } from "../../../helpers/model.mock.js";
import { mockSession } from "../../../helpers/express.mock.js";
import { makeShopOrder, makeSupportMessage, makeSupportTicket, makeUser, oid } from "../../../helpers/factories.js";

const TicketMock = SupportTicket as unknown as Record<string, any>;
const MessageMock = SupportMessage as unknown as Record<string, any>;
const UserMock = User as unknown as Record<string, any>;

const S = SupportTicketStatus;
const NOW = new Date("2026-10-25T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

let session: ReturnType<typeof mockSession>;

const part = makeShopOrder({
  reference: "CMD-42-1",
  boutiqueNom: "Boutique Kaloum",
  status: ShopOrderStatus.RETURN_REQUESTED,
});

const sync = (action: ShopOrderAction | string, input: ActionInput = {}, over: { part?: any; userId?: string } = {}) =>
  syncReturnTicket({
    part: over.part ?? part,
    action,
    input,
    now: NOW,
    session: session as any,
    userId: over.userId,
  });

/** Messages enregistrés au dernier appel de SupportMessage.create. */
const createdMessages = (): any[] => MessageMock.create.mock.calls.at(-1)?.[0] ?? [];

/** Le retour ouvert de la sous-commande, tel que la base le renvoie. */
const givenReturn = (over: Record<string, unknown> = {}) => {
  const ticket = makeSupportTicket({
    type: SupportTicketType.RETURN,
    reason: "damaged",
    status: S.AWAITING_SHOP,
    target: { kind: SupportTargetKind.SHOP_ORDER, id: part._id, label: part.reference },
    boutiqueId: part.boutiqueId,
    ...over,
  });
  const query = mockQuery(ticket);
  TicketMock.findOne.mockReturnValue(query);
  return { ticket, query };
};

beforeEach(() => {
  session = mockSession();
  vi.mocked(nextSequence).mockResolvedValue(42);
  UserMock.findById.mockReturnValue(mockQuery(makeUser({ _id: part.userId, prenom: "Aïssatou", nom: "Barry", email: "aissatou@example.com" })));
  TicketMock.findOne.mockReturnValue(mockQuery(null));
  TicketMock.create.mockImplementation(async (docs: any[]) => docs.map((d) => makeSupportTicket(d)));
  MessageMock.create.mockImplementation(async (docs: any[]) => docs.map((d) => makeSupportMessage(d)));
});

// ─────────────────────────────────────────────
describe("supportNumber", () => {
  it("numérote les demandes à la suite, sur 6 chiffres", async () => {
    await expect(supportNumber()).resolves.toBe("SUP-000042");
    expect(nextSequence).toHaveBeenCalledWith("support_ticket");
  });

  it("ne tronque pas un numéro qui dépasse 6 chiffres", async () => {
    vi.mocked(nextSequence).mockResolvedValue(1_234_567);

    await expect(supportNumber()).resolves.toBe("SUP-1234567");
  });
});

// ─────────────────────────────────────────────
describe("syncReturnTicket — « Demander un retour » ouvre la demande", () => {
  it("ouvre une demande de retour chez la boutique, sans échéance propre", async () => {
    const ticket = await sync(ShopOrderAction.REQUEST_RETURN, { reason: "damaged", note: "Écran fissuré." });

    const [doc] = TicketMock.create.mock.calls[0]![0];
    expect(TicketMock.create.mock.calls[0]![1]).toEqual({ session });
    expect(doc).toMatchObject({
      number: "SUP-000042",
      type: SupportTicketType.RETURN,
      reason: "damaged",
      subject: "Produit abîmé — CMD-42-1",
      status: S.AWAITING_SHOP,
      priority: SupportPriority.NORMAL,
      requester: { userId: part.userId, accountType: "user", name: "Aïssatou Barry", email: "aissatou@example.com" },
      target: { kind: SupportTargetKind.SHOP_ORDER, id: part._id, label: "CMD-42-1" },
      boutiqueId: part.boutiqueId,
      orderId: part.orderId,
      deadlineAt: null,
      reminderAt: null,
      lastMessageAt: NOW,
    });
    expect(ticket).toMatchObject({ number: "SUP-000042" });
  });

  it("lit le client dans la transaction", async () => {
    const query = mockQuery(makeUser());
    UserMock.findById.mockReturnValue(query);

    await sync(ShopOrderAction.REQUEST_RETURN, { reason: "damaged" });

    expect(UserMock.findById).toHaveBeenCalledWith(part.userId);
    expect(query.session).toHaveBeenCalledWith(session);
  });

  it("fait du motif et de la note du client le premier message", async () => {
    const ticket = await sync(ShopOrderAction.REQUEST_RETURN, { reason: "damaged", note: "  Écran fissuré.  " });

    expect(createdMessages()).toEqual([
      {
        ticketId: ticket!._id,
        author: { userId: part.userId, party: SupportParty.REQUESTER, name: "Aïssatou Barry" },
        visibility: SupportVisibility.PUBLIC,
        kind: SupportMessageKind.MESSAGE,
        body: "Écran fissuré.",
        attachments: [],
      },
    ]);
    expect(MessageMock.create.mock.calls[0]![1]).toEqual({ session });
  });

  it("écrit le motif quand le client n'a rien ajouté", async () => {
    await sync(ShopOrderAction.REQUEST_RETURN, { reason: "incomplete", note: "   " });

    expect(createdMessages()[0].body).toBe("Retour demandé : Commande incomplète.");
  });

  it("joint les photos du retour au premier message", async () => {
    await sync(ShopOrderAction.REQUEST_RETURN, {
      reason: "damaged",
      photos: ["/uploads/images/2026-10-25/ecran.JPG", "/uploads/images/2026-10-25/facture.pdf", "/uploads/files/notice.docx"],
    });

    expect(createdMessages()[0].attachments).toEqual([
      { url: "/uploads/images/2026-10-25/ecran.JPG", name: "ecran.JPG", mimetype: "image/jpeg", size: 0 },
      { url: "/uploads/images/2026-10-25/facture.pdf", name: "facture.pdf", mimetype: "application/pdf", size: 0 },
      { url: "/uploads/files/notice.docx", name: "notice.docx", mimetype: "application/octet-stream", size: 0 },
    ]);
  });

  it("retient « produit non conforme » faute de motif, et « Client » faute de compte", async () => {
    UserMock.findById.mockReturnValue(mockQuery(null));

    await sync(ShopOrderAction.REQUEST_RETURN, {});

    const [doc] = TicketMock.create.mock.calls[0]![0];
    expect(doc.reason).toBe("not_as_described");
    expect(doc.subject).toBe("Produit non conforme — CMD-42-1");
    expect(doc.requester).toMatchObject({ name: "Client", email: undefined });
    expect(createdMessages()[0].author.name).toBe("Client");
  });

  it("ne crée aucun message quand la demande n'a pas pu être créée", async () => {
    TicketMock.create.mockResolvedValue([]);

    await expect(sync(ShopOrderAction.REQUEST_RETURN, { reason: "damaged" })).resolves.toBeNull();
    expect(MessageMock.create).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("syncReturnTicket — la demande suit la sous-commande", () => {
  it("cherche le retour le plus récent de la sous-commande, encore ouvert, dans la transaction", async () => {
    const { query } = givenReturn();

    await sync(ShopOrderAction.ACCEPT_RETURN);

    expect(TicketMock.findOne).toHaveBeenCalledWith({
      type: SupportTicketType.RETURN,
      "target.id": part._id,
      status: { $ne: S.CLOSED },
    });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(query.session).toHaveBeenCalledWith(session);
  });

  it("ne fait rien sans demande de retour ouverte", async () => {
    await expect(sync(ShopOrderAction.ACCEPT_RETURN)).resolves.toBeNull();
    expect(MessageMock.create).not.toHaveBeenCalled();
  });

  it("résout la demande quand la boutique accepte le retour, recours possible 7 jours", async () => {
    const { ticket } = givenReturn();

    await sync(ShopOrderAction.ACCEPT_RETURN);

    expect(ticket).toMatchObject({
      status: S.RESOLVED,
      shopRespondedAt: NOW,
      resolvedAt: NOW,
      resolution: { outcome: SupportOutcome.UPHELD, note: "Retour accepté par la boutique.", by: SupportParty.SHOP, at: NOW },
      deadlineAt: new Date(NOW.getTime() + 7 * DAY),
      reminderAt: null,
      lastMessageAt: NOW,
    });
    expect(ticket.save).toHaveBeenCalledWith({ session });
    expect(createdMessages()).toEqual([
      expect.objectContaining({
        ticketId: ticket._id,
        author: { userId: null, party: SupportParty.SHOP, name: "Boutique Kaloum" },
        kind: SupportMessageKind.EVENT,
        body: "La boutique accepte le retour : elle rembourse à la reprise du produit.",
      }),
    ]);
    expect(MessageMock.create.mock.calls[0]![1]).toEqual({ session, ordered: true });
  });

  it("signe « Boutique » quand la sous-commande n'a pas de nom de boutique", async () => {
    givenReturn();

    await sync(ShopOrderAction.ACCEPT_RETURN, {}, { part: { ...part, boutiqueNom: undefined } });

    expect(createdMessages()[0].author.name).toBe("Boutique");
  });

  it("passe à l'administration quand la boutique refuse, avec son explication", async () => {
    const { ticket } = givenReturn();

    await sync(ShopOrderAction.REJECT_RETURN, { note: "Le produit a été utilisé." });

    expect(ticket).toMatchObject({ status: S.AWAITING_ADMIN, escalatedAt: NOW, shopRespondedAt: NOW, deadlineAt: null, reminderAt: null });
    expect(createdMessages()).toEqual([
      expect.objectContaining({
        author: { userId: null, party: SupportParty.SHOP, name: "Boutique Kaloum" },
        kind: SupportMessageKind.MESSAGE,
        body: "Le produit a été utilisé.",
      }),
      expect.objectContaining({
        author: { userId: null, party: SupportParty.SYSTEM, name: "Plateforme" },
        kind: SupportMessageKind.EVENT,
        body: "La boutique refuse le retour : l'administration va trancher.",
      }),
    ]);
  });

  it("écrit un refus par défaut quand la boutique ne l'explique pas", async () => {
    givenReturn();

    await sync(ShopOrderAction.REJECT_RETURN, {});

    expect(createdMessages()[0].body).toBe("La boutique refuse le retour.");
  });

  it("passe à l'administration quand la boutique laisse passer 48 heures", async () => {
    const { ticket } = givenReturn();

    await sync(ShopOrderAction.ESCALATE);

    expect(ticket).toMatchObject({ status: S.AWAITING_ADMIN, escalatedAt: NOW, shopRespondedAt: null });
    expect(createdMessages()).toEqual([
      expect.objectContaining({
        author: { userId: null, party: SupportParty.SYSTEM, name: "Plateforme" },
        body: "La boutique n'a pas répondu sous 48 heures : l'administration va trancher.",
      }),
    ]);
  });

  it("enregistre la décision de l'administration en faveur du client", async () => {
    const { ticket } = givenReturn({ status: S.AWAITING_ADMIN, escalatedAt: NOW });
    const adminId = oid().toString();

    await sync(ShopOrderAction.RESOLVE_DISPUTE, { resolution: "refund_full", note: "  Remboursement intégral.  " }, { userId: adminId });

    expect(ticket.status).toBe(S.RESOLVED);
    expect(ticket.resolution).toEqual({
      outcome: SupportOutcome.UPHELD,
      note: "Remboursement intégral.",
      by: SupportParty.ADMIN,
      decidedBy: new Types.ObjectId(adminId),
      at: NOW,
    });
    expect(ticket).toMatchObject({ resolvedAt: NOW, adminRespondedAt: NOW, deadlineAt: new Date(NOW.getTime() + 7 * DAY) });
    expect(createdMessages()).toEqual([
      expect.objectContaining({
        author: { userId: null, party: SupportParty.ADMIN, name: "Équipe de la plateforme" },
        kind: SupportMessageKind.DECISION,
        body: "Remboursement intégral.",
      }),
    ]);
  });

  it("enregistre un rejet du retour, sans auteur connu ni note", async () => {
    const { ticket } = givenReturn({ status: S.AWAITING_ADMIN });

    await sync(ShopOrderAction.RESOLVE_DISPUTE, { resolution: "rejected" });

    expect(ticket.resolution).toMatchObject({ outcome: SupportOutcome.REJECTED, note: undefined, decidedBy: null });
    expect(createdMessages()[0].body).toBe("Décision de l'administration.");
  });

  it("note le remboursement confirmé sans changer le statut", async () => {
    const { ticket } = givenReturn({ status: S.RESOLVED });

    await sync(ShopOrderAction.CONFIRM_REFUND);

    expect(ticket.status).toBe(S.RESOLVED);
    expect(ticket.lastMessageAt).toEqual(NOW);
    expect(ticket.save).toHaveBeenCalledWith({ session });
    expect(createdMessages()).toEqual([expect.objectContaining({ body: "Remboursement confirmé." })]);
  });

  it.each([ShopOrderStatus.COMPLETED, ShopOrderStatus.CANCELLED])(
    "ferme le retour quand la sous-commande se termine (%s)",
    async (status) => {
      const { ticket } = givenReturn({ status: S.RESOLVED, deadlineAt: NOW });

      await sync(ShopOrderAction.COMPLETE, {}, { part: { ...part, status } });

      expect(ticket).toMatchObject({ status: S.CLOSED, closedAt: NOW, deadlineAt: null, reminderAt: null });
      expect(ticket.save).toHaveBeenCalledWith({ session });
      expect(MessageMock.create).not.toHaveBeenCalled();
    }
  );

  it("laisse le retour en l'état pour toute autre étape de la sous-commande", async () => {
    const { ticket } = givenReturn();

    const result = await sync(ShopOrderAction.SHIP, {}, { part: { ...part, status: ShopOrderStatus.SHIPPED } });

    expect(result).toBe(ticket);
    expect(ticket.status).toBe(S.AWAITING_SHOP);
    expect(ticket.save).not.toHaveBeenCalled();
    expect(MessageMock.create).not.toHaveBeenCalled();
  });
});
