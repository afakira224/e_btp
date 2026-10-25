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

import { DeliveryMethod } from "../../../../src/models/delivery.model.js";
import { ShopOrderStatus } from "../../../../src/models/shopOrder.model.js";
import { Shop } from "../../../../src/models/boutique.model.js";
import { User } from "../../../../src/models/user.model.js";
import logger from "../../../../src/shared/logger/logger.js";
import { sendNoticeMail } from "../../../../src/shared/helpers/mail.helper.js";
import { ShopOrderAction } from "../../../../src/shared/helpers/shopOrder.workflow.js";
import {
  deliverNotices,
  newPartNotices,
  noticesForAction,
  reminderNotices,
  stalledNotices,
  type ShopOrderNotice,
} from "../../../../src/shared/services/shopOrder.notifications.js";
import { mockQuery } from "../../../helpers/model.mock.js";
import { makeShop, makeShopOrder, makeUser } from "../../../helpers/factories.js";

const ShopMock = Shop as unknown as Record<string, any>;
const UserMock = User as unknown as Record<string, any>;

const S = ShopOrderStatus;
const part = makeShopOrder({
  reference: "CMD-42-1",
  boutiqueNom: "Boutique Kaloum",
  amount: 75_000,
  pickupCode: "481516",
});

const notice = (over: Partial<ShopOrderNotice> = {}): ShopOrderNotice => ({
  recipient: "client",
  subject: "Sujet",
  title: "Titre",
  paragraphs: ["Paragraphe"],
  cta: { path: "/compte", label: "Voir" },
  ...over,
});

const recipients = (notices: ShopOrderNotice[]) => notices.map((n) => n.recipient);
const text = (n: ShopOrderNotice) => n.paragraphs.join(" ");

/** Montant tel qu'affiché en français (espace insécable fine entre les milliers). */
const gnf = (digits: string) => new RegExp(`${digits.replace(" ", "\\s")} GNF`);

// ─────────────────────────────────────────────
describe("newPartNotices", () => {
  it("prévient la boutique d'une nouvelle commande à confirmer sous 48 heures", () => {
    const [shopNotice, ...rest] = newPartNotices(part);

    expect(rest).toHaveLength(0);
    expect(shopNotice).toMatchObject({
      recipient: "shop",
      subject: "Nouvelle commande CMD-42-1",
      cta: {
        path: `/ma-boutique/${String(part.boutiqueId)}/commandes/${String(part._id)}`,
        label: "Ouvrir la commande",
      },
    });
    expect(text(shopNotice!)).toMatch(gnf("75 000"));
    expect(text(shopNotice!)).toContain("48 heures");
  });
});

// ─────────────────────────────────────────────
describe("noticesForAction", () => {
  const input = {};

  it("confirmation : le client est prévenu, avec un lien vers sa commande", () => {
    const notices = noticesForAction(ShopOrderAction.CONFIRM, part, { refund: 0, input, from: S.PENDING });

    expect(notices).toEqual([
      expect.objectContaining({
        recipient: "client",
        subject: "Commande CMD-42-1 confirmée",
        cta: { path: `/compte/commandes/${String(part.orderId)}`, label: "Voir ma commande" },
      }),
    ]);
    expect(text(notices[0]!)).toContain("Boutique Kaloum a confirmé");
  });

  it("refus : motif lisible avec sa précision, et remboursement annoncé", () => {
    const [n] = noticesForAction(ShopOrderAction.REFUSE, part, {
      refund: 75_000,
      input: { reason: "out_of_stock", note: "  dernier exemplaire vendu  " },
      from: S.PENDING,
    });

    expect(n!.recipient).toBe("client");
    expect(n!.paragraphs[0]).toBe(
      "Boutique Kaloum ne peut pas honorer votre commande : Rupture de stock — dernier exemplaire vendu."
    );
    expect(n!.paragraphs[1]).toMatch(/^Remboursement : 75\s000 GNF\.$/);
  });

  it("refus sans rien encaissé : rien à rembourser", () => {
    const [n] = noticesForAction(ShopOrderAction.REFUSE, part, {
      refund: 0,
      input: { reason: "wrong_price" },
      from: S.PENDING,
    });

    expect(n!.paragraphs[1]).toBe("Rien n'a été encaissé : il n'y a rien à rembourser.");
  });

  it("annulation par le client : la boutique est prévenue, motif ou mention par défaut", () => {
    const [withReason] = noticesForAction(ShopOrderAction.CANCEL, part, {
      refund: 0,
      input: { reason: "too_slow" },
      from: S.PENDING,
    });
    const [without] = noticesForAction(ShopOrderAction.CANCEL, part, { refund: 0, input: {}, from: S.PENDING });

    expect(withReason!.recipient).toBe("shop");
    expect(text(withReason!)).toContain(": Délai trop long.");
    expect(text(without!)).toContain(": aucun motif précisé.");
  });

  it("annulation par l'administration : le client et la boutique sont prévenus", () => {
    const notices = noticesForAction(ShopOrderAction.ADMIN_CANCEL, part, {
      refund: 0,
      input: { note: "Fraude suspectée" },
      from: S.CONFIRMED,
    });

    expect(recipients(notices)).toEqual(["client", "shop"]);
    expect(text(notices[0]!)).toContain("Fraude suspectée");
  });

  it("expédition : le client reçoit son code de remise", () => {
    const [n] = noticesForAction(ShopOrderAction.SHIP, part, { refund: 0, input, from: S.CONFIRMED });

    expect(n!.recipient).toBe("client");
    expect(n!.subject).toBe("Commande CMD-42-1 en route");
    expect(text(n!)).toContain("a lancé la livraison");
    expect(text(n!)).toContain("Votre code de remise : 481516.");
  });

  it("nouvelle tentative : le code est rappelé, la livraison est relancée", () => {
    const [n] = noticesForAction(ShopOrderAction.RETRY_DELIVERY, part, {
      refund: 0,
      input,
      from: S.DELIVERY_FAILED,
    });

    expect(text(n!)).toContain("a relancé la livraison");
    expect(text(n!)).toContain("481516");
  });

  it("mise au retrait : adresse de la boutique et code de remise", () => {
    const pickup = makeShopOrder({
      pickupCode: "481516",
      delivery: { method: DeliveryMethod.PICKUP, fee: 0, pickupAdresse: "Kaloum, Conakry" },
    });

    const [n] = noticesForAction(ShopOrderAction.READY, pickup, { refund: 0, input, from: S.CONFIRMED });

    expect(n!.paragraphs[0]).toBe("Retirez-la chez Boutique Kaloum, Kaloum, Conakry, sous 7 jours.");
    expect(text(n!)).toContain("481516");
  });

  it("remise : « retirée » pour un retrait, « livrée » sinon", () => {
    const pickup = makeShopOrder({ reference: "R-1", delivery: { method: DeliveryMethod.PICKUP, fee: 0 } });

    const [retrait] = noticesForAction(ShopOrderAction.DELIVER, pickup, { refund: 0, input, from: S.READY_FOR_PICKUP });
    const [livraison] = noticesForAction(ShopOrderAction.DELIVER, part, { refund: 0, input, from: S.SHIPPED });

    expect(retrait!.subject).toBe("Commande R-1 retirée");
    expect(livraison!.subject).toBe("Commande CMD-42-1 livrée");
  });

  it("échec de livraison : le client lit le motif", () => {
    const [n] = noticesForAction(ShopOrderAction.FAIL_DELIVERY, part, {
      refund: 0,
      input: { reason: "address_not_found" },
      from: S.SHIPPED,
    });

    expect(text(n!)).toContain("Adresse introuvable");
  });

  it("demande de retour : la boutique est prévenue et a 48 heures", () => {
    const [n] = noticesForAction(ShopOrderAction.REQUEST_RETURN, part, {
      refund: 0,
      input: { reason: "damaged" },
      from: S.DELIVERED,
    });

    expect(n!.recipient).toBe("shop");
    expect(text(n!)).toContain("Produit abîmé");
    expect(text(n!)).toContain("48 heures");
  });

  it("retour refusé par la boutique : le client, la boutique et l'administration sont prévenus", () => {
    const notices = noticesForAction(ShopOrderAction.REJECT_RETURN, part, {
      refund: 0,
      input: { note: "  Produit conforme  " },
      from: S.RETURN_REQUESTED,
    });

    expect(recipients(notices)).toEqual(["client", "shop", "admin"]);
    for (const n of notices) expect(n.paragraphs[0]).toBe("La boutique refuse le retour : Produit conforme");
    expect(notices[2]).toMatchObject({
      subject: "Litige à trancher : CMD-42-1",
      cta: { path: `/admin/commandes/${String(part._id)}`, label: "Examiner" },
    });
  });

  it("litige ouvert faute de réponse : même trio, avec le motif du délai", () => {
    const notices = noticesForAction(ShopOrderAction.ESCALATE, part, {
      refund: 0,
      input: {},
      from: S.RETURN_REQUESTED,
    });

    expect(recipients(notices)).toEqual(["client", "shop", "admin"]);
    expect(notices[0]!.paragraphs[0]).toBe("La boutique n'a pas répondu sous 48 heures.");
  });

  it("litige tranché : le client et la boutique lisent la même décision", () => {
    const rejected = noticesForAction(ShopOrderAction.RESOLVE_DISPUTE, part, {
      refund: 0,
      input: { resolution: "rejected", note: "Aucun défaut visible" },
      from: S.DISPUTED,
    });
    const refunded = noticesForAction(ShopOrderAction.RESOLVE_DISPUTE, part, {
      refund: 20_000,
      input: { resolution: "refund_partial", note: "Un article manquait" },
      from: S.DISPUTED,
    });

    expect(recipients(rejected)).toEqual(["client", "shop"]);
    expect(rejected[0]!.paragraphs).toEqual([
      "Le retour est rejeté : la commande est close.",
      "Motif : Aucun défaut visible",
    ]);
    expect(refunded[1]!.paragraphs[0]).toMatch(/^Le retour est accepté\. Remboursement : 20\s000 GNF\.$/);
  });

  it("expiration d'une commande prête au retrait : seul le client est prévenu (« non retirée »)", () => {
    const notices = noticesForAction(ShopOrderAction.EXPIRE, part, {
      refund: 0,
      input: {},
      from: S.READY_FOR_PICKUP,
    });

    expect(recipients(notices)).toEqual(["client"]);
    expect(notices[0]!.subject).toBe("Commande CMD-42-1 non retirée");
    expect(text(notices[0]!)).toContain("7 jours");
  });

  it("expiration d'une commande non confirmée : le client et l'administration sont prévenus", () => {
    const notices = noticesForAction(ShopOrderAction.EXPIRE, part, {
      refund: 75_000,
      input: {},
      from: S.PENDING,
    });

    expect(recipients(notices)).toEqual(["client", "admin"]);
    expect(notices[0]!.subject).toBe("Commande CMD-42-1 expirée");
    expect(notices[0]!.paragraphs).toEqual([
      "Boutique Kaloum n'a pas confirmé votre commande sous 48 heures.",
      expect.stringMatching(/^Remboursement : 75\s000 GNF\.$/),
    ]);
    expect(notices[1]!.paragraphs[0]).toBe("Boutique Kaloum a laissé expirer la commande CMD-42-1.");
  });

  it("déclaration de remboursement et retour accepté : le client est prévenu", () => {
    const [refund] = noticesForAction(ShopOrderAction.CONFIRM_REFUND, part, { refund: 0, input, from: S.RETURNED });
    const [accepted] = noticesForAction(ShopOrderAction.ACCEPT_RETURN, part, {
      refund: 75_000,
      input,
      from: S.RETURN_REQUESTED,
    });

    expect(refund!.recipient).toBe("client");
    expect(accepted!.recipient).toBe("client");
    expect(text(accepted!)).toMatch(gnf("75 000"));
  });

  it("nomme « La boutique » quand son nom n'a pas été figé", () => {
    const anonymous = makeShopOrder({ boutiqueNom: undefined });

    const [n] = noticesForAction(ShopOrderAction.CONFIRM, anonymous, { refund: 0, input, from: S.PENDING });

    expect(n!.paragraphs[0]).toBe("La boutique a confirmé votre commande et la prépare.");
  });

  it("ne prévient personne d'une clôture automatique", () => {
    expect(noticesForAction(ShopOrderAction.COMPLETE, part, { refund: 0, input, from: S.DELIVERED })).toEqual([]);
  });
});

// ─────────────────────────────────────────────
describe("reminderNotices / stalledNotices", () => {
  it("rappelle à la boutique une commande à confirmer", () => {
    const notices = reminderNotices(makeShopOrder({ status: S.PENDING, reference: "R-1" }));

    expect(notices).toEqual([expect.objectContaining({ recipient: "shop", subject: "Rappel : commande R-1 à confirmer" })]);
  });

  it("rappelle au client une commande à retirer", () => {
    const notices = reminderNotices(makeShopOrder({ status: S.READY_FOR_PICKUP }));

    expect(recipients(notices)).toEqual(["client"]);
    expect(text(notices[0]!)).toContain("Boutique Kaloum");
  });

  it("rappelle à la boutique un retour à traiter", () => {
    expect(recipients(reminderNotices(makeShopOrder({ status: S.RETURN_REQUESTED })))).toEqual(["shop"]);
  });

  it("n'envoie aucun rappel pour les autres statuts", () => {
    expect(reminderNotices(makeShopOrder({ status: S.SHIPPED }))).toEqual([]);
  });

  it("alerte l'administration d'une livraison bloquée", () => {
    const notices = stalledNotices(part);

    expect(notices).toEqual([
      expect.objectContaining({ recipient: "admin", subject: "Livraison bloquée : CMD-42-1" }),
    ]);
  });
});

// ─────────────────────────────────────────────
describe("deliverNotices", () => {
  const client = makeUser({ email: "client@example.com", prenom: "Aïssatou" });
  const owner = makeUser({ email: "gerant@example.com", prenom: "Ousmane" });
  const shop = makeShop({ ownerId: owner._id, email: "contact@kaloum.gn" });
  const target = makeShopOrder({ userId: client._id, boutiqueId: shop._id });

  const givenUsers = (...users: any[]) =>
    UserMock.findById.mockImplementation((id: unknown) =>
      mockQuery(users.find((user) => user._id.toString() === String(id)) ?? null)
    );

  beforeEach(() => {
    givenUsers(client, owner);
    ShopMock.findById.mockReturnValue(mockQuery(shop));
    vi.stubEnv("ADMIN_EMAIL", "admin@e-btp.gn");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ne consulte rien quand il n'y a aucun avis", async () => {
    await deliverNotices([], target);

    expect(UserMock.findById).not.toHaveBeenCalled();
    expect(sendNoticeMail).not.toHaveBeenCalled();
  });

  it("écrit au client à l'adresse de son compte, avec son prénom", async () => {
    const n = notice({ recipient: "client", subject: "Commande confirmée" });

    await deliverNotices([n], target);

    expect(UserMock.findById).toHaveBeenCalledWith(client._id);
    expect(ShopMock.findById).not.toHaveBeenCalled();
    expect(sendNoticeMail).toHaveBeenCalledWith({
      to: "client@example.com",
      subject: "Commande confirmée",
      title: n.title,
      username: "Aïssatou",
      paragraphs: n.paragraphs,
      cta: n.cta,
    });
  });

  it("écrit au gérant de la boutique (propriétaire du compte), avec son prénom", async () => {
    await deliverNotices([notice({ recipient: "shop" })], target);

    expect(ShopMock.findById).toHaveBeenCalledWith(shop._id);
    expect(UserMock.findById).toHaveBeenCalledWith(owner._id);
    expect(sendNoticeMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "gerant@example.com", username: "Ousmane" })
    );
  });

  it("se rabat sur l'email de la boutique quand le gérant est introuvable", async () => {
    givenUsers(client);

    await deliverNotices([notice({ recipient: "shop" })], target);

    expect(sendNoticeMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "contact@kaloum.gn", username: undefined })
    );
  });

  it("écrit à l'administration à ADMIN_EMAIL, sans prénom", async () => {
    await deliverNotices([notice({ recipient: "admin" })], target);

    expect(UserMock.findById).not.toHaveBeenCalled();
    expect(ShopMock.findById).not.toHaveBeenCalled();
    expect(sendNoticeMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "admin@e-btp.gn", username: undefined })
    );
  });

  it("journalise sans envoyer les avis de l'administration quand ADMIN_EMAIL n'est pas défini", async () => {
    vi.stubEnv("ADMIN_EMAIL", undefined);

    await deliverNotices(
      [notice({ recipient: "admin", subject: "Litige à trancher" }), notice({ recipient: "client" })],
      target
    );

    expect(sendNoticeMail).toHaveBeenCalledTimes(1);
    expect(sendNoticeMail).toHaveBeenCalledWith(expect.objectContaining({ to: "client@example.com" }));
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(expect.stringContaining("Litige à trancher"));
  });

  it("envoie un email par avis, chacun à son destinataire", async () => {
    await deliverNotices(
      [notice({ recipient: "client" }), notice({ recipient: "shop" }), notice({ recipient: "admin" })],
      target
    );

    expect(vi.mocked(sendNoticeMail).mock.calls.map(([mail]) => mail.to)).toEqual([
      "client@example.com",
      "gerant@example.com",
      "admin@e-btp.gn",
    ]);
  });

  it("ne lève jamais : une erreur de lecture est journalisée", async () => {
    UserMock.findById.mockImplementation(() => mockQuery(Promise.reject(new Error("base indisponible"))));

    await expect(deliverNotices([notice({ recipient: "client" })], target)).resolves.toBeUndefined();

    expect(sendNoticeMail).not.toHaveBeenCalled();
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(expect.stringContaining("base indisponible"));
  });
});
