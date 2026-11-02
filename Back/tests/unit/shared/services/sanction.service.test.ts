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

vi.mock("../../../../src/models/user.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/user.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, User: mockModel() };
});

// Effets extérieurs : sessions du store, emails, note moyenne, annulation des commandes.
vi.mock("../../../../src/shared/config/session.config.js", () => ({
  destroyUserSessions: vi.fn(async () => 0),
}));

vi.mock("../../../../src/shared/helpers/mail.helper.js", () => ({
  sendNoticeMail: vi.fn(() => 1),
}));

vi.mock("../../../../src/shared/helpers/review.helper.js", () => ({
  recomputeRating: vi.fn(async () => undefined),
  VISIBLE_REVIEW: { hiddenAt: null },
}));

// L'annulation d'une sous-commande a ses propres tests (shopOrder.service).
vi.mock("../../../../src/shared/services/shopOrder.service.js", () => ({
  applyShopOrderAction: vi.fn(),
  settleProviderRefund: vi.fn(async () => undefined),
}));

vi.mock("../../../../src/shared/services/shopOrder.notifications.js", () => ({
  noticesForAction: vi.fn(() => []),
  deliverNotices: vi.fn(async () => undefined),
}));

import { Shop } from "../../../../src/models/boutique.model.js";
import { Product, productBoutique } from "../../../../src/models/product.model.js";
import { Review } from "../../../../src/models/review.model.js";
import { Sanction, SanctionTargetKind, SanctionType } from "../../../../src/models/sanction.model.js";
import { ShopOrder, ShopOrderActor, ShopOrderStatus } from "../../../../src/models/shopOrder.model.js";
import { User } from "../../../../src/models/user.model.js";
import { destroyUserSessions } from "../../../../src/shared/config/session.config.js";
import logger from "../../../../src/shared/logger/logger.js";
import { HttpError } from "../../../../src/shared/middlewares/error.middleware.js";
import { sendNoticeMail } from "../../../../src/shared/helpers/mail.helper.js";
import { recomputeRating } from "../../../../src/shared/helpers/review.helper.js";
import { ShopOrderAction } from "../../../../src/shared/helpers/shopOrder.workflow.js";
import { applyShopOrderAction, settleProviderRefund } from "../../../../src/shared/services/shopOrder.service.js";
import { deliverNotices, noticesForAction } from "../../../../src/shared/services/shopOrder.notifications.js";
import {
  applySanction,
  checkSanctionInput,
  FAR_FUTURE,
  isSanctionActive,
  liftSanction,
  requestLift,
  SANCTION_LABELS,
  type ApplySanctionInput,
} from "../../../../src/shared/services/sanction.service.js";
import { mockQuery } from "../../../helpers/model.mock.js";
import { mockSession } from "../../../helpers/express.mock.js";
import {
  makeProduct,
  makeProductBoutique,
  makeReview,
  makeSanction,
  makeShop,
  makeShopOrder,
  makeUser,
  oid,
} from "../../../helpers/factories.js";

const ShopMock = Shop as unknown as Record<string, any>;
const ProductMock = Product as unknown as Record<string, any>;
const PbMock = productBoutique as unknown as Record<string, any>;
const ReviewMock = Review as unknown as Record<string, any>;
const SanctionMock = Sanction as unknown as Record<string, any>;
const ShopOrderMock = ShopOrder as unknown as Record<string, any>;
const UserMock = User as unknown as Record<string, any>;

const { HIDE, WARNING, SUSPENSION, BLOCK } = SanctionType;
const K = SanctionTargetKind;
const NOW = new Date("2026-10-25T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const later = (ms: number) => new Date(NOW.getTime() + ms);
const ADMIN_ID = oid().toString();
const UNSHIPPED = [ShopOrderStatus.PENDING, ShopOrderStatus.CONFIRMED, ShopOrderStatus.READY_FOR_PICKUP];

let session: ReturnType<typeof mockSession>;

/** Recherche par identifiant parmi les documents fournis. */
const byId = (docs: any[]) => (id: unknown) => mockQuery(docs.find((d) => String(d._id) === String(id)) ?? null);

/** Un monde neuf à chaque test : les documents sont mutés par le service. */
const world = () => {
  const owner = makeUser({ prenom: "Ibrahima", nom: "Sow", email: "ibrahima@kaloum.gn", blockedAt: null });
  const client = makeUser({ prenom: "Aïssatou", nom: "Barry", email: "aissatou@example.com", blockedAt: null });
  const author = makeUser({ prenom: "Fatou", nom: "Camara", email: "fatou@example.com" });
  const shop = makeShop({ ownerId: owner._id, nom: "Boutique Kaloum", suspendedUntil: null });
  const product = makeProduct({ name: "Galaxy A15" });
  const offer = makeProductBoutique({ productId: product._id, boutiqueId: shop._id, hiddenAt: null, hiddenReason: null });
  const review = makeReview({
    userId: author._id,
    productBoutiqueId: offer._id,
    hiddenAt: null,
    createdAt: new Date("2026-10-20T12:00:00.000Z"),
  });

  UserMock.findById.mockImplementation(byId([owner, client, author]));
  ShopMock.findById.mockImplementation(byId([shop]));
  ProductMock.findById.mockImplementation(byId([product]));
  PbMock.findById.mockImplementation(byId([offer]));
  ReviewMock.findById.mockImplementation(byId([review]));

  return { owner, client, author, shop, product, offer, review };
};

let w: ReturnType<typeof world>;

const apply = (over: Partial<ApplySanctionInput> = {}) =>
  applySanction({
    type: WARNING,
    targetKind: K.SHOP,
    targetId: String(w.shop._id),
    reason: "  Paiement demandé hors plateforme.  ",
    createdBy: ADMIN_ID,
    now: NOW,
    ...over,
  });

/** Sanction enregistrée au dernier appel de Sanction.create. */
const created = (): any => SanctionMock.create.mock.calls.at(-1)?.[0][0];

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

beforeEach(() => {
  session = mockSession();
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
  process.env.ADMIN_EMAIL = "moderation@plateforme.gn";

  w = world();
  ShopMock.find.mockReturnValue(mockQuery([]));
  ShopOrderMock.find.mockReturnValue(mockQuery([]));
  ShopOrderMock.findById.mockReturnValue(mockQuery(null));
  SanctionMock.findById.mockReturnValue(mockQuery(null));
  SanctionMock.create.mockImplementation(async (docs: any[]) => docs.map((d) => makeSanction(d)));

  vi.mocked(destroyUserSessions).mockResolvedValue(0);
  vi.mocked(sendNoticeMail).mockReturnValue(1);
  vi.mocked(recomputeRating).mockResolvedValue(undefined);
  vi.mocked(applyShopOrderAction).mockImplementation(
    async ({ part }) => ({ part, order: null, from: part.status, refund: 0, refundViaProvider: false }) as any
  );
  vi.mocked(settleProviderRefund).mockResolvedValue(undefined);
  vi.mocked(noticesForAction).mockReturnValue([]);
  vi.mocked(deliverNotices).mockResolvedValue(undefined);
});

afterEach(() => {
  if (ADMIN_EMAIL === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = ADMIN_EMAIL;
});

// ─────────────────────────────────────────────
describe("checkSanctionInput", () => {
  const check = (type: SanctionType, targetKind: SanctionTargetKind, over: Record<string, unknown> = {}) =>
    checkSanctionInput({ type, targetKind, reason: "Motif sérieux.", days: 7, ...over });

  it.each([
    [HIDE, K.OFFER],
    [HIDE, K.REVIEW],
    [WARNING, K.SHOP],
    [WARNING, K.USER],
    [SUSPENSION, K.SHOP],
    [BLOCK, K.USER],
  ])("accepte %s sur %s", (type, kind) => {
    expect(check(type, kind)).toBeNull();
  });

  it.each([
    [HIDE, K.SHOP, "Masquage"],
    [WARNING, K.OFFER, "Avertissement"],
    [SUSPENSION, K.USER, "Suspension"],
    [BLOCK, K.SHOP, "Blocage"],
  ])("refuse %s sur %s", (type, kind, label) => {
    expect(check(type, kind)).toBe(`${label} ne vise pas cette cible.`);
  });

  it("refuse une mesure inconnue", () => {
    expect(check("ban" as SanctionType, K.USER)).toBe("Cette mesure ne vise pas cette cible.");
  });

  it("exige un motif", () => {
    expect(check(WARNING, K.SHOP, { reason: "   " })).toBe("Le motif est requis : la personne visée le lira.");
  });

  it("n'accepte qu'une suspension de 7, 15 ou 30 jours", () => {
    for (const days of [7, 15, 30]) expect(check(SUSPENSION, K.SHOP, { days })).toBeNull();
    for (const days of [10, undefined]) {
      expect(check(SUSPENSION, K.SHOP, { days })).toBe("Durée de suspension invalide. Valeurs acceptées : 7, 15, 30 jours.");
    }
  });

  it("ignore la durée des autres mesures", () => {
    expect(check(WARNING, K.SHOP, { days: undefined })).toBeNull();
  });
});

// ─────────────────────────────────────────────
describe("applySanction — contrôles", () => {
  it("refuse une mesure invalide sans ouvrir de transaction", async () => {
    const attempt = apply({ type: BLOCK, targetKind: K.SHOP });

    await expect(attempt).rejects.toBeInstanceOf(HttpError);
    await expect(attempt).rejects.toMatchObject({ statusCode: 400, message: "Blocage ne vise pas cette cible." });
    expect(mongoose.startSession).not.toHaveBeenCalled();
  });

  it.each([
    [K.OFFER, HIDE, "Annonce introuvable."],
    [K.REVIEW, HIDE, "Avis introuvable."],
    [K.SHOP, WARNING, "Boutique introuvable."],
    [K.USER, WARNING, "Compte introuvable."],
  ])("renvoie 404 quand la cible %s n'existe pas", async (targetKind, type, message) => {
    await expect(apply({ type, targetKind, targetId: oid().toString() })).rejects.toMatchObject({ statusCode: 404, message });
    expect(session.abortTransaction).toHaveBeenCalledOnce();
    expect(SanctionMock.create).not.toHaveBeenCalled();
  });
});

describe("applySanction — masquer", () => {
  it("retire l'annonce de la vue publique et prévient son gérant", async () => {
    const ticketId = oid().toString();

    const sanction = await apply({ type: HIDE, targetKind: K.OFFER, targetId: String(w.offer._id), ticketId });

    expect(w.offer).toMatchObject({ hiddenAt: NOW, hiddenReason: "Paiement demandé hors plateforme." });
    expect(w.offer.save).toHaveBeenCalledWith({ session });
    expect(SanctionMock.create).toHaveBeenCalledWith(
      [
        {
          type: HIDE,
          target: { kind: K.OFFER, id: new Types.ObjectId(String(w.offer._id)), label: "Galaxy A15 — Boutique Kaloum" },
          notifiedUserId: w.owner._id,
          reason: "Paiement demandé hors plateforme.",
          ticketId: new Types.ObjectId(ticketId),
          startsAt: NOW,
          endsAt: null,
          provisional: false,
          createdBy: new Types.ObjectId(ADMIN_ID),
          suspendedShopIds: [],
        },
      ],
      { session }
    );
    expect(session.commitTransaction).toHaveBeenCalledOnce();
    expect(sendNoticeMail).toHaveBeenCalledWith({
      to: "ibrahima@kaloum.gn",
      subject: "Masquage : Galaxy A15 — Boutique Kaloum",
      title: "Masquage",
      username: "Ibrahima",
      paragraphs: [
        "Motif : Paiement demandé hors plateforme.",
        "Corrigez l'annonce depuis votre Espace boutique, puis demandez sa remise en ligne.",
      ],
      cta: { path: `/compte/support/nouvelle?type=sanction_appeal&cible=${String(sanction._id)}`, label: "Contester la mesure" },
    });
  });

  it("lit l'annonce, son produit et sa boutique dans la transaction", async () => {
    const query = mockQuery(w.offer);
    PbMock.findById.mockReturnValue(query);

    await apply({ type: HIDE, targetKind: K.OFFER, targetId: String(w.offer._id) });

    expect(query.session).toHaveBeenCalledWith(session);
  });

  it("refuse de masquer deux fois la même annonce", async () => {
    w.offer.hiddenAt = new Date("2026-10-24T10:00:00.000Z");

    await expect(apply({ type: HIDE, targetKind: K.OFFER, targetId: String(w.offer._id) })).rejects.toMatchObject({
      statusCode: 409,
      message: "Cette annonce est déjà masquée.",
    });
    expect(SanctionMock.create).not.toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalledOnce();
  });

  it("garde une trace sans prévenir personne quand la boutique de l'annonce a disparu", async () => {
    ShopMock.findById.mockReturnValue(mockQuery(null));

    await apply({ type: HIDE, targetKind: K.OFFER, targetId: String(w.offer._id) });

    expect(created()).toMatchObject({ target: { label: "Galaxy A15 — boutique" }, notifiedUserId: null });
    expect(sendNoticeMail).not.toHaveBeenCalled();
  });

  it("masque un avis, recalcule la note de l'offre et prévient son auteur", async () => {
    await apply({ type: HIDE, targetKind: K.REVIEW, targetId: String(w.review._id) });

    expect(w.review.hiddenAt).toEqual(NOW);
    expect(w.review.save).toHaveBeenCalledWith({ session });
    expect(recomputeRating).toHaveBeenCalledWith(w.review.productBoutiqueId, session);
    expect(created()).toMatchObject({
      target: { kind: K.REVIEW, label: `Avis du ${w.review.createdAt.toLocaleDateString("fr-FR")}` },
      notifiedUserId: w.author._id,
    });
    expect(sendNoticeMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "fatou@example.com",
        paragraphs: ["Motif : Paiement demandé hors plateforme.", "Vous pouvez contester cette mesure sous 7 jours."],
      })
    );
  });

  it("refuse de masquer deux fois le même avis", async () => {
    w.review.hiddenAt = NOW;

    await expect(apply({ type: HIDE, targetKind: K.REVIEW, targetId: String(w.review._id) })).rejects.toMatchObject({
      statusCode: 409,
      message: "Cet avis est déjà masqué.",
    });
    expect(recomputeRating).not.toHaveBeenCalled();
  });

  it("ne prévient pas d'un masquage provisoire, à confirmer par l'administration", async () => {
    await apply({ type: HIDE, targetKind: K.OFFER, targetId: String(w.offer._id), provisional: true, createdBy: null });

    expect(created()).toMatchObject({ provisional: true, createdBy: null });
    expect(sendNoticeMail).not.toHaveBeenCalled();
  });
});

describe("applySanction — avertir et suspendre", () => {
  it("avertit une boutique sans la toucher", async () => {
    await apply();

    expect(w.shop.save).not.toHaveBeenCalled();
    expect(created()).toMatchObject({ type: WARNING, target: { kind: K.SHOP, label: "Boutique Kaloum" }, notifiedUserId: w.owner._id, endsAt: null });
    expect(sendNoticeMail).toHaveBeenCalledWith(expect.objectContaining({ to: "ibrahima@kaloum.gn", title: "Avertissement" }));
  });

  it("avertit un client à son nom", async () => {
    await apply({ targetKind: K.USER, targetId: String(w.client._id) });

    expect(created()).toMatchObject({ target: { kind: K.USER, label: "Aïssatou Barry" }, notifiedUserId: w.client._id });
    expect(w.client.save).not.toHaveBeenCalled();
  });

  it("suspend la boutique pour la durée choisie et annonce la date de fin", async () => {
    await apply({ type: SUSPENSION, days: 15 });

    expect(w.shop.suspendedUntil).toEqual(later(15 * DAY));
    expect(w.shop.save).toHaveBeenCalledWith({ session });
    expect(created().endsAt).toEqual(later(15 * DAY));
    expect(sendNoticeMail).toHaveBeenCalledWith(
      expect.objectContaining({ title: `Suspension jusqu'au ${later(15 * DAY).toLocaleDateString("fr-FR")}` })
    );
  });

  it("prolonge une suspension plus courte déjà en cours", async () => {
    w.shop.suspendedUntil = later(2 * DAY);

    await apply({ type: SUSPENSION, days: 7 });

    expect(w.shop.suspendedUntil).toEqual(later(7 * DAY));
  });

  it("garde une suspension en cours plus longue", async () => {
    w.shop.suspendedUntil = later(30 * DAY);

    await apply({ type: SUSPENSION, days: 7 });

    expect(w.shop.suspendedUntil).toEqual(later(30 * DAY));
    expect(created().endsAt).toEqual(later(7 * DAY));
  });
});

describe("applySanction — bloquer", () => {
  const blockClient = () => apply({ type: BLOCK, targetKind: K.USER, targetId: String(w.client._id), reason: "Fraude au code de remise." });

  it("bloque le compte, ferme ses sessions et le prévient", async () => {
    await blockClient();

    expect(w.client.blockedAt).toEqual(NOW);
    expect(w.client.save).toHaveBeenCalledWith({ session });
    expect(destroyUserSessions).toHaveBeenCalledWith(String(w.client._id));
    expect(created()).toMatchObject({ type: BLOCK, target: { kind: K.USER, label: "Aïssatou Barry" }, suspendedShopIds: [] });
    expect(sendNoticeMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "aissatou@example.com",
        subject: "Blocage : Aïssatou Barry",
        paragraphs: ["Motif : Fraude au code de remise.", "Vous pouvez contester cette mesure sous 7 jours."],
      })
    );
  });

  it("refuse de bloquer deux fois", async () => {
    w.client.blockedAt = new Date("2026-10-01T00:00:00.000Z");

    await expect(blockClient()).rejects.toMatchObject({ statusCode: 409, message: "Ce compte est déjà bloqué." });
    expect(destroyUserSessions).not.toHaveBeenCalled();
  });

  it("annule les commandes du client qui ne sont pas encore parties", async () => {
    const parts = [
      makeShopOrder({ userId: w.client._id, status: ShopOrderStatus.PENDING, reference: "CMD-1-1" }),
      makeShopOrder({ userId: w.client._id, status: ShopOrderStatus.READY_FOR_PICKUP, reference: "CMD-1-2" }),
    ];
    ShopOrderMock.find.mockReturnValue(mockQuery(parts));
    const fresh = vi.fn(byId(parts));
    ShopOrderMock.findById.mockImplementation(fresh);
    vi.mocked(noticesForAction).mockReturnValue(["avis"] as any);

    await blockClient();

    expect(ShopOrderMock.find).toHaveBeenCalledWith({ userId: new Types.ObjectId(String(w.client._id)), status: { $in: UNSHIPPED } });
    expect(applyShopOrderAction).toHaveBeenCalledTimes(2);
    expect(applyShopOrderAction).toHaveBeenCalledWith({
      part: parts[0],
      action: ShopOrderAction.ADMIN_CANCEL,
      actors: [ShopOrderActor.ADMIN],
      input: { note: "Compte bloqué par la modération." },
      now: NOW,
      session,
    });
    expect(noticesForAction).toHaveBeenCalledWith(ShopOrderAction.ADMIN_CANCEL, parts[0], {
      refund: 0,
      input: { note: "Compte bloqué par la modération." },
      from: ShopOrderStatus.PENDING,
    });
    expect(deliverNotices).toHaveBeenCalledWith(["avis"], parts[0]);
    expect(settleProviderRefund).not.toHaveBeenCalled();
  });

  it("rembourse chez le prestataire une commande payée en ligne", async () => {
    const part = makeShopOrder({ userId: w.client._id, status: ShopOrderStatus.CONFIRMED });
    const order = { paymentRef: "PAY-42" };
    ShopOrderMock.find.mockReturnValue(mockQuery([part]));
    ShopOrderMock.findById.mockImplementation(byId([part]));
    vi.mocked(applyShopOrderAction).mockResolvedValue({ part, order, from: part.status, refund: 75_000, refundViaProvider: true } as any);

    await blockClient();

    expect(settleProviderRefund).toHaveBeenCalledWith(part, order);
  });

  it("n'annule pas une commande partie entre-temps", async () => {
    const part = makeShopOrder({ userId: w.client._id, status: ShopOrderStatus.CONFIRMED });
    ShopOrderMock.find.mockReturnValue(mockQuery([part]));
    ShopOrderMock.findById.mockReturnValue(mockQuery({ ...part, status: ShopOrderStatus.SHIPPED }));

    await blockClient();

    expect(applyShopOrderAction).not.toHaveBeenCalled();
    expect(deliverNotices).not.toHaveBeenCalled();
  });

  it("journalise une annulation impossible et passe à la commande suivante", async () => {
    const parts = [
      makeShopOrder({ userId: w.client._id, status: ShopOrderStatus.PENDING, reference: "CMD-1-1" }),
      makeShopOrder({ userId: w.client._id, status: ShopOrderStatus.PENDING, reference: "CMD-1-2" }),
    ];
    ShopOrderMock.find.mockReturnValue(mockQuery(parts));
    ShopOrderMock.findById.mockImplementation(byId(parts));
    vi.mocked(applyShopOrderAction).mockRejectedValueOnce(new Error("conflit d'écriture"));

    await expect(blockClient()).resolves.toBeDefined();

    expect(logger.error).toHaveBeenCalledWith("Annulation de CMD-1-1 après blocage non appliquée : conflit d'écriture");
    expect(deliverNotices).toHaveBeenCalledOnce();
    expect(deliverNotices).toHaveBeenCalledWith([], parts[1]);
  });

  it("garde le blocage même si les sessions ne peuvent pas être fermées", async () => {
    vi.mocked(destroyUserSessions).mockRejectedValueOnce(new Error("store indisponible"));

    await expect(blockClient()).resolves.toBeDefined();
    expect(logger.error).toHaveBeenCalledWith(`Sessions de ${String(w.client._id)} non fermées : store indisponible`);
  });

  it("ferme les boutiques d'un gérant bloqué et annule leurs commandes non parties", async () => {
    const open = makeShop({ ownerId: w.owner._id, nom: "Kaloum Centre", suspendedUntil: null });
    const suspended = makeShop({ ownerId: w.owner._id, nom: "Kaloum Port", suspendedUntil: later(3 * DAY) });
    const closed = makeShop({ ownerId: w.owner._id, nom: "Kaloum Ancien", suspendedUntil: FAR_FUTURE });
    const shopsQuery = mockQuery([open, suspended, closed]);
    ShopMock.find.mockReturnValue(shopsQuery);
    const shopPart = makeShopOrder({ boutiqueId: open._id, status: ShopOrderStatus.PENDING });
    ShopOrderMock.find.mockImplementation((filter: Record<string, any>) => mockQuery(filter.boutiqueId ? [shopPart] : []));
    ShopOrderMock.findById.mockImplementation(byId([shopPart]));

    await apply({ type: BLOCK, targetKind: K.USER, targetId: String(w.owner._id) });

    expect(ShopMock.find).toHaveBeenCalledWith({ ownerId: w.owner._id });
    expect(shopsQuery.session).toHaveBeenCalledWith(session);
    expect(open.suspendedUntil).toEqual(FAR_FUTURE);
    expect(suspended.suspendedUntil).toEqual(FAR_FUTURE);
    expect(closed.save).not.toHaveBeenCalled();
    expect(created().suspendedShopIds).toEqual([open._id, suspended._id]);
    expect(ShopOrderMock.find).toHaveBeenCalledWith({ boutiqueId: { $in: [open._id, suspended._id] }, status: { $in: UNSHIPPED } });
    expect(applyShopOrderAction).toHaveBeenCalledWith(
      expect.objectContaining({ part: shopPart, input: { note: "Boutique fermée par la modération." } })
    );
  });
});

describe("applySanction — l'avis à la personne visée", () => {
  it("n'envoie rien à un compte sans email", async () => {
    w.owner.email = "";

    await apply();

    expect(sendNoticeMail).not.toHaveBeenCalled();
  });

  it("ne fait jamais échouer la mesure quand l'email ne part pas", async () => {
    vi.mocked(sendNoticeMail).mockImplementationOnce(() => {
      throw new Error("file pleine");
    });

    await expect(apply()).resolves.toBeDefined();
    expect(logger.error).toHaveBeenCalledWith("Avis de sanction non envoyé : file pleine");
  });
});

// ─────────────────────────────────────────────
describe("liftSanction", () => {
  const given = (sanction: any) => {
    const query = mockQuery(sanction);
    SanctionMock.findById.mockReturnValue(query);
    return query;
  };

  it("renvoie 404 quand la mesure n'existe pas, 409 quand elle est déjà levée", async () => {
    await expect(liftSanction(oid().toString(), ADMIN_ID, undefined, NOW)).rejects.toMatchObject({ statusCode: 404, message: "Mesure introuvable." });

    given(makeSanction({ liftedAt: NOW }));
    await expect(liftSanction(oid().toString(), ADMIN_ID, undefined, NOW)).rejects.toMatchObject({
      statusCode: 409,
      message: "Cette mesure est déjà levée.",
    });
  });

  it("remet l'annonce en ligne, trace la levée et prévient le gérant", async () => {
    w.offer.hiddenAt = NOW;
    w.offer.hiddenReason = "Contrefaçon";
    const sanction = makeSanction({
      type: HIDE,
      target: { kind: K.OFFER, id: w.offer._id, label: "Galaxy A15 — Boutique Kaloum" },
      notifiedUserId: w.owner._id,
    });
    const query = given(sanction);

    const lifted = await liftSanction(String(sanction._id), ADMIN_ID, "  Facture d'origine fournie.  ", NOW);

    expect(query.session).toHaveBeenCalledWith(session);
    expect(w.offer).toMatchObject({ hiddenAt: null, hiddenReason: null });
    expect(w.offer.save).toHaveBeenCalledWith({ session });
    expect(lifted).toMatchObject({ liftedAt: NOW, liftedBy: new Types.ObjectId(ADMIN_ID), liftReason: "Facture d'origine fournie." });
    expect(sanction.save).toHaveBeenCalledWith({ session });
    expect(sendNoticeMail).toHaveBeenCalledWith({
      to: "ibrahima@kaloum.gn",
      subject: "Mesure levée : Galaxy A15 — Boutique Kaloum",
      title: "La mesure est levée",
      username: "Ibrahima",
      paragraphs: ["La mesure « Masquage » visant Galaxy A15 — Boutique Kaloum est levée.", "Facture d'origine fournie."],
      cta: undefined,
    });
  });

  it("lève la mesure même si l'annonce a disparu", async () => {
    const sanction = makeSanction({ type: HIDE, target: { kind: K.OFFER, id: oid(), label: "Annonce" } });
    given(sanction);

    await liftSanction(String(sanction._id), ADMIN_ID, undefined, NOW);

    expect(sanction.liftedAt).toEqual(NOW);
  });

  it("rend un avis visible et recalcule la note", async () => {
    w.review.hiddenAt = NOW;
    given(makeSanction({ type: HIDE, target: { kind: K.REVIEW, id: w.review._id, label: "Avis" }, notifiedUserId: w.author._id }));

    await liftSanction(oid().toString(), ADMIN_ID, undefined, NOW);

    expect(w.review.hiddenAt).toBeNull();
    expect(recomputeRating).toHaveBeenCalledWith(w.review.productBoutiqueId, session);
  });

  it("rouvre une boutique suspendue", async () => {
    w.shop.suspendedUntil = later(7 * DAY);
    given(makeSanction({ type: SUSPENSION, target: { kind: K.SHOP, id: w.shop._id, label: "Boutique Kaloum" }, endsAt: later(7 * DAY) }));

    await liftSanction(oid().toString(), ADMIN_ID, undefined, NOW);

    expect(w.shop.suspendedUntil).toBeNull();
    expect(w.shop.save).toHaveBeenCalledWith({ session });
  });

  it("ne rouvre pas une boutique fermée par le blocage de son gérant", async () => {
    w.shop.suspendedUntil = FAR_FUTURE;
    given(makeSanction({ type: SUSPENSION, target: { kind: K.SHOP, id: w.shop._id, label: "Boutique Kaloum" } }));
    SanctionMock.find.mockReturnValueOnce(mockQuery([makeSanction({ type: BLOCK, suspendedShopIds: [w.shop._id] })]));

    await liftSanction(oid().toString(), ADMIN_ID, undefined, NOW);

    expect(w.shop.suspendedUntil).toEqual(FAR_FUTURE);
  });

  it("garde la plus longue des autres suspensions en cours", async () => {
    // Une suspension de 30 jours, puis une de 7 : lever la seconde ne rouvre pas la boutique.
    w.shop.suspendedUntil = later(30 * DAY);
    const short = makeSanction({ type: SUSPENSION, target: { kind: K.SHOP, id: w.shop._id, label: "Boutique Kaloum" }, endsAt: later(7 * DAY) });
    given(short);
    const query = mockQuery([
      makeSanction({ type: SUSPENSION, endsAt: later(30 * DAY) }),
      makeSanction({ type: SUSPENSION, endsAt: later(12 * DAY) }),
    ]);
    SanctionMock.find.mockReturnValueOnce(query);

    await liftSanction(String(short._id), ADMIN_ID, undefined, NOW);

    expect(w.shop.suspendedUntil).toEqual(later(30 * DAY));
    const filter = SanctionMock.find.mock.calls[0]![0];
    expect(filter).toMatchObject({ _id: { $ne: short._id }, liftedAt: null });
    expect(query.session).toHaveBeenCalledWith(session);
  });

  it("débloque le compte et rouvre les boutiques fermées par le blocage", async () => {
    w.owner.blockedAt = NOW;
    w.shop.suspendedUntil = FAR_FUTURE;
    const other = makeShop({ ownerId: w.owner._id, suspendedUntil: later(5 * DAY) });
    ShopMock.findById.mockImplementation(byId([w.shop, other]));
    given(
      makeSanction({
        type: BLOCK,
        target: { kind: K.USER, id: w.owner._id, label: "Ibrahima Sow" },
        notifiedUserId: w.owner._id,
        suspendedShopIds: [w.shop._id, other._id, oid()],
      })
    );

    await liftSanction(oid().toString(), ADMIN_ID, undefined, NOW);

    expect(w.owner.blockedAt).toBeNull();
    expect(w.owner.save).toHaveBeenCalledWith({ session });
    expect(w.shop.suspendedUntil).toBeNull();
    // Seules les boutiques encore fermées « sans fin » sont rouvertes ; une boutique disparue est ignorée.
    expect(other.suspendedUntil).toEqual(later(5 * DAY));
    expect(other.save).not.toHaveBeenCalled();
  });

  it("au déblocage, une suspension prononcée avant le blocage reprend son cours", async () => {
    w.owner.blockedAt = NOW;
    w.shop.suspendedUntil = FAR_FUTURE;
    given(
      makeSanction({
        type: BLOCK,
        target: { kind: K.USER, id: w.owner._id, label: "Ibrahima Sow" },
        notifiedUserId: w.owner._id,
        suspendedShopIds: [w.shop._id],
      })
    );
    SanctionMock.find.mockReturnValueOnce(mockQuery([makeSanction({ type: SUSPENSION, endsAt: later(30 * DAY) })]));

    await liftSanction(oid().toString(), ADMIN_ID, undefined, NOW);

    expect(w.shop.suspendedUntil).toEqual(later(30 * DAY));
    expect(w.shop.save).toHaveBeenCalledWith({ session });
  });

  it("lève un avertissement sans toucher à la cible, sans auteur ni motif", async () => {
    const sanction = makeSanction({ notifiedUserId: w.owner._id });
    given(sanction);

    await liftSanction(String(sanction._id), null, "   ", NOW);

    expect(sanction).toMatchObject({ liftedAt: NOW, liftedBy: null, liftReason: null });
    expect(w.shop.save).not.toHaveBeenCalled();
    expect(sendNoticeMail).toHaveBeenCalledWith(
      expect.objectContaining({ paragraphs: ["La mesure « Avertissement » visant Boutique Kaloum est levée."] })
    );
  });
});

// ─────────────────────────────────────────────
describe("requestLift", () => {
  const hidden = (over: Record<string, unknown> = {}) =>
    makeSanction({
      type: HIDE,
      target: { kind: K.OFFER, id: w.offer._id, label: "Galaxy A15 — Boutique Kaloum" },
      notifiedUserId: w.owner._id,
      reason: "Photos d'un autre vendeur.",
      ...over,
    });
  const given = (sanction: any) => SanctionMock.findById.mockReturnValue(mockQuery(sanction));
  const ask = (userId = String(w.owner._id)) => requestLift(oid().toString(), userId, NOW);

  it("renvoie 404 quand la mesure n'existe pas", async () => {
    await expect(ask()).rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuse la demande de quelqu'un que la mesure ne vise pas", async () => {
    given(hidden());

    await expect(ask(oid().toString())).rejects.toMatchObject({ statusCode: 403, message: "Cette mesure ne vous concerne pas." });
  });

  it("ne remet en ligne qu'une annonce masquée", async () => {
    given(hidden({ type: SUSPENSION, target: { kind: K.SHOP, id: w.shop._id, label: "Boutique Kaloum" } }));
    await expect(ask()).rejects.toMatchObject({ statusCode: 400 });

    given(hidden({ target: { kind: K.REVIEW, id: oid(), label: "Avis" } }));
    await expect(ask()).rejects.toMatchObject({
      statusCode: 400,
      message: "Seule une annonce masquée se remet en ligne : contestez les autres mesures.",
    });
  });

  it("refuse une annonce déjà remise en ligne ou une demande déjà transmise", async () => {
    given(hidden({ liftedAt: NOW }));
    await expect(ask()).rejects.toMatchObject({ statusCode: 409, message: "Cette annonce est déjà remise en ligne." });

    given(hidden({ liftRequestedAt: NOW }));
    await expect(ask()).rejects.toMatchObject({ statusCode: 409, message: "Votre demande de remise en ligne est déjà transmise." });
  });

  it("note la demande et prévient la modération", async () => {
    const sanction = hidden();
    given(sanction);

    await expect(ask()).resolves.toBe(sanction);

    expect(sanction.liftRequestedAt).toEqual(NOW);
    expect(sanction.save).toHaveBeenCalled();
    expect(sendNoticeMail).toHaveBeenCalledWith({
      to: "moderation@plateforme.gn",
      subject: "Remise en ligne demandée : Galaxy A15 — Boutique Kaloum",
      title: "Une annonce corrigée attend votre validation",
      paragraphs: ["Galaxy A15 — Boutique Kaloum", "Motif du masquage : Photos d'un autre vendeur."],
      cta: { path: "/admin/support", label: "Examiner" },
    });
  });

  it("note la demande même sans adresse de modération configurée", async () => {
    delete process.env.ADMIN_EMAIL;
    const sanction = hidden();
    given(sanction);

    await ask();

    expect(sanction.liftRequestedAt).toEqual(NOW);
    expect(sendNoticeMail).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("isSanctionActive", () => {
  it("dit inactive une mesure levée", () => {
    expect(isSanctionActive({ type: BLOCK, liftedAt: NOW, endsAt: null }, NOW)).toBe(false);
  });

  it("dit active une suspension jusqu'à son échéance", () => {
    expect(isSanctionActive({ type: SUSPENSION, liftedAt: null, endsAt: later(DAY) }, NOW)).toBe(true);
    expect(isSanctionActive({ type: SUSPENSION, liftedAt: null, endsAt: NOW }, NOW)).toBe(false);
    expect(isSanctionActive({ type: SUSPENSION, liftedAt: null, endsAt: null }, NOW)).toBe(false);
  });

  it("dit actifs un masquage, un avertissement et un blocage tant qu'ils ne sont pas levés", () => {
    for (const type of [HIDE, WARNING, BLOCK]) expect(isSanctionActive({ type, liftedAt: null, endsAt: null }, NOW)).toBe(true);
  });

  it("nomme chaque mesure", () => {
    expect(SANCTION_LABELS).toEqual({ hide: "Masquage", warning: "Avertissement", suspension: "Suspension", block: "Blocage" });
  });
});
