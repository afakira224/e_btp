import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import mongoose from "mongoose";

// Seuls les modèles Mongoose sont simulés : enums et constantes restent réels.
vi.mock("../../../../src/models/order.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/order.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, Order: mockModel() };
});

vi.mock("../../../../src/models/shopOrder.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/shopOrder.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, ShopOrder: mockModel() };
});

vi.mock("../../../../src/models/cart.model.js", async () => {
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { Cart: mockModel() };
});

vi.mock("../../../../src/models/product.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/product.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, productBoutique: mockModel() };
});

vi.mock("../../../../src/models/promotion.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/models/promotion.model.js")>();
  const { mockModel } = await import("../../../helpers/model.mock.js");
  return { ...actual, Promotion: mockModel() };
});

import {
  Order,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
} from "../../../../src/models/order.model.js";
import {
  ShopOrder,
  ShopOrderActor,
  ShopOrderPaymentStatus,
  ShopOrderStatus,
} from "../../../../src/models/shopOrder.model.js";
import { Cart } from "../../../../src/models/cart.model.js";
import { productBoutique } from "../../../../src/models/product.model.js";
import { Promotion } from "../../../../src/models/promotion.model.js";
import logger from "../../../../src/shared/logger/logger.js";
import { HttpError } from "../../../../src/shared/middlewares/error.middleware.js";
import {
  confirmOrderPayment,
  failOrderPayment,
  refundLatePayment,
  restoreCartAfterFailedPayment,
} from "../../../../src/shared/services/orderPayment.service.js";
import { sandboxProvider } from "../../../../src/shared/payment/payment.provider.js";
import { mockQuery } from "../../../helpers/model.mock.js";
import { mockSession } from "../../../helpers/express.mock.js";
import {
  makeCart,
  makeCartItem,
  makeOrder,
  makeOrderItem,
  makeProductBoutique,
  makePromotion,
  makeShopOrder,
  oid,
} from "../../../helpers/factories.js";

const OrderMock = Order as unknown as Record<string, any>;
const ShopOrderMock = ShopOrder as unknown as Record<string, any>;
const CartMock = Cart as unknown as Record<string, any>;
const PbMock = productBoutique as unknown as Record<string, any>;
const PromotionMock = Promotion as unknown as Record<string, any>;

const NOW = new Date("2026-10-25T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;

let session: ReturnType<typeof mockSession>;

/** Commande payée en ligne, en attente de la confirmation du prestataire. */
const awaitingOrder = (over: Record<string, unknown> = {}) =>
  makeOrder({
    status: OrderStatus.AWAITING_PAYMENT,
    paymentMethod: PaymentMethod.ONLINE,
    paymentStatus: OrderPaymentStatus.PENDING,
    paymentExpiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
    paidAt: null,
    ...over,
  });

const awaitingPart = (over: Record<string, unknown> = {}) =>
  makeShopOrder({
    status: ShopOrderStatus.AWAITING_PAYMENT,
    payment: { method: PaymentMethod.ONLINE },
    ...over,
  });

const givenOrder = (order: any, parts: any[] = []) => {
  OrderMock.findById.mockReturnValue(mockQuery(order));
  ShopOrderMock.find.mockReturnValue(mockQuery(parts));
};

beforeEach(() => {
  session = mockSession();
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
  OrderMock.findById.mockReturnValue(mockQuery(null));
  ShopOrderMock.find.mockReturnValue(mockQuery([]));
  PbMock.findById.mockReturnValue(mockQuery(null));
  PromotionMock.findOne.mockReturnValue(mockQuery(null));
  CartMock.findOne.mockReturnValue(mockQuery(null));
});

// ─────────────────────────────────────────────
describe("confirmOrderPayment", () => {
  it("fait partir chaque sous-commande chez sa boutique, payée, avec 48 h pour confirmer", async () => {
    const order = awaitingOrder();
    const parts = [awaitingPart({ orderId: order._id }), awaitingPart({ orderId: order._id })];
    givenOrder(order, parts);

    const result = await confirmOrderPayment(order._id, NOW);

    expect(result.changed).toBe(true);
    expect(result.parts).toBe(parts);
    for (const part of parts) {
      expect(part.status).toBe(ShopOrderStatus.PENDING);
      expect(part.deadlineAt).toEqual(new Date(NOW.getTime() + 48 * HOUR));
      expect(part.reminderAt).toEqual(new Date(NOW.getTime() + 24 * HOUR));
      expect(part.payment.status).toBe(ShopOrderPaymentStatus.PAID);
      expect(part.payment.paidAt).toEqual(NOW);
      expect(part.statusHistory.at(-1)).toEqual({
        status: ShopOrderStatus.PENDING,
        changedAt: NOW,
        actor: ShopOrderActor.SYSTEM,
        note: "Paiement confirmé",
      });
      expect(part.save).toHaveBeenCalledWith({ session });
    }
    expect(ShopOrderMock.find).toHaveBeenCalledWith({ orderId: order._id });
  });

  it("marque la commande payée et en cours, dans une transaction validée", async () => {
    const order = awaitingOrder();
    givenOrder(order, [awaitingPart()]);

    await confirmOrderPayment(order._id, NOW);

    expect(order.paymentStatus).toBe(OrderPaymentStatus.PAID);
    expect(order.paidAt).toEqual(NOW);
    expect(order.paymentExpiresAt).toBeNull();
    expect(order.status).toBe(OrderStatus.IN_PROGRESS);
    expect(order.statusHistory.at(-1)).toEqual({
      status: OrderStatus.IN_PROGRESS,
      changedAt: NOW,
      note: "Paiement confirmé",
    });
    expect(order.save).toHaveBeenCalledWith({ session });
    expect(session.startTransaction).toHaveBeenCalled();
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(session.abortTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it("ne touche pas une sous-commande qui n'attend plus le paiement", async () => {
    const order = awaitingOrder();
    const cancelled = makeShopOrder({ status: ShopOrderStatus.CANCELLED });
    givenOrder(order, [cancelled]);

    await confirmOrderPayment(order._id, NOW);

    expect(cancelled.status).toBe(ShopOrderStatus.CANCELLED);
    expect(cancelled.save).not.toHaveBeenCalled();
  });

  it("est idempotente : un paiement déjà confirmé ne change rien", async () => {
    const order = awaitingOrder({ status: OrderStatus.IN_PROGRESS, paymentStatus: OrderPaymentStatus.PAID });
    givenOrder(order);

    const result = await confirmOrderPayment(order._id, NOW);

    expect(result).toEqual({ order, parts: [], changed: false });
    expect(ShopOrderMock.find).not.toHaveBeenCalled();
    expect(order.save).not.toHaveBeenCalled();
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it("refuse (409) de confirmer un paiement échoué, et annule la transaction", async () => {
    const order = awaitingOrder({ status: OrderStatus.PAYMENT_FAILED, paymentStatus: OrderPaymentStatus.FAILED });
    givenOrder(order);

    const attempt = confirmOrderPayment(order._id, NOW);

    await expect(attempt).rejects.toBeInstanceOf(HttpError);
    await expect(attempt).rejects.toMatchObject({
      statusCode: 409,
      message: "Ce paiement ne peut plus être confirmé : la commande a expiré.",
    });
    expect(order.save).not.toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.commitTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it("refuse (400) une commande payable à la remise", async () => {
    const order = awaitingOrder({
      paymentMethod: PaymentMethod.ON_DELIVERY,
      paymentStatus: OrderPaymentStatus.ON_DELIVERY,
    });
    givenOrder(order);

    await expect(confirmOrderPayment(order._id, NOW)).rejects.toMatchObject({
      statusCode: 400,
      message: "Cette commande se paie à la livraison ou au retrait.",
    });
  });

  it("renvoie 404 quand la commande n'existe pas", async () => {
    await expect(confirmOrderPayment(oid(), NOW)).rejects.toMatchObject({
      statusCode: 404,
      message: "Commande introuvable.",
    });
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("failOrderPayment", () => {
  it("annule chaque sous-commande en attente : paiement annulé, plus d'échéance", async () => {
    const order = awaitingOrder();
    const part = awaitingPart({ deadlineAt: NOW, reminderAt: NOW });
    givenOrder(order, [part]);

    const result = await failOrderPayment(order._id, "refused", NOW);

    expect(result.changed).toBe(true);
    expect(part.status).toBe(ShopOrderStatus.CANCELLED);
    expect(part.payment.status).toBe(ShopOrderPaymentStatus.VOID);
    expect(part.deadlineAt).toBeNull();
    expect(part.reminderAt).toBeNull();
    expect(part.statusHistory.at(-1)).toEqual({
      status: ShopOrderStatus.CANCELLED,
      changedAt: NOW,
      actor: ShopOrderActor.SYSTEM,
      note: "Paiement refusé",
    });
    expect(part.save).toHaveBeenCalledWith({ session });
  });

  it("rend le stock réservé", async () => {
    const offer = makeProductBoutique({ stock: 4 });
    PbMock.findById.mockReturnValue(mockQuery(offer));
    const order = awaitingOrder();
    givenOrder(order, [awaitingPart({ items: [makeOrderItem({ productBoutiqueId: offer._id, quantity: 3 })] })]);

    await failOrderPayment(order._id, "refused", NOW);

    expect(PbMock.findById).toHaveBeenCalledWith(offer._id);
    expect(offer.stock).toBe(7);
    expect(offer.save).toHaveBeenCalledWith({ session });
  });

  it("rend l'utilisation du coupon et marque la commande en échec de paiement", async () => {
    const promo = makePromotion({ code: "RENTREE10", usedCount: 2 });
    PromotionMock.findOne.mockReturnValue(mockQuery(promo));
    const order = awaitingOrder({ promotionCode: "RENTREE10" });
    givenOrder(order, [awaitingPart()]);

    await failOrderPayment(order._id, "expired", NOW);

    expect(promo.usedCount).toBe(1);
    expect(order.paymentStatus).toBe(OrderPaymentStatus.FAILED);
    expect(order.paymentExpiresAt).toBeNull();
    expect(order.status).toBe(OrderStatus.PAYMENT_FAILED);
    expect(order.statusHistory.at(-1)).toEqual({
      status: OrderStatus.PAYMENT_FAILED,
      changedAt: NOW,
      note: "Paiement non confirmé sous 30 minutes",
    });
    expect(order.save).toHaveBeenCalledWith({ session });
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it("ne consulte aucune promotion sans coupon", async () => {
    const order = awaitingOrder({ promotionCode: null });
    givenOrder(order, [awaitingPart()]);

    await failOrderPayment(order._id, "refused", NOW);

    expect(PromotionMock.findOne).not.toHaveBeenCalled();
  });

  it("laisse intacte une sous-commande qui n'attend plus le paiement", async () => {
    const order = awaitingOrder();
    const pending = makeShopOrder({ status: ShopOrderStatus.PENDING });
    givenOrder(order, [pending]);

    await failOrderPayment(order._id, "refused", NOW);

    expect(pending.status).toBe(ShopOrderStatus.PENDING);
    expect(pending.save).not.toHaveBeenCalled();
    expect(PbMock.findById).not.toHaveBeenCalled();
  });

  it("est idempotente : un échec déjà enregistré ne change rien", async () => {
    const order = awaitingOrder({ status: OrderStatus.PAYMENT_FAILED, paymentStatus: OrderPaymentStatus.FAILED });
    givenOrder(order);

    const result = await failOrderPayment(order._id, "expired", NOW);

    expect(result).toEqual({ order, parts: [], changed: false });
    expect(ShopOrderMock.find).not.toHaveBeenCalled();
    expect(order.save).not.toHaveBeenCalled();
  });

  it("refuse (409) de faire échouer un paiement déjà confirmé", async () => {
    const order = awaitingOrder({ status: OrderStatus.IN_PROGRESS, paymentStatus: OrderPaymentStatus.PAID });
    givenOrder(order);

    await expect(failOrderPayment(order._id, "refused", NOW)).rejects.toMatchObject({
      statusCode: 409,
      message: "Ce paiement est déjà confirmé.",
    });
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("restoreCartAfterFailedPayment", () => {
  it("remet les articles dans le panier existant, sans doublon, et recalcule le montant", async () => {
    const kept = makeCartItem({ quantity: 1, price: 1_000 });
    const cart = makeCart({ items: [kept], amount: 1_000 });
    CartMock.findOne.mockReturnValue(mockQuery(cart));
    const added = makeOrderItem({ quantity: 3, price: 500 });
    const order = makeOrder({
      items: [makeOrderItem({ productBoutiqueId: kept.productBoutiqueId, quantity: 5, price: 900 }), added],
    });

    await restoreCartAfterFailedPayment(order);

    expect(CartMock.findOne).toHaveBeenCalledWith({ userId: order.userId });
    expect(cart.items).toHaveLength(2);
    // La ligne déjà présente garde sa quantité et son prix.
    expect(cart.items[0]).toBe(kept);
    expect(cart.items[1]).toEqual({ productBoutiqueId: added.productBoutiqueId, quantity: 3, price: 500 });
    expect(cart.amount).toBe(1_000 + 1_500);
    expect(cart.save).toHaveBeenCalled();
  });

  it("crée le panier quand le client n'en a pas", async () => {
    const item = makeOrderItem({ quantity: 2, price: 1_200 });
    const order = makeOrder({ items: [item] });

    await restoreCartAfterFailedPayment(order);

    // Le tableau `items` passé au constructeur est ensuite rempli : on ne lit que l'utilisateur.
    expect(CartMock).toHaveBeenCalledWith(expect.objectContaining({ userId: order.userId }));
    const cart = CartMock.mock.instances[0];
    expect(cart.items).toEqual([{ productBoutiqueId: item.productBoutiqueId, quantity: 2, price: 1_200 }]);
    expect(cart.amount).toBe(2_400);
    expect(cart.save).toHaveBeenCalled();
  });

  it("journalise un échec sans le propager", async () => {
    CartMock.findOne.mockReturnValue(mockQuery(Promise.reject(new Error("base indisponible"))));
    const order = makeOrder({ reference: "CMD-42", items: [makeOrderItem()] });

    await expect(restoreCartAfterFailedPayment(order)).resolves.toBeUndefined();

    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(expect.stringContaining("CMD-42"));
  });
});

describe("refundLatePayment", () => {
  const late = { paymentRef: "sandbox_42", amount: 90_000, reference: "CMD-42" };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rend le montant de la commande chez le prestataire", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "sandbox");
    const refund = vi.spyOn(sandboxProvider, "refund");

    await expect(refundLatePayment(late)).resolves.toBe(true);

    expect(refund).toHaveBeenCalledWith({ providerRef: "sandbox_42", amount: 90_000, reference: "CMD-42" });
  });

  it("sans prestataire configuré : rien n'est rendu, l'échec est journalisé", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", undefined);
    vi.stubEnv("NODE_ENV", "production");

    await expect(refundLatePayment(late)).resolves.toBe(false);

    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(expect.stringContaining("CMD-42"));
  });

  it("un refus du prestataire est journalisé sans être propagé", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "sandbox");
    vi.spyOn(sandboxProvider, "refund").mockRejectedValueOnce(new Error("prestataire indisponible"));

    await expect(refundLatePayment(late)).resolves.toBe(false);

    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(expect.stringContaining("prestataire indisponible"));
  });
});
