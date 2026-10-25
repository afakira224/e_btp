import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// Seuls les modèles Mongoose sont simulés : enums et constantes restent réels.
// Les échéances passent par le vrai applyShopOrderAction : mêmes règles qu'à la main.
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

vi.mock("../../../../src/shared/payment/payment.provider.js", () => ({
  getPaymentProvider: vi.fn(() => null),
}));

// Le règlement des paiements a ses propres tests : ici, on vérifie l'appel.
vi.mock("../../../../src/shared/services/orderPayment.service.js", () => ({
  failOrderPayment: vi.fn(),
  restoreCartAfterFailedPayment: vi.fn(async () => undefined),
}));

// Avis : construits pour de vrai, envoyés pour de faux.
vi.mock("../../../../src/shared/services/shopOrder.notifications.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/shared/services/shopOrder.notifications.js")>();
  return { ...actual, deliverNotices: vi.fn(async () => undefined) };
});

import { Order, OrderStatus, PaymentMethod } from "../../../../src/models/order.model.js";
import {
  ShopOrder,
  ShopOrderActor,
  ShopOrderPaymentStatus,
  ShopOrderStatus,
  type IShopOrder,
} from "../../../../src/models/shopOrder.model.js";
import { productBoutique } from "../../../../src/models/product.model.js";
import { Promotion } from "../../../../src/models/promotion.model.js";
import logger from "../../../../src/shared/logger/logger.js";
import { getPaymentProvider } from "../../../../src/shared/payment/payment.provider.js";
import {
  failOrderPayment,
  restoreCartAfterFailedPayment,
} from "../../../../src/shared/services/orderPayment.service.js";
import { deliverNotices } from "../../../../src/shared/services/shopOrder.notifications.js";
import { runOrderDeadlines } from "../../../../src/shared/services/orderDeadlines.service.js";
import { mockQuery } from "../../../helpers/model.mock.js";
import { mockSession } from "../../../helpers/express.mock.js";
import { makeOrder, makeShopOrder } from "../../../helpers/factories.js";

const OrderMock = Order as unknown as Record<string, any>;
const ShopOrderMock = ShopOrder as unknown as Record<string, any>;
const PbMock = productBoutique as unknown as Record<string, any>;
const PromotionMock = Promotion as unknown as Record<string, any>;

const S = ShopOrderStatus;
const NOW = new Date("2026-10-25T10:00:00.000Z");
const PAST = new Date("2026-10-25T09:00:00.000Z");
const NOTHING = { payments: 0, reminders: 0, actions: 0, alerts: 0, errors: 0 };

let session: ReturnType<typeof mockSession>;

/**
 * Ce que la base renvoie : les rappels dus, les échéances dues, et les
 * relectures dans la transaction (`fresh`, par identifiant).
 */
const given = (opts: { reminders?: IShopOrder[]; due?: IShopOrder[]; fresh?: IShopOrder[] }) => {
  ShopOrderMock.find.mockImplementation((filter: Record<string, unknown>) => {
    if ("reminderAt" in filter) return mockQuery(opts.reminders ?? []);
    if ("deadlineAt" in filter) return mockQuery(opts.due ?? []);
    // Recalcul du statut de la commande : ses sous-commandes.
    return mockQuery((opts.fresh ?? []).filter((part) => String(part.orderId) === String(filter.orderId)));
  });
  ShopOrderMock.findById.mockImplementation((id: unknown) =>
    mockQuery((opts.fresh ?? []).find((part) => part._id.toString() === String(id)) ?? null)
  );
};

/** La même sous-commande, relue dans la transaction. */
const reread = (part: IShopOrder, over: Record<string, unknown> = {}) =>
  makeShopOrder({
    _id: part._id,
    orderId: part.orderId,
    reference: part.reference,
    status: part.status,
    payment: part.payment,
    amount: part.amount,
    deadlineAt: part.deadlineAt,
    ...over,
  });

beforeEach(() => {
  session = mockSession();
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
  OrderMock.find.mockReturnValue(mockQuery([]));
  OrderMock.findById.mockImplementation((id: unknown) =>
    mockQuery(makeOrder({ _id: id, status: OrderStatus.IN_PROGRESS }))
  );
  ShopOrderMock.find.mockReturnValue(mockQuery([]));
  PbMock.findById.mockReturnValue(mockQuery(null));
  PromotionMock.findOne.mockReturnValue(mockQuery(null));
  vi.mocked(getPaymentProvider).mockReturnValue(null);
});

// ─────────────────────────────────────────────
describe("runOrderDeadlines — paiements en ligne expirés", () => {
  it("fait échouer les paiements non confirmés à temps et rend le panier", async () => {
    const expired = makeOrder({ status: OrderStatus.AWAITING_PAYMENT, paymentExpiresAt: PAST });
    const settled = makeOrder({ _id: expired._id, status: OrderStatus.PAYMENT_FAILED });
    OrderMock.find.mockReturnValue(mockQuery([expired]));
    vi.mocked(failOrderPayment).mockResolvedValue({ order: settled, parts: [], changed: true });

    const summary = await runOrderDeadlines(NOW);

    expect(OrderMock.find).toHaveBeenCalledWith({
      status: OrderStatus.AWAITING_PAYMENT,
      paymentExpiresAt: { $lte: NOW },
    });
    expect(failOrderPayment).toHaveBeenCalledWith(expired._id, "expired", NOW);
    expect(restoreCartAfterFailedPayment).toHaveBeenCalledWith(settled);
    expect(summary).toEqual({ ...NOTHING, payments: 1 });
  });

  it("ne rend pas le panier quand l'échec était déjà enregistré", async () => {
    OrderMock.find.mockReturnValue(mockQuery([makeOrder()]));
    vi.mocked(failOrderPayment).mockResolvedValue({ order: makeOrder(), parts: [], changed: false });

    const summary = await runOrderDeadlines(NOW);

    expect(restoreCartAfterFailedPayment).not.toHaveBeenCalled();
    expect(summary.payments).toBe(0);
  });

  it("compte une erreur sans arrêter les paiements suivants", async () => {
    const broken = makeOrder({ reference: "CMD-CASSEE" });
    const ok = makeOrder();
    OrderMock.find.mockReturnValue(mockQuery([broken, ok]));
    vi.mocked(failOrderPayment)
      .mockRejectedValueOnce(new Error("conflit d'écriture"))
      .mockResolvedValueOnce({ order: ok, parts: [], changed: true });

    const summary = await runOrderDeadlines(NOW);

    expect(summary).toEqual({ ...NOTHING, payments: 1, errors: 1 });
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(expect.stringContaining("CMD-CASSEE"));
  });
});

// ─────────────────────────────────────────────
describe("runOrderDeadlines — rappels", () => {
  it("envoie le rappel puis l'efface, pour ne l'envoyer qu'une fois", async () => {
    const part = makeShopOrder({ status: S.PENDING, reminderAt: PAST, reference: "CMD-42-1" });
    given({ reminders: [part] });

    const summary = await runOrderDeadlines(NOW);

    expect(ShopOrderMock.find).toHaveBeenCalledWith({ reminderAt: { $lte: NOW } });
    expect(deliverNotices).toHaveBeenCalledWith(
      [expect.objectContaining({ recipient: "shop", subject: "Rappel : commande CMD-42-1 à confirmer" })],
      part
    );
    expect(part.reminderAt).toBeNull();
    expect(part.save).toHaveBeenCalled();
    expect(summary).toEqual({ ...NOTHING, reminders: 1 });
  });

  it("compte un rappel non enregistré comme une erreur et passe au suivant", async () => {
    const broken = makeShopOrder({ status: S.READY_FOR_PICKUP, reminderAt: PAST });
    broken.save = vi.fn().mockRejectedValue(new Error("écriture refusée")) as any;
    const ok = makeShopOrder({ status: S.RETURN_REQUESTED, reminderAt: PAST });
    given({ reminders: [broken, ok] });

    const summary = await runOrderDeadlines(NOW);

    expect(ok.save).toHaveBeenCalled();
    expect(summary).toEqual({ ...NOTHING, reminders: 1, errors: 1 });
  });
});

// ─────────────────────────────────────────────
describe("runOrderDeadlines — échéances", () => {
  it("livraison sans suite : alerte l'administration, efface l'échéance, ne change pas le statut", async () => {
    const part = makeShopOrder({ status: S.SHIPPED, deadlineAt: PAST });
    given({ due: [part] });

    const summary = await runOrderDeadlines(NOW);

    expect(ShopOrderMock.find).toHaveBeenCalledWith({ deadlineAt: { $lte: NOW } });
    expect(deliverNotices).toHaveBeenCalledWith(
      [expect.objectContaining({ recipient: "admin", title: "Livraison sans suite depuis 7 jours" })],
      part
    );
    expect(part.status).toBe(S.SHIPPED);
    expect(part.deadlineAt).toBeNull();
    expect(part.save).toHaveBeenCalled();
    expect(ShopOrderMock.findById).not.toHaveBeenCalled();
    expect(mongoose.startSession).not.toHaveBeenCalled();
    expect(summary).toEqual({ ...NOTHING, alerts: 1 });
  });

  it("efface une échéance sans action automatique, sans rien appliquer", async () => {
    const part = makeShopOrder({ status: S.DISPUTED, deadlineAt: PAST });
    given({ due: [part] });

    const summary = await runOrderDeadlines(NOW);

    expect(part.status).toBe(S.DISPUTED);
    expect(part.deadlineAt).toBeNull();
    expect(part.save).toHaveBeenCalled();
    expect(deliverNotices).not.toHaveBeenCalled();
    expect(summary).toEqual(NOTHING);
  });

  it("expire une commande que la boutique n'a pas confirmée à temps", async () => {
    const part = makeShopOrder({ status: S.PENDING, deadlineAt: PAST, reference: "CMD-42-1" });
    const fresh = reread(part);
    given({ due: [part], fresh: [fresh] });

    const summary = await runOrderDeadlines(NOW);

    expect(ShopOrderMock.findById).toHaveBeenCalledWith(part._id);
    expect(fresh.status).toBe(S.EXPIRED);
    expect(fresh.payment.status).toBe(ShopOrderPaymentStatus.VOID);
    expect(fresh.statusHistory.at(-1)).toMatchObject({ status: S.EXPIRED, actor: ShopOrderActor.SYSTEM });
    expect(fresh.save).toHaveBeenCalledWith({ session });
    expect(session.commitTransaction).toHaveBeenCalled();
    // Le client et l'administration sont prévenus.
    const [notices, target] = vi.mocked(deliverNotices).mock.calls[0]!;
    expect(notices.map((notice) => notice.recipient)).toEqual(["client", "admin"]);
    expect(notices[0]!.subject).toBe("Commande CMD-42-1 expirée");
    expect(target).toBe(fresh);
    expect(getPaymentProvider).not.toHaveBeenCalled();
    expect(summary).toEqual({ ...NOTHING, actions: 1 });
  });

  it("expire une commande payée en ligne et la rembourse chez le prestataire", async () => {
    const refund = vi.fn(async () => ({ status: "refunded" as const }));
    vi.mocked(getPaymentProvider).mockReturnValue({ name: "test", initiate: vi.fn(), refund });
    const part = makeShopOrder({
      status: S.PENDING,
      deadlineAt: PAST,
      amount: 75_000,
      payment: { method: PaymentMethod.ONLINE, status: ShopOrderPaymentStatus.PAID, paidAt: PAST },
    });
    const fresh = reread(part);
    given({ due: [part], fresh: [fresh] });

    await runOrderDeadlines(NOW);

    expect(refund).toHaveBeenCalledWith(expect.objectContaining({ amount: 75_000, reference: part.reference }));
    expect(fresh.payment.status).toBe(ShopOrderPaymentStatus.REFUNDED);
    const [notices] = vi.mocked(deliverNotices).mock.calls[0]!;
    expect(notices[0]!.paragraphs.at(-1)).toMatch(/^Remboursement : 75\s000 GNF\.$/);
  });

  it("clôture une commande livrée dont le délai de retour est passé", async () => {
    const part = makeShopOrder({ status: S.DELIVERED, deadlineAt: PAST });
    const fresh = reread(part);
    given({ due: [part], fresh: [fresh] });

    const summary = await runOrderDeadlines(NOW);

    expect(fresh.status).toBe(S.COMPLETED);
    expect(fresh.deadlineAt).toBeNull();
    expect(summary.actions).toBe(1);
  });

  it("ouvre un litige quand la boutique ne répond pas à un retour", async () => {
    const part = makeShopOrder({
      status: S.RETURN_REQUESTED,
      deadlineAt: PAST,
      return: { reason: "damaged", photos: ["/p.jpg"], requestedAt: PAST },
    });
    const fresh = reread(part, { return: part.return });
    given({ due: [part], fresh: [fresh] });

    await runOrderDeadlines(NOW);

    expect(fresh.status).toBe(S.DISPUTED);
    const [notices] = vi.mocked(deliverNotices).mock.calls[0]!;
    expect(notices.map((notice) => notice.recipient)).toEqual(["client", "shop", "admin"]);
  });

  it("ignore une sous-commande sur laquelle une personne a agi entre-temps", async () => {
    const part = makeShopOrder({ status: S.PENDING, deadlineAt: PAST });
    const fresh = reread(part, { status: S.CONFIRMED });
    given({ due: [part], fresh: [fresh] });

    const summary = await runOrderDeadlines(NOW);

    expect(fresh.status).toBe(S.CONFIRMED);
    expect(fresh.save).not.toHaveBeenCalled();
    expect(deliverNotices).not.toHaveBeenCalled();
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(summary).toEqual(NOTHING);
  });

  it("ignore une sous-commande disparue entre-temps", async () => {
    const part = makeShopOrder({ status: S.PENDING, deadlineAt: PAST });
    given({ due: [part], fresh: [] });

    const summary = await runOrderDeadlines(NOW);

    expect(deliverNotices).not.toHaveBeenCalled();
    expect(summary).toEqual(NOTHING);
  });

  it("compte une échéance en échec sans arrêter les suivantes", async () => {
    const broken = makeShopOrder({ status: S.PENDING, deadlineAt: PAST, reference: "CMD-CASSEE-1" });
    const ok = makeShopOrder({ status: S.PENDING, deadlineAt: PAST });
    const fresh = reread(ok);
    given({ due: [broken, ok], fresh: [fresh] });
    const lookup = ShopOrderMock.findById.getMockImplementation();
    ShopOrderMock.findById.mockImplementation((id: unknown) =>
      String(id) === broken._id.toString()
        ? mockQuery(Promise.reject(new Error("transaction interrompue")))
        : lookup(id)
    );

    const summary = await runOrderDeadlines(NOW);

    expect(fresh.status).toBe(S.EXPIRED);
    expect(session.abortTransaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(expect.stringContaining("CMD-CASSEE-1"));
    expect(summary).toEqual({ ...NOTHING, actions: 1, errors: 1 });
  });

  it("enchaîne paiements, rappels et échéances dans un même passage", async () => {
    OrderMock.find.mockReturnValue(mockQuery([makeOrder()]));
    vi.mocked(failOrderPayment).mockResolvedValue({ order: makeOrder(), parts: [], changed: true });
    const reminder = makeShopOrder({ status: S.PENDING, reminderAt: PAST });
    const stalled = makeShopOrder({ status: S.SHIPPED, deadlineAt: PAST });
    const expiring = makeShopOrder({ status: S.READY_FOR_PICKUP, deadlineAt: PAST });
    given({ reminders: [reminder], due: [stalled, expiring], fresh: [reread(expiring)] });

    const summary = await runOrderDeadlines(NOW);

    expect(summary).toEqual({ payments: 1, reminders: 1, actions: 1, alerts: 1, errors: 0 });
  });
});
