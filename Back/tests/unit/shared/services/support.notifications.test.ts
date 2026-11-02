import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../../src/models/boutique.model.js", async () => {
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { Shop: mockModel() };
});

vi.mock("../../../../src/models/user.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/user.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, User: mockModel() };
});

// Les emails partent dans une file asynchrone : on vérifie l'appel, pas l'envoi.
vi.mock("../../../../src/shared/helpers/mail.helper.js", () => ({
  sendNoticeMail: vi.fn(() => 1),
}));

import { Shop } from "../../../../src/models/boutique.model.js";
import { SupportTicketType } from "../../../../src/models/supportTicket.model.js";
import { User } from "../../../../src/models/user.model.js";
import logger from "../../../../src/shared/logger/logger.js";
import { sendNoticeMail } from "../../../../src/shared/helpers/mail.helper.js";
import {
  deliverSupportNotices,
  eventNotices,
  messageNotices,
  newTicketNotices,
  ticketLink,
  type SupportNotice,
} from "../../../../src/shared/services/support.notifications.js";
import { mockQuery } from "../../../helpers/model.mock.js";
import { makeShop, makeSupportTicket, makeUser, oid } from "../../../helpers/factories.js";

const ShopMock = Shop as unknown as Record<string, any>;
const UserMock = User as unknown as Record<string, any>;

const requester = makeUser({ prenom: "Aïssatou", email: "aissatou@example.com" });
const owner = makeUser({ prenom: "Ibrahima", email: "ibrahima@kaloum.gn" });
const shop = makeShop({ ownerId: owner._id, email: "contact@kaloum.gn" });

const ticket = makeSupportTicket({
  number: "SUP-000042",
  subject: "Retard — CMD-42-1",
  boutiqueId: shop._id,
  requester: { userId: requester._id, accountType: "user", name: "Aïssatou Barry", email: "ancien@example.com" },
});

const notice = (over: Partial<SupportNotice> = {}): SupportNotice => ({
  recipient: "requester",
  subject: "Sujet",
  title: "Titre",
  paragraphs: ["Paragraphe"],
  ...over,
});

/** Les comptes et boutiques en base, trouvés par leur identifiant. */
const givenDocs = (...docs: any[]) => {
  const byId = (id: unknown) => mockQuery(docs.find((d) => String(d._id) === String(id)) ?? null);
  UserMock.findById.mockImplementation(byId);
  ShopMock.findById.mockImplementation(byId);
};

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

beforeEach(() => {
  givenDocs(requester, owner, shop);
  process.env.ADMIN_EMAIL = "support@plateforme.gn";
});

afterEach(() => {
  if (ADMIN_EMAIL === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = ADMIN_EMAIL;
});

// ─────────────────────────────────────────────
describe("ticketLink", () => {
  const id = String(ticket._id);

  it("mène l'administration à sa file", () => {
    expect(ticketLink(ticket, "admin")).toEqual({ path: `/admin/support/${id}`, label: "Traiter la demande" });
  });

  it("mène la boutique partie à son Espace boutique", () => {
    expect(ticketLink(ticket, "shop")).toEqual({ path: `/ma-boutique/${String(shop._id)}/support/${id}`, label: "Répondre" });
  });

  it("mène un client à son compte", () => {
    expect(ticketLink(ticket, "requester")).toEqual({ path: `/compte/support/${id}`, label: "Voir ma demande" });
  });

  it("mène une boutique demandeuse à son Espace boutique", () => {
    const shopId = oid();
    const asked = makeSupportTicket({ requesterShopId: shopId });

    expect(ticketLink(asked, "requester")).toEqual({
      path: `/ma-boutique/${String(shopId)}/support/${String(asked._id)}`,
      label: "Voir ma demande",
    });
  });

  it("n'offre aucun lien à un visiteur sans compte", () => {
    const guest = makeSupportTicket({ requester: { userId: null, accountType: "guest", name: "Visiteur", email: "v@example.com" } });

    expect(ticketLink(guest, "requester")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
describe("newTicketNotices", () => {
  it("prévient le client et la boutique, qui a 48 heures pour répondre", () => {
    const notices = newTicketNotices(ticket, true);

    expect(notices.map((n) => n.recipient)).toEqual(["requester", "shop"]);
    expect(notices[0]).toMatchObject({
      subject: "Demande SUP-000042 enregistrée",
      title: "Votre demande est enregistrée",
      paragraphs: ["SUP-000042 — Retard — CMD-42-1", expect.stringContaining("La boutique a 48 heures")],
    });
    expect(notices[1]).toMatchObject({
      subject: "Nouvelle demande SUP-000042",
      title: "Un client a besoin de vous",
      paragraphs: ["SUP-000042 — Retard — CMD-42-1", expect.stringContaining("Répondez sous 48 heures")],
    });
  });

  it("prévient l'administration d'un signalement, et le demandeur d'une réponse sous 24 heures", () => {
    const report = makeSupportTicket({ ...ticket, type: SupportTicketType.LISTING_REPORT });

    const notices = newTicketNotices(report, false);

    expect(notices.map((n) => n.recipient)).toEqual(["requester", "admin"]);
    expect(notices[0]!.paragraphs[1]).toBe("L'équipe de la plateforme vous répond sous 24 heures.");
    expect(notices[1]).toMatchObject({
      subject: "Signalement d'annonce : SUP-000042",
      title: "Signalement d'annonce",
      paragraphs: ["SUP-000042 — Retard — CMD-42-1"],
    });
  });
});

describe("messageNotices et eventNotices", () => {
  it("prévient chaque destinataire d'un nouveau message, avec son auteur", () => {
    const notices = messageNotices(ticket, ["shop", "admin"], "Aïssatou Barry");

    expect(notices).toEqual([
      {
        recipient: "shop",
        subject: "Nouveau message — SUP-000042",
        title: "Nouveau message sur une demande",
        paragraphs: ["SUP-000042 — Retard — CMD-42-1", "Aïssatou Barry a écrit dans la demande."],
      },
      expect.objectContaining({ recipient: "admin" }),
    ]);
  });

  it("annonce un événement à chaque destinataire", () => {
    const notices = eventNotices(ticket, ["requester"], "Demande fermée", "Vous pouvez la rouvrir.");

    expect(notices).toEqual([
      {
        recipient: "requester",
        subject: "Demande fermée — SUP-000042",
        title: "Demande fermée",
        paragraphs: ["SUP-000042 — Retard — CMD-42-1", "Vous pouvez la rouvrir."],
      },
    ]);
  });

  it("ne prévient personne sans destinataire", () => {
    expect(eventNotices(ticket, [], "Titre", "Ligne")).toEqual([]);
  });
});

// ─────────────────────────────────────────────
describe("deliverSupportNotices", () => {
  it("ne lit rien et n'envoie rien sans avis", async () => {
    await deliverSupportNotices([], ticket);

    expect(UserMock.findById).not.toHaveBeenCalled();
    expect(sendNoticeMail).not.toHaveBeenCalled();
  });

  it("écrit au demandeur à l'adresse de son compte, par son prénom, avec le lien de la demande", async () => {
    await deliverSupportNotices([notice({ subject: "Demande enregistrée", paragraphs: ["a", "b"] })], ticket);

    expect(sendNoticeMail).toHaveBeenCalledWith({
      to: "aissatou@example.com",
      subject: "Demande enregistrée",
      title: "Titre",
      username: "Aïssatou",
      paragraphs: ["a", "b"],
      cta: { path: `/compte/support/${String(ticket._id)}`, label: "Voir ma demande" },
    });
    expect(ShopMock.findById).not.toHaveBeenCalled();
  });

  it("écrit à un visiteur à l'adresse laissée dans le formulaire, sans lien", async () => {
    const guest = makeSupportTicket({ requester: { userId: null, accountType: "guest", name: "Fatou", email: "fatou@example.com" } });

    await deliverSupportNotices([notice()], guest);

    expect(UserMock.findById).not.toHaveBeenCalled();
    expect(sendNoticeMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "fatou@example.com", username: "Fatou", cta: undefined })
    );
  });

  it("écrit au gérant de la boutique, ou à la boutique faute de gérant", async () => {
    await deliverSupportNotices([notice({ recipient: "shop" })], ticket);

    expect(sendNoticeMail).toHaveBeenLastCalledWith(expect.objectContaining({ to: "ibrahima@kaloum.gn", username: "Ibrahima" }));

    givenDocs(requester, shop);
    await deliverSupportNotices([notice({ recipient: "shop" })], ticket);

    expect(sendNoticeMail).toHaveBeenLastCalledWith(expect.objectContaining({ to: "contact@kaloum.gn", username: undefined }));
  });

  it("écrit à l'administration à l'adresse configurée", async () => {
    await deliverSupportNotices([notice({ recipient: "admin" })], ticket);

    expect(sendNoticeMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "support@plateforme.gn",
        username: undefined,
        cta: { path: `/admin/support/${String(ticket._id)}`, label: "Traiter la demande" },
      })
    );
    expect(UserMock.findById).not.toHaveBeenCalled();
  });

  it("saute un avis sans destinataire et envoie les autres", async () => {
    delete process.env.ADMIN_EMAIL;

    await deliverSupportNotices([notice({ recipient: "admin", subject: "Pour l'équipe" }), notice()], ticket);

    expect(logger.info).toHaveBeenCalledWith("Avis « Pour l'équipe » sans destinataire (admin)");
    expect(sendNoticeMail).toHaveBeenCalledOnce();
    expect(sendNoticeMail).toHaveBeenCalledWith(expect.objectContaining({ to: "aissatou@example.com" }));
  });

  it("n'échoue jamais : une base indisponible est seulement journalisée", async () => {
    UserMock.findById.mockImplementation(() => {
      throw new Error("base indisponible");
    });

    await expect(deliverSupportNotices([notice()], ticket)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith("Avis de support non envoyés : base indisponible");
    expect(sendNoticeMail).not.toHaveBeenCalled();
  });
});
