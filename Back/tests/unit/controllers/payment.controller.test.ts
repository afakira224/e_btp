import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Seul le modèle Mongoose est simulé : enums et constantes restent réels.
vi.mock("../../../src/models/order.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/order.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, Order: mockModel() };
});

vi.mock("../../../src/models/user.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/user.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, User: mockModel() };
});

vi.mock("../../../src/shared/helpers/mail.helper.js", () => ({
  sendOrderConfirmationMail: vi.fn(() => 1),
}));

// Le règlement (transactions, sous-commandes) a ses propres tests.
vi.mock("../../../src/shared/services/orderPayment.service.js", () => ({
  confirmOrderPayment: vi.fn(),
  failOrderPayment: vi.fn(),
  refundLatePayment: vi.fn(async () => true),
  restoreCartAfterFailedPayment: vi.fn(async () => undefined),
}));

// Avis aux boutiques : construits pour de vrai, envoyés pour de faux.
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
import {
  Order,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
} from "../../../src/models/order.model.js";
import { User } from "../../../src/models/user.model.js";
import logger from "../../../src/shared/logger/logger.js";
import { HttpError } from "../../../src/shared/middlewares/error.middleware.js";
import { sendOrderConfirmationMail } from "../../../src/shared/helpers/mail.helper.js";
import { sandboxProvider } from "../../../src/shared/payment/payment.provider.js";
import {
  confirmOrderPayment,
  failOrderPayment,
  refundLatePayment,
  restoreCartAfterFailedPayment,
} from "../../../src/shared/services/orderPayment.service.js";
import { deliverNotices } from "../../../src/shared/services/shopOrder.notifications.js";
import {
  notifyPaidOrder,
  restartPayment,
  settleSandboxPayment,
} from "../../../src/controllers/payment.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse } from "../../helpers/express.mock.js";
import { makeOrder, makeOrderItem, makeShopOrder, makeUser, oid } from "../../helpers/factories.js";

const OrderMock = Order as unknown as Record<string, any>;
const UserMock = User as unknown as Record<string, any>;

const clientId = oid();
const CLIENT_USER = { id: clientId.toString(), entityType: "user" };
const STRANGER = { id: oid().toString(), entityType: "user" };
const ADMIN = { id: oid().toString(), entityType: "admin" };

const failValidation = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({
    isEmpty: () => false,
    array: () => messages.map((msg) => ({ msg })),
  } as any);
};

/** Commande en ligne du client, en attente de paiement, encore dans les temps. */
const awaitingOrder = (over: Record<string, unknown> = {}) =>
  makeOrder({
    userId: clientId,
    reference: "CMD-42",
    status: OrderStatus.AWAITING_PAYMENT,
    paymentMethod: PaymentMethod.ONLINE,
    paymentStatus: OrderPaymentStatus.PENDING,
    paymentExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    amount: 75_000,
    ...over,
  });

const givenOrder = (order: any) => OrderMock.findById.mockReturnValue(mockQuery(order));

beforeEach(() => {
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);
  // Le prestataire simulé est actif, comme hors production.
  vi.stubEnv("PAYMENT_PROVIDER", "sandbox");
  vi.stubEnv("APP_URL", "https://e-btp.test");
  OrderMock.findById.mockReturnValue(mockQuery(null));
  UserMock.findById.mockReturnValue(mockQuery(makeUser({ _id: clientId })));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─────────────────────────────────────────────
describe("settleSandboxPayment", () => {
  const settle = async (outcome: string, user: { id: string; entityType: string } = CLIENT_USER, orderId = oid()) => {
    const res = mockResponse();
    await settleSandboxPayment(mockRequest({ params: { orderId: orderId.toString() }, body: { outcome }, user }), res);
    return res;
  };

  it("renvoie 422 quand l'issue est invalide", async () => {
    failValidation(["Issue invalide. Valeurs acceptées : paid, failed."]);

    const res = await settle("peut-être");

    expect(res.statusCode).toBe(422);
    expect(OrderMock.findById).not.toHaveBeenCalled();
  });

  it("renvoie 404 quand le paiement simulé est désactivé (aucun prestataire)", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "aucun");
    givenOrder(awaitingOrder());

    const res = await settle("paid");

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Le paiement simulé est désactivé.");
    expect(OrderMock.findById).not.toHaveBeenCalled();
    expect(confirmOrderPayment).not.toHaveBeenCalled();
  });

  it("renvoie 404 en production quand aucun prestataire n'est choisi", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", undefined);
    vi.stubEnv("NODE_ENV", "production");

    expect((await settle("paid")).statusCode).toBe(404);
  });

  it("renvoie 404 quand la commande n'existe pas", async () => {
    const res = await settle("paid");

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Commande introuvable.");
  });

  it("renvoie 403 quand la commande appartient à un autre client", async () => {
    givenOrder(awaitingOrder());

    const res = await settle("paid", STRANGER);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Vous ne pouvez payer que vos propres commandes.");
    expect(confirmOrderPayment).not.toHaveBeenCalled();
  });

  it("renvoie 400 pour une commande payable à la remise", async () => {
    givenOrder(awaitingOrder({ paymentMethod: PaymentMethod.ON_DELIVERY }));

    const res = await settle("paid");

    expect(res.statusCode).toBe(400);
  });

  it("paiement réussi : confirme la commande, prévient chaque boutique et le client", async () => {
    const order = awaitingOrder();
    givenOrder(order);
    const settled = awaitingOrder({
      _id: order._id,
      status: OrderStatus.IN_PROGRESS,
      paymentStatus: OrderPaymentStatus.PAID,
      paymentExpiresAt: null,
    });
    const parts = [makeShopOrder({ reference: "CMD-42-1" }), makeShopOrder({ reference: "CMD-42-2" })];
    vi.mocked(confirmOrderPayment).mockResolvedValue({ order: settled, parts, changed: true });

    const res = await settle("paid", CLIENT_USER, order._id);

    expect(confirmOrderPayment).toHaveBeenCalledWith(order._id);
    expect(deliverNotices).toHaveBeenCalledTimes(2);
    expect(deliverNotices).toHaveBeenCalledWith(
      [expect.objectContaining({ recipient: "shop", subject: "Nouvelle commande CMD-42-1" })],
      parts[0]
    );
    expect(sendOrderConfirmationMail).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Paiement confirmé.");
    expect(res.body.data).toEqual({
      orderId: order._id.toString(),
      status: OrderStatus.IN_PROGRESS,
      paymentStatus: OrderPaymentStatus.PAID,
      paymentExpiresAt: null,
    });
  });

  it("paiement déjà confirmé : personne n'est prévenu une seconde fois", async () => {
    const order = awaitingOrder({ status: OrderStatus.IN_PROGRESS, paymentStatus: OrderPaymentStatus.PAID });
    givenOrder(order);
    vi.mocked(confirmOrderPayment).mockResolvedValue({ order, parts: [], changed: false });

    const res = await settle("paid");

    expect(res.statusCode).toBe(200);
    expect(deliverNotices).not.toHaveBeenCalled();
    expect(sendOrderConfirmationMail).not.toHaveBeenCalled();
  });

  it("l'administration peut régler la commande d'un client", async () => {
    const order = awaitingOrder();
    givenOrder(order);
    vi.mocked(confirmOrderPayment).mockResolvedValue({ order, parts: [], changed: false });

    expect((await settle("paid", ADMIN)).statusCode).toBe(200);
  });

  it("paiement refusé : la commande échoue et le panier est restauré", async () => {
    const order = awaitingOrder();
    givenOrder(order);
    const failed = awaitingOrder({
      _id: order._id,
      status: OrderStatus.PAYMENT_FAILED,
      paymentStatus: OrderPaymentStatus.FAILED,
      paymentExpiresAt: null,
    });
    vi.mocked(failOrderPayment).mockResolvedValue({ order: failed, parts: [], changed: true });

    const res = await settle("failed", CLIENT_USER, order._id);

    expect(failOrderPayment).toHaveBeenCalledWith(order._id, "refused");
    expect(restoreCartAfterFailedPayment).toHaveBeenCalledWith(failed);
    expect(confirmOrderPayment).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Paiement refusé : votre panier a été restauré.");
    expect(res.body.data).toMatchObject({ status: OrderStatus.PAYMENT_FAILED, paymentStatus: OrderPaymentStatus.FAILED });
  });

  it("refus déjà enregistré : le panier n'est pas restauré deux fois", async () => {
    const order = awaitingOrder({ status: OrderStatus.PAYMENT_FAILED, paymentStatus: OrderPaymentStatus.FAILED });
    givenOrder(order);
    vi.mocked(failOrderPayment).mockResolvedValue({ order, parts: [], changed: false });

    await settle("failed");

    expect(restoreCartAfterFailedPayment).not.toHaveBeenCalled();
  });

  it("paiement arrivé après l'échec de la commande : il est remboursé (409)", async () => {
    const order = awaitingOrder();
    givenOrder(order);
    vi.mocked(confirmOrderPayment).mockRejectedValue(
      new HttpError("Ce paiement ne peut plus être confirmé : la commande a expiré.", 409)
    );

    const res = await settle("paid");

    expect(refundLatePayment).toHaveBeenCalledWith(order);
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(
      "Le délai de paiement était dépassé : la commande est annulée et votre paiement remboursé."
    );
  });

  it("paiement tardif dont le remboursement échoue : le client sait qu'il est en cours", async () => {
    givenOrder(awaitingOrder());
    vi.mocked(confirmOrderPayment).mockRejectedValue(new HttpError("expirée", 409));
    vi.mocked(refundLatePayment).mockResolvedValueOnce(false);

    const res = await settle("paid");

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toContain("Le remboursement de votre paiement est en cours.");
  });

  it("une autre erreur du règlement passe telle quelle, sans remboursement", async () => {
    givenOrder(awaitingOrder());
    vi.mocked(confirmOrderPayment).mockRejectedValue(new HttpError("Commande introuvable.", 404));

    const res = await settle("paid");

    expect(refundLatePayment).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  it("renvoie 500 sur une erreur inattendue", async () => {
    givenOrder(awaitingOrder());
    vi.mocked(failOrderPayment).mockRejectedValue(new Error("base indisponible"));

    const res = await settle("failed");

    expect(res.statusCode).toBe(500);
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(expect.stringContaining("base indisponible"));
  });
});

// ─────────────────────────────────────────────
describe("notifyPaidOrder", () => {
  it("envoie au client son récapitulatif de commande", async () => {
    const user = makeUser({ _id: clientId });
    UserMock.findById.mockReturnValue(mockQuery(user));
    const order = awaitingOrder({
      items: [makeOrderItem({ productName: "Ciment 50 kg", quantity: 2, price: 90_000 }), makeOrderItem({ productName: undefined })],
      subtotal: 181_000,
      discountAmount: 1_000,
      shippingFee: 25_000,
      amount: 205_000,
      adresse: "Conakry, Ratoma",
    });

    await notifyPaidOrder(order, []);

    expect(UserMock.findById).toHaveBeenCalledWith(clientId);
    expect(sendOrderConfirmationMail).toHaveBeenCalledWith(user, {
      reference: "CMD-42",
      items: [
        { productName: "Ciment 50 kg", quantity: 2, price: 90_000 },
        { productName: "Article", quantity: 1, price: 1_000 },
      ],
      subtotal: 181_000,
      discountAmount: 1_000,
      shippingFee: 25_000,
      amount: 205_000,
      adresse: "Conakry, Ratoma",
    });
  });

  it("n'écrit à personne quand le compte n'existe plus", async () => {
    UserMock.findById.mockReturnValue(mockQuery(null));

    await notifyPaidOrder(awaitingOrder(), []);

    expect(sendOrderConfirmationMail).not.toHaveBeenCalled();
  });

  it("journalise un email en échec sans lever", async () => {
    vi.mocked(sendOrderConfirmationMail).mockImplementationOnce(() => {
      throw new Error("file pleine");
    });

    await expect(notifyPaidOrder(awaitingOrder(), [])).resolves.toBeUndefined();

    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(expect.stringContaining("CMD-42"));
  });
});

// ─────────────────────────────────────────────
describe("restartPayment", () => {
  const restart = async (user: { id: string; entityType: string } = CLIENT_USER, orderId = oid()) => {
    const res = mockResponse();
    await restartPayment(mockRequest({ params: { orderId: orderId.toString() }, user }), res);
    return res;
  };

  it("renvoie 422 quand l'identifiant est invalide", async () => {
    failValidation(["Identifiant de commande invalide."]);

    expect((await restart()).statusCode).toBe(422);
  });

  it("renvoie 404, 403 et 400 comme le paiement simulé", async () => {
    expect((await restart()).statusCode).toBe(404);

    givenOrder(awaitingOrder());
    expect((await restart(STRANGER)).statusCode).toBe(403);

    givenOrder(awaitingOrder({ paymentMethod: PaymentMethod.ON_DELIVERY }));
    expect((await restart()).statusCode).toBe(400);
  });

  it("renvoie 409 quand la commande n'attend plus de paiement", async () => {
    givenOrder(awaitingOrder({ status: OrderStatus.IN_PROGRESS, paymentStatus: OrderPaymentStatus.PAID }));

    const res = await restart();

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe("Cette commande n'attend plus de paiement.");
  });

  it("renvoie 409 quand le paiement est déjà en échec, même si le statut traîne", async () => {
    givenOrder(awaitingOrder({ paymentStatus: OrderPaymentStatus.FAILED }));

    expect((await restart()).statusCode).toBe(409);
  });

  it("renvoie 409 quand le délai de paiement est dépassé", async () => {
    givenOrder(awaitingOrder({ paymentExpiresAt: new Date(Date.now() - 1_000) }));

    const res = await restart();

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe("Le délai de paiement est dépassé : la commande va être annulée.");
  });

  it("renvoie 503 quand aucun prestataire n'est disponible", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "aucun");
    const order = awaitingOrder();
    givenOrder(order);

    const res = await restart();

    expect(res.statusCode).toBe(503);
    expect(order.save).not.toHaveBeenCalled();
  });

  it("relance le paiement : nouvelle référence enregistrée, page de paiement renvoyée", async () => {
    const order = awaitingOrder();
    givenOrder(order);
    const initiate = vi.spyOn(sandboxProvider, "initiate");

    const res = await restart(CLIENT_USER, order._id);

    expect(initiate).toHaveBeenCalledWith({ orderId: order._id.toString(), reference: "CMD-42", amount: 75_000 });
    expect(order.paymentRef).toMatch(/^SBX-/);
    expect(order.save).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Paiement relancé.");
    expect(res.body.data).toEqual({
      orderId: order._id.toString(),
      status: OrderStatus.AWAITING_PAYMENT,
      paymentStatus: OrderPaymentStatus.PENDING,
      paymentExpiresAt: order.paymentExpiresAt,
      redirectUrl: `https://e-btp.test/paiement/${order._id.toString()}`,
    });
  });

  it("accepte une commande sans date d'expiration", async () => {
    givenOrder(awaitingOrder({ paymentExpiresAt: null }));

    expect((await restart()).statusCode).toBe(200);
  });

  it("renvoie 500 quand le prestataire ne répond pas", async () => {
    const order = awaitingOrder();
    givenOrder(order);
    vi.spyOn(sandboxProvider, "initiate").mockRejectedValue(new Error("prestataire injoignable"));

    const res = await restart();

    expect(res.statusCode).toBe(500);
    expect(order.save).not.toHaveBeenCalled();
  });
});
