import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// Seuls les modèles Mongoose sont simulés : enums et constantes restent réels.
vi.mock("../../../src/models/shopOrder.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/shopOrder.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, ShopOrder: mockModel() };
});

vi.mock("../../../src/models/order.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/order.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, Order: mockModel() };
});

vi.mock("../../../src/models/product.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/product.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, productBoutique: mockModel() };
});

vi.mock("../../../src/models/promotion.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/promotion.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, Promotion: mockModel() };
});

vi.mock("../../../src/models/boutique.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Shop: mockModel() };
});

vi.mock("../../../src/models/user.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/user.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, User: mockModel() };
});

vi.mock("../../../src/shared/helpers/fileUpload.js", () => ({
  getFileUrl: vi.fn((p: string) => `/uploads/images/${p.split(/[\\/]/).pop()}`),
  deleteFileByUrl: vi.fn(),
  cleanupUploadedFiles: vi.fn(),
}));

// Les actions passent par le vrai applyShopOrderAction ; seul le
// remboursement chez le prestataire, après la transaction, est espionné.
vi.mock("../../../src/shared/services/shopOrder.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/shared/services/shopOrder.service.js")>();
  return { ...actual, settleProviderRefund: vi.fn(async () => undefined) };
});

// Avis : construits pour de vrai, envoyés pour de faux.
vi.mock("../../../src/shared/services/shopOrder.notifications.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/shared/services/shopOrder.notifications.js")>();
  return { ...actual, deliverNotices: vi.fn(async () => undefined) };
});

vi.mock("express-validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("express-validator")>();
  return {
    ...actual,
    validationResult: vi.fn(() => ({ isEmpty: () => true, array: () => [] })),
  };
});

import { validationResult } from "express-validator";
import { DeliveryMethod } from "../../../src/models/delivery.model.js";
import {
  ShopOrder,
  ShopOrderPaymentStatus,
  ShopOrderStatus,
  type IShopOrder,
} from "../../../src/models/shopOrder.model.js";
import { Order, OrderStatus, PaymentMethod } from "../../../src/models/order.model.js";
import { Shop } from "../../../src/models/boutique.model.js";
import { cleanupUploadedFiles } from "../../../src/shared/helpers/fileUpload.js";
import { SHOP_FORBIDDEN_MESSAGE } from "../../../src/shared/helpers/shopAccess.js";
import { ShopOrderAction } from "../../../src/shared/helpers/shopOrder.workflow.js";
import { settleProviderRefund } from "../../../src/shared/services/shopOrder.service.js";
import { deliverNotices } from "../../../src/shared/services/shopOrder.notifications.js";
import {
  getShopOrderById,
  listShopOrders,
  performShopOrderAction,
} from "../../../src/controllers/shopOrder.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse, mockSession } from "../../helpers/express.mock.js";
import { makeOrder, makeShop, makeShopOrder, oid } from "../../helpers/factories.js";

const ShopOrderMock = ShopOrder as unknown as Record<string, any>;
const OrderMock = Order as unknown as Record<string, any>;
const ShopMock = Shop as unknown as Record<string, any>;

const S = ShopOrderStatus;
const A = ShopOrderAction;

const ownerId = oid();
const clientId = oid();
const shop = makeShop({ ownerId });

const SHOP_USER = { id: ownerId.toString(), entityType: "shop" };
const OTHER_SHOP_USER = { id: oid().toString(), entityType: "shop" };
const CLIENT_USER = { id: clientId.toString(), entityType: "user" };
const STRANGER = { id: oid().toString(), entityType: "user" };
const ADMIN = { id: oid().toString(), entityType: "admin" };

let session: ReturnType<typeof mockSession>;

const failValidation = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({
    isEmpty: () => false,
    array: () => messages.map((msg) => ({ msg })),
  } as any);
};

/** Une sous-commande du client chez la boutique de test. */
const ourPart = (over: Record<string, unknown> = {}) =>
  makeShopOrder({ userId: clientId, boutiqueId: shop._id, pickupCode: "481516", ...over });

beforeEach(() => {
  session = mockSession();
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);

  ShopMock.findById.mockReturnValue(mockQuery(shop));
  ShopOrderMock.find.mockReturnValue(mockQuery([]));
  ShopOrderMock.findById.mockReturnValue(mockQuery(null));
  ShopOrderMock.countDocuments.mockReturnValue(mockQuery(0));
  ShopOrderMock.aggregate.mockResolvedValue([]);
  OrderMock.findById.mockReturnValue(mockQuery(null));
});

// ─────────────────────────────────────────────
describe("listShopOrders", () => {
  const list = async (query: Record<string, unknown>, user: { id: string; entityType: string } = SHOP_USER) => {
    const res = mockResponse();
    await listShopOrders(mockRequest({ query, user }), res);
    return res;
  };
  const lastFilter = () => ShopOrderMock.find.mock.calls.at(-1)?.[0];

  it("renvoie 422 quand les paramètres sont invalides", async () => {
    failValidation(["Groupe invalide."]);

    const res = await list({ boutiqueId: shop._id.toString(), group: "inconnu" });

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toBe("Groupe invalide.");
    expect(ShopOrderMock.find).not.toHaveBeenCalled();
  });

  it("renvoie 400 quand un gérant ne précise pas la boutique", async () => {
    const res = await list({});

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Précisez la boutique dont vous lisez les commandes.");
    expect(ShopOrderMock.find).not.toHaveBeenCalled();
  });

  it("renvoie 404 quand la boutique n'existe pas", async () => {
    ShopMock.findById.mockReturnValue(mockQuery(null));

    const res = await list({ boutiqueId: oid().toString() });

    expect(res.statusCode).toBe(404);
  });

  it("renvoie 403 quand la boutique appartient à un autre gérant", async () => {
    const res = await list({ boutiqueId: shop._id.toString() }, OTHER_SHOP_USER);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe(SHOP_FORBIDDEN_MESSAGE);
    expect(ShopOrderMock.find).not.toHaveBeenCalled();
  });

  it("liste les commandes de la boutique, jamais celles en attente de paiement, les plus récemment modifiées d'abord", async () => {
    const query = mockQuery([ourPart()]);
    ShopOrderMock.find.mockReturnValue(query);
    ShopOrderMock.countDocuments.mockReturnValue(mockQuery(1));

    const res = await list({ boutiqueId: shop._id.toString() });

    expect(res.statusCode).toBe(200);
    const filter = { status: { $ne: S.AWAITING_PAYMENT }, boutiqueId: shop._id.toString() };
    expect(ShopOrderMock.find).toHaveBeenCalledWith(filter);
    expect(ShopOrderMock.countDocuments).toHaveBeenCalledWith(filter);
    expect(query.sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(query.skip).toHaveBeenCalledWith(0);
    expect(query.limit).toHaveBeenCalledWith(20);
    expect(res.body.data).toMatchObject({ total: 1, page: 1, totalPages: 1 });
  });

  it("montre chaque commande comme la boutique la voit : sans code, avec ses boutons", async () => {
    ShopOrderMock.find.mockReturnValue(mockQuery([ourPart()]));

    const res = await list({ boutiqueId: shop._id.toString() });

    const [dto] = res.body.data.shopOrders;
    expect(dto.pickupCode).toBeUndefined();
    expect(dto.customer).toMatchObject({ nom: "Diallo" });
    expect(dto.availableActions).toEqual([A.CONFIRM, A.REFUSE]);
  });

  it("lit « À confirmer » comme une file : les plus anciennes d'abord", async () => {
    const query = mockQuery([]);
    ShopOrderMock.find.mockReturnValue(query);

    await list({ boutiqueId: shop._id.toString(), group: "todo" });

    expect(lastFilter()).toMatchObject({ status: { $in: [S.PENDING] } });
    expect(query.sort).toHaveBeenCalledWith({ createdAt: 1 });
  });

  it("filtre par onglet, les autres onglets restant triés par modification", async () => {
    const query = mockQuery([]);
    ShopOrderMock.find.mockReturnValue(query);

    await list({ boutiqueId: shop._id.toString(), group: "issues" });

    expect(lastFilter().status).toEqual({ $in: [S.DELIVERY_FAILED, S.RETURN_REQUESTED, S.DISPUTED] });
    expect(query.sort).toHaveBeenCalledWith({ updatedAt: -1 });
  });

  it("filtre par statut et cherche une référence, caractères spéciaux échappés", async () => {
    await list({ boutiqueId: shop._id.toString(), status: S.SHIPPED, search: "CMD-42.1" });

    expect(lastFilter()).toEqual({
      status: { $eq: S.SHIPPED, $ne: S.AWAITING_PAYMENT },
      boutiqueId: shop._id.toString(),
      reference: { $regex: "CMD-42\\.1", $options: "i" },
    });
  });

  it("un filtre de statut ne fait jamais apparaître une commande non payée", async () => {
    await list({ boutiqueId: shop._id.toString(), status: S.AWAITING_PAYMENT });

    // Le formulaire refuse déjà ce statut ; le filtre garde l'exclusion quoi qu'il arrive.
    expect(lastFilter().status).toEqual({ $eq: S.AWAITING_PAYMENT, $ne: S.AWAITING_PAYMENT });
  });

  it("pagine et plafonne la limite à 100", async () => {
    const query = mockQuery([]);
    ShopOrderMock.find.mockReturnValue(query);
    ShopOrderMock.countDocuments.mockReturnValue(mockQuery(250));

    const res = await list({ boutiqueId: shop._id.toString(), page: "3", limit: "500" });

    expect(query.skip).toHaveBeenCalledWith(200);
    expect(query.limit).toHaveBeenCalledWith(100);
    expect(res.body.data).toMatchObject({ total: 250, page: 3, totalPages: 3 });
  });

  it("compte les commandes de chaque onglet, sans celles en attente de paiement", async () => {
    ShopOrderMock.aggregate.mockResolvedValue([
      { _id: S.PENDING, count: 2 },
      { _id: S.SHIPPED, count: 1 },
      { _id: S.READY_FOR_PICKUP, count: 2 },
      { _id: S.DISPUTED, count: 1 },
      { _id: S.COMPLETED, count: 3 },
      { _id: S.REFUSED, count: 1 },
      { _id: S.AWAITING_PAYMENT, count: 9 },
    ]);

    const res = await list({ boutiqueId: shop._id.toString() });

    expect(res.body.data.counts).toEqual({
      todo: 2,
      preparing: 0,
      delivering: 3,
      delivered: 0,
      issues: 1,
      done: 4,
    });
    const [pipeline] = ShopOrderMock.aggregate.mock.calls[0];
    expect(pipeline[0].$match).toEqual({
      status: { $ne: S.AWAITING_PAYMENT },
      deletedAt: null,
      boutiqueId: new mongoose.Types.ObjectId(shop._id.toString()),
    });
    expect(pipeline[0].$match.boutiqueId).toBeInstanceOf(mongoose.Types.ObjectId);
  });

  it("l'administration lit toutes les boutiques, avec la vue admin", async () => {
    ShopOrderMock.find.mockReturnValue(mockQuery([ourPart()]));

    const res = await list({}, ADMIN);

    expect(res.statusCode).toBe(200);
    expect(ShopMock.findById).not.toHaveBeenCalled();
    expect(lastFilter()).toEqual({ status: { $ne: S.AWAITING_PAYMENT } });
    expect(ShopOrderMock.aggregate.mock.calls[0][0][0].$match).not.toHaveProperty("boutiqueId");
    const [dto] = res.body.data.shopOrders;
    expect(dto.pickupCode).toBeUndefined();
    expect(dto.availableActions).toEqual([A.ADMIN_CANCEL]);
  });

  it("renvoie 500 sur une erreur inattendue", async () => {
    ShopOrderMock.countDocuments.mockReturnValue(mockQuery(Promise.reject(new Error("base indisponible"))));

    const res = await list({ boutiqueId: shop._id.toString() });

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("base indisponible");
  });
});

// ─────────────────────────────────────────────
describe("getShopOrderById", () => {
  const get = async (part: IShopOrder | null, user?: { id: string; entityType: string }) => {
    ShopOrderMock.findById.mockReturnValue(mockQuery(part));
    const res = mockResponse();
    await getShopOrderById(mockRequest({ params: { id: part?._id.toString() ?? oid().toString() }, ...(user ? { user } : {}) }), res);
    return res;
  };

  it("renvoie 422 quand l'identifiant est invalide", async () => {
    failValidation(["Identifiant de commande invalide."]);

    const res = await get(ourPart(), CLIENT_USER);

    expect(res.statusCode).toBe(422);
    expect(ShopOrderMock.findById).not.toHaveBeenCalled();
  });

  it("renvoie 404 quand la sous-commande n'existe pas", async () => {
    const res = await get(null, CLIENT_USER);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Commande introuvable.");
  });

  it("renvoie 403 à un inconnu", async () => {
    const res = await get(ourPart(), STRANGER);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Vous ne pouvez consulter que vos propres commandes.");
  });

  it("renvoie 403 sans identité", async () => {
    expect((await get(ourPart())).statusCode).toBe(403);
  });

  it("renvoie 403 au gérant d'une autre boutique", async () => {
    const res = await get(ourPart(), OTHER_SHOP_USER);

    expect(res.statusCode).toBe(403);
  });

  it("montre au client son code de remise, sans ses coordonnées", async () => {
    const res = await get(ourPart(), CLIENT_USER);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.pickupCode).toBe("481516");
    expect(res.body.data.customer).toBeUndefined();
    expect(res.body.data.availableActions).toEqual([A.CANCEL]);
    expect(ShopMock.findById).not.toHaveBeenCalled();
  });

  it("montre à la boutique les coordonnées du client, jamais le code", async () => {
    const res = await get(ourPart(), SHOP_USER);

    expect(res.statusCode).toBe(200);
    expect(ShopMock.findById).toHaveBeenCalledWith(shop._id);
    expect(res.body.data.pickupCode).toBeUndefined();
    expect(res.body.data.customer).toMatchObject({ nom: "Diallo" });
    expect(res.body.data.availableActions).toEqual([A.CONFIRM, A.REFUSE]);
  });

  it("cache à la boutique une commande pas encore payée (404)", async () => {
    const res = await get(ourPart({ status: S.AWAITING_PAYMENT }), SHOP_USER);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Commande introuvable.");
  });

  it("montre au client sa commande pas encore payée", async () => {
    const res = await get(ourPart({ status: S.AWAITING_PAYMENT }), CLIENT_USER);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.status).toBe(S.AWAITING_PAYMENT);
    expect(res.body.data.availableActions).toEqual([]);
  });

  it("montre à l'administration la vue admin", async () => {
    const res = await get(ourPart(), ADMIN);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.pickupCode).toBeUndefined();
    expect(res.body.data.customer).toBeDefined();
    expect(res.body.data.availableActions).toEqual([A.ADMIN_CANCEL]);
  });

  it("un gérant client de sa propre boutique la lit comme gérant, avec les boutons des deux rôles", async () => {
    const res = await get(ourPart({ userId: ownerId }), SHOP_USER);

    expect(res.body.data.pickupCode).toBeUndefined();
    expect(res.body.data.availableActions).toEqual([A.CONFIRM, A.REFUSE, A.CANCEL]);
  });
});

// ─────────────────────────────────────────────
describe("performShopOrderAction", () => {
  const act = async (
    part: IShopOrder | null,
    action: string,
    opts: { user?: { id: string; entityType: string }; body?: Record<string, unknown>; files?: any[] } = {}
  ) => {
    ShopOrderMock.findById.mockReturnValue(mockQuery(part));
    if (part) {
      OrderMock.findById.mockReturnValue(mockQuery(makeOrder({ _id: part.orderId, status: OrderStatus.IN_PROGRESS })));
      ShopOrderMock.find.mockReturnValue(mockQuery([part]));
    }
    const req = mockRequest({
      params: { id: part?._id.toString() ?? oid().toString(), action },
      body: opts.body ?? {},
      ...(opts.user ? { user: opts.user } : {}),
    });
    if (opts.files) (req as any).files = opts.files;
    const res = mockResponse();
    await performShopOrderAction(req, res);
    return res;
  };
  const photo = (name: string) => ({ path: `/srv/uploads/images/2026-10-25/${name}` });

  it("renvoie 422 et supprime les photos quand la saisie est invalide", async () => {
    failValidation(["Le code de remise compte 6 chiffres."]);
    const files = [photo("a.jpg")];

    const res = await act(ourPart(), A.REQUEST_RETURN, { user: CLIENT_USER, files });

    expect(res.statusCode).toBe(422);
    expect(cleanupUploadedFiles).toHaveBeenCalledWith(files);
    expect(mongoose.startSession).not.toHaveBeenCalled();
  });

  it("refuse (400) des photos sur une autre action qu'un retour, et les supprime", async () => {
    const files = [photo("a.jpg")];

    const res = await act(ourPart(), A.CONFIRM, { user: SHOP_USER, files });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Seule une demande de retour accepte des photos.");
    expect(cleanupUploadedFiles).toHaveBeenCalledWith(files);
    expect(ShopOrderMock.findById).not.toHaveBeenCalled();
  });

  it("renvoie 404 quand la sous-commande n'existe pas, transaction annulée", async () => {
    const res = await act(null, A.CONFIRM, { user: SHOP_USER });

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
    expect(deliverNotices).not.toHaveBeenCalled();
  });

  it("renvoie 404 sur une commande pas encore payée, même à son client", async () => {
    const res = await act(ourPart({ status: S.AWAITING_PAYMENT }), A.CANCEL, { user: CLIENT_USER });

    expect(res.statusCode).toBe(404);
  });

  it("renvoie 403 à un inconnu", async () => {
    const part = ourPart();

    const res = await act(part, A.CANCEL, { user: STRANGER });

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Vous ne pouvez agir que sur vos propres commandes.");
    expect(part.save).not.toHaveBeenCalled();
  });

  it("lit la boutique dans la transaction pour établir le rôle du gérant", async () => {
    const shopQuery = mockQuery(shop);
    ShopMock.findById.mockReturnValue(shopQuery);

    await act(ourPart(), A.CONFIRM, { user: SHOP_USER });

    expect(shopQuery.session).toHaveBeenCalledWith(session);
  });

  it("confirme : applique l'action, valide la transaction, prévient le client", async () => {
    const part = ourPart();

    const res = await act(part, A.CONFIRM, { user: SHOP_USER, body: { note: "Prête demain" } });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Commande mise à jour.");
    expect(part.status).toBe(S.CONFIRMED);
    expect(String(part.statusHistory.at(-1)?.changedBy)).toBe(SHOP_USER.id);
    expect(part.save).toHaveBeenCalledWith({ session });
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(settleProviderRefund).not.toHaveBeenCalled();
    expect(deliverNotices).toHaveBeenCalledWith(
      [expect.objectContaining({ recipient: "client", subject: `Commande ${part.reference} confirmée` })],
      part
    );
    // Vue de celui qui a agi : la boutique.
    expect(res.body.data).toMatchObject({ status: S.CONFIRMED, availableActions: [A.REFUSE, A.SHIP] });
    expect(res.body.data.pickupCode).toBeUndefined();
  });

  it("répond au client avec sa vue : son code reste visible", async () => {
    const res = await act(ourPart(), A.CANCEL, { user: CLIENT_USER, body: { reason: "changed_mind" } });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.status).toBe(S.CANCELLED);
    expect(res.body.data.pickupCode).toBe("481516");
    expect(deliverNotices).toHaveBeenCalledWith([expect.objectContaining({ recipient: "shop" })], expect.anything());
  });

  it("rembourse chez le prestataire, après la transaction, un refus payé en ligne", async () => {
    const part = ourPart({
      amount: 75_000,
      payment: { method: PaymentMethod.ONLINE, status: ShopOrderPaymentStatus.PAID },
    });

    const res = await act(part, A.REFUSE, { user: SHOP_USER, body: { reason: "wrong_price" } });

    expect(res.statusCode).toBe(200);
    expect(part.payment.status).toBe(ShopOrderPaymentStatus.REFUND_PENDING);
    expect(settleProviderRefund).toHaveBeenCalledWith(part, expect.objectContaining({ _id: part.orderId }));
    const [notices] = vi.mocked(deliverNotices).mock.calls[0]!;
    expect(notices[0]!.paragraphs.at(-1)).toMatch(/^Remboursement : 75\s000 GNF\.$/);
  });

  it("ne passe pas par le prestataire quand la boutique rembourse elle-même", async () => {
    const part = ourPart({
      status: S.RETURN_REQUESTED,
      payment: { method: PaymentMethod.ON_DELIVERY, status: ShopOrderPaymentStatus.PAID },
      return: { reason: "damaged", photos: ["/p.jpg"], requestedAt: new Date() },
    });

    await act(part, A.ACCEPT_RETURN, { user: SHOP_USER });

    expect(part.payment.status).toBe(ShopOrderPaymentStatus.REFUND_PENDING);
    expect(settleProviderRefund).not.toHaveBeenCalled();
  });

  it("joint les photos téléversées à une demande de retour et les garde", async () => {
    const part = ourPart({ status: S.DELIVERED, deadlineAt: new Date(Date.now() + 86_400_000) });

    const res = await act(part, A.REQUEST_RETURN, {
      user: CLIENT_USER,
      body: { reason: "damaged", note: "Écran fissuré" },
      files: [photo("a.jpg"), photo("b.jpg")],
    });

    expect(res.statusCode).toBe(200);
    expect(part.return).toMatchObject({
      reason: "damaged",
      details: "Écran fissuré",
      photos: ["/uploads/images/a.jpg", "/uploads/images/b.jpg"],
    });
    expect(cleanupUploadedFiles).not.toHaveBeenCalled();
  });

  it("supprime les photos d'une demande de retour refusée", async () => {
    const files = [photo("a.jpg")];

    const res = await act(ourPart({ status: S.PENDING }), A.REQUEST_RETURN, {
      user: CLIENT_USER,
      body: { reason: "damaged" },
      files,
    });

    expect(res.statusCode).toBe(400);
    expect(cleanupUploadedFiles).toHaveBeenCalledWith(files);
  });

  it("traduit le refus d'une règle en son code HTTP : rôle non permis (403)", async () => {
    const part = ourPart();

    const res = await act(part, A.CONFIRM, { user: CLIENT_USER });

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      statusCode: 403,
      message: "Vous ne pouvez pas effectuer cette action sur cette commande.",
    });
    expect(part.status).toBe(S.PENDING);
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(deliverNotices).not.toHaveBeenCalled();
  });

  it("traduit le refus d'une règle en son code HTTP : statut incompatible (400)", async () => {
    const res = await act(ourPart({ status: S.SHIPPED }), A.CONFIRM, { user: SHOP_USER });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Action impossible : la commande est en livraison.");
  });

  it("ignore un code de remise qui n'est pas une chaîne", async () => {
    const res = await act(ourPart({ status: S.SHIPPED }), A.DELIVER, { user: SHOP_USER, body: { code: 481516 } });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Code de remise incorrect.");
  });

  it("remet la commande avec le bon code", async () => {
    const part = ourPart({ status: S.SHIPPED, delivery: { method: DeliveryMethod.FLAT_RATE, fee: 25_000 } });

    const res = await act(part, A.DELIVER, { user: SHOP_USER, body: { code: "481516" } });

    expect(res.statusCode).toBe(200);
    expect(part.status).toBe(S.DELIVERED);
    expect(part.payment.status).toBe(ShopOrderPaymentStatus.PAID);
  });

  it("n'accepte qu'un montant numérique pour un remboursement partiel", async () => {
    const disputed = () =>
      ourPart({
        status: S.DISPUTED,
        amount: 75_000,
        payment: { method: PaymentMethod.ONLINE, status: ShopOrderPaymentStatus.PAID },
        return: { reason: "incomplete", photos: [], requestedAt: new Date() },
      });
    const body = { resolution: "refund_partial", note: "Un article manquait" };

    const asText = await act(disputed(), A.RESOLVE_DISPUTE, { user: ADMIN, body: { ...body, refundAmount: "20000" } });
    const part = disputed();
    const asNumber = await act(part, A.RESOLVE_DISPUTE, { user: ADMIN, body: { ...body, refundAmount: 20_000 } });

    expect(asText.statusCode).toBe(400);
    expect(asNumber.statusCode).toBe(200);
    expect(part.status).toBe(S.RETURNED);
    expect(part.payment.refundedAmount).toBe(20_000);
  });

  it("renvoie 500 sur une erreur inattendue et supprime les photos", async () => {
    const files = [photo("a.jpg")];
    ShopOrderMock.findById.mockReturnValue(mockQuery(Promise.reject(new Error("base indisponible"))));
    const req = mockRequest({ params: { id: oid().toString(), action: A.REQUEST_RETURN }, user: CLIENT_USER });
    (req as any).files = files;
    const res = mockResponse();

    await performShopOrderAction(req, res);

    expect(res.statusCode).toBe(500);
    expect(cleanupUploadedFiles).toHaveBeenCalledWith(files);
  });
});
