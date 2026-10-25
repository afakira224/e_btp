import { describe, it, expect, vi, beforeEach } from "vitest";

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

// Le prestataire de paiement est choisi par chaque test.
vi.mock("../../../../src/shared/payment/payment.provider.js", () => ({
  getPaymentProvider: vi.fn(() => null),
}));

import { DeliveryMethod } from "../../../../src/models/delivery.model.js";
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
import { HttpError } from "../../../../src/shared/middlewares/error.middleware.js";
import { getPaymentProvider, type PaymentProvider } from "../../../../src/shared/payment/payment.provider.js";
import { ShopOrderAction, type ActionInput } from "../../../../src/shared/helpers/shopOrder.workflow.js";
import {
  applyShopOrderAction,
  releaseCoupon,
  restoreStock,
  settleProviderRefund,
  syncOrderStatus,
} from "../../../../src/shared/services/shopOrder.service.js";
import { mockQuery } from "../../../helpers/model.mock.js";
import { mockSession } from "../../../helpers/express.mock.js";
import {
  makeOrder,
  makeOrderItem,
  makeProductBoutique,
  makePromotion,
  makeShopOrder,
  oid,
} from "../../../helpers/factories.js";

const OrderMock = Order as unknown as Record<string, any>;
const ShopOrderMock = ShopOrder as unknown as Record<string, any>;
const PbMock = productBoutique as unknown as Record<string, any>;
const PromotionMock = Promotion as unknown as Record<string, any>;

const { CLIENT, SHOP, ADMIN, SYSTEM } = ShopOrderActor;
const S = ShopOrderStatus;
const NOW = new Date("2026-10-25T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const USER_ID = oid().toString();

let session: ReturnType<typeof mockSession>;

/** La commande de `part` (en cours), et les sous-commandes que la base renvoie. */
const givenOrder = (part: IShopOrder, opts: { order?: Record<string, unknown>; siblings?: IShopOrder[] } = {}) => {
  const order = makeOrder({ _id: part.orderId, status: OrderStatus.IN_PROGRESS, ...opts.order });
  OrderMock.findById.mockReturnValue(mockQuery(order));
  ShopOrderMock.find.mockReturnValue(mockQuery([part, ...(opts.siblings ?? [])]));
  return order;
};

/** Offres en base, trouvées par leur identifiant. */
const givenOffers = (...offers: any[]) => {
  PbMock.findById.mockImplementation((id: unknown) =>
    mockQuery(offers.find((offer) => offer._id.toString() === String(id)) ?? null)
  );
};

const run = (
  part: IShopOrder,
  action: ShopOrderAction,
  actors: ShopOrderActor[],
  input: ActionInput = {},
  /** null : action de la plateforme, sans auteur. */
  userId: string | null = USER_ID
) =>
  applyShopOrderAction({ part, action, actors, userId: userId ?? undefined, input, now: NOW, session: session as any });

/** Une sous-commande d'un article, avec l'offre correspondante en stock. */
const withOneItem = (over: Record<string, unknown> = {}, stock = 5) => {
  const offer = makeProductBoutique({ stock });
  const part = makeShopOrder({
    items: [makeOrderItem({ productBoutiqueId: offer._id, quantity: 2, price: 25_000 })],
    ...over,
  });
  givenOffers(offer);
  givenOrder(part);
  return { part, offer };
};

const paidOnline = { method: PaymentMethod.ONLINE, status: ShopOrderPaymentStatus.PAID, paidAt: NOW };
const paidOnDelivery = { method: PaymentMethod.ON_DELIVERY, status: ShopOrderPaymentStatus.PAID, paidAt: NOW };

beforeEach(() => {
  session = mockSession();
  OrderMock.findById.mockReturnValue(mockQuery(null));
  ShopOrderMock.find.mockReturnValue(mockQuery([]));
  PbMock.findById.mockReturnValue(mockQuery(null));
  PromotionMock.findOne.mockReturnValue(mockQuery(null));
  vi.mocked(getPaymentProvider).mockReturnValue(null);
});

// ─────────────────────────────────────────────
describe("applyShopOrderAction — contrôles", () => {
  it("lève une HttpError 403 quand le rôle ne permet pas l'action", async () => {
    const part = makeShopOrder();

    const attempt = run(part, ShopOrderAction.CONFIRM, [CLIENT]);

    await expect(attempt).rejects.toBeInstanceOf(HttpError);
    await expect(attempt).rejects.toMatchObject({
      statusCode: 403,
      message: "Vous ne pouvez pas effectuer cette action sur cette commande.",
    });
    expect(part.save).not.toHaveBeenCalled();
    expect(part.status).toBe(S.PENDING);
  });

  it("lève une HttpError 403 sans aucun rôle sur la sous-commande", async () => {
    await expect(run(makeShopOrder(), ShopOrderAction.CANCEL, [])).rejects.toMatchObject({ statusCode: 403 });
  });

  it("refuse (400) une action depuis un statut qui ne la permet pas", async () => {
    const part = makeShopOrder({ status: S.CONFIRMED });

    await expect(run(part, ShopOrderAction.CONFIRM, [SHOP])).rejects.toMatchObject({
      statusCode: 400,
      message: "Action impossible : la commande est en préparation.",
    });
    expect(part.save).not.toHaveBeenCalled();
  });

  it("refuse (400) une remise avec un code incorrect, sans rien modifier", async () => {
    const part = makeShopOrder({ status: S.SHIPPED, pickupCode: "654321" });

    await expect(run(part, ShopOrderAction.DELIVER, [SHOP], { code: "123456" })).rejects.toMatchObject({
      statusCode: 400,
      message: "Code de remise incorrect.",
    });
    expect(part.status).toBe(S.SHIPPED);
    expect(part.payment.status).toBe(ShopOrderPaymentStatus.UNPAID);
    expect(part.save).not.toHaveBeenCalled();
  });

  it("refuse (400) un refus sans motif", async () => {
    await expect(run(makeShopOrder(), ShopOrderAction.REFUSE, [SHOP])).rejects.toMatchObject({
      statusCode: 400,
      message: "Le motif est requis.",
    });
  });

  it("choisit le rôle permis quand la personne en a plusieurs", async () => {
    const part = makeShopOrder();
    givenOrder(part);

    await run(part, ShopOrderAction.CONFIRM, [CLIENT, SHOP]);

    expect(part.statusHistory.at(-1)?.actor).toBe(SHOP);
  });
});

// ─────────────────────────────────────────────
describe("applyShopOrderAction — statut, délais et historique", () => {
  it("confirme : statut en préparation, plus d'échéance, entrée d'historique complète", async () => {
    const part = makeShopOrder({
      deadlineAt: new Date(NOW.getTime() + DAY),
      reminderAt: new Date(NOW.getTime() + HOUR),
    });
    givenOrder(part);

    const result = await run(part, ShopOrderAction.CONFIRM, [SHOP], { note: "  Prête demain  " });

    expect(part.status).toBe(S.CONFIRMED);
    expect(part.deadlineAt).toBeNull();
    expect(part.reminderAt).toBeNull();
    const entry = part.statusHistory.at(-1)!;
    expect(entry).toMatchObject({ status: S.CONFIRMED, changedAt: NOW, actor: SHOP, note: "Prête demain" });
    expect(entry).not.toHaveProperty("reason");
    expect(String(entry.changedBy)).toBe(USER_ID);
    expect(part.save).toHaveBeenCalledWith({ session });
    expect(result).toMatchObject({ part, from: S.PENDING, refund: 0, refundViaProvider: false });
  });

  it("garde le motif et la note dans l'historique", async () => {
    const { part } = withOneItem();

    await run(part, ShopOrderAction.REFUSE, [SHOP], { reason: "other", note: "Fournisseur en retard" });

    expect(part.statusHistory.at(-1)).toMatchObject({
      status: S.REFUSED,
      actor: SHOP,
      reason: "other",
      note: "Fournisseur en retard",
    });
  });

  it("n'inscrit pas d'auteur quand la plateforme agit seule", async () => {
    const part = makeShopOrder({ status: S.DELIVERED });
    givenOrder(part);

    await run(part, ShopOrderAction.COMPLETE, [SYSTEM], {}, null);

    const entry = part.statusHistory.at(-1)!;
    expect(entry).toMatchObject({ status: S.COMPLETED, actor: SYSTEM });
    expect(entry).not.toHaveProperty("changedBy");
    expect(entry).not.toHaveProperty("note");
  });

  it("met une note par défaut quand la plateforme ouvre un litige", async () => {
    const part = makeShopOrder({
      status: S.RETURN_REQUESTED,
      return: { reason: "damaged", photos: ["/p.jpg"], requestedAt: NOW },
    });
    givenOrder(part);

    await run(part, ShopOrderAction.ESCALATE, [SYSTEM], {}, null);

    expect(part.status).toBe(S.DISPUTED);
    expect(part.return?.respondedAt).toEqual(NOW);
    expect(part.statusHistory.at(-1)?.note).toBe("La boutique n'a pas répondu au retour sous 48 heures.");
  });

  it("expédie : compte une tentative et programme l'alerte de livraison à 7 jours", async () => {
    const part = makeShopOrder({ status: S.CONFIRMED });
    givenOrder(part);

    await run(part, ShopOrderAction.SHIP, [SHOP]);

    expect(part.status).toBe(S.SHIPPED);
    expect(part.deliveryAttempts).toBe(1);
    expect(part.deadlineAt).toEqual(new Date(NOW.getTime() + 7 * DAY));
    expect(part.reminderAt).toBeNull();
  });

  it("relance la livraison : une tentative de plus", async () => {
    const part = makeShopOrder({ status: S.DELIVERY_FAILED, deliveryAttempts: 1 });
    givenOrder(part);

    await run(part, ShopOrderAction.RETRY_DELIVERY, [SHOP]);

    expect(part.status).toBe(S.SHIPPED);
    expect(part.deliveryAttempts).toBe(2);
  });

  it("met au retrait : échéance à 7 jours, rappel à 3 jours", async () => {
    const part = makeShopOrder({ status: S.CONFIRMED, delivery: { method: DeliveryMethod.PICKUP, fee: 0 } });
    givenOrder(part);

    await run(part, ShopOrderAction.READY, [SHOP]);

    expect(part.status).toBe(S.READY_FOR_PICKUP);
    expect(part.deliveryAttempts).toBe(0);
    expect(part.deadlineAt).toEqual(new Date(NOW.getTime() + 7 * DAY));
    expect(part.reminderAt).toEqual(new Date(NOW.getTime() + 3 * DAY));
  });

  it("remet une commande payée à la remise : la boutique encaisse", async () => {
    const part = makeShopOrder({ status: S.SHIPPED, pickupCode: "654321" });
    givenOrder(part);

    await run(part, ShopOrderAction.DELIVER, [SHOP], { code: " 654321 " });

    expect(part.status).toBe(S.DELIVERED);
    expect(part.payment.status).toBe(ShopOrderPaymentStatus.PAID);
    expect(part.payment.paidAt).toEqual(NOW);
    // Ouvre la fenêtre de retour de 7 jours.
    expect(part.deadlineAt).toEqual(new Date(NOW.getTime() + 7 * DAY));
  });

  it("remet une commande payée en ligne sans toucher au paiement", async () => {
    const paidAt = new Date("2026-10-20T10:00:00.000Z");
    const part = makeShopOrder({ status: S.SHIPPED, payment: { ...paidOnline, paidAt } });
    givenOrder(part);

    await run(part, ShopOrderAction.DELIVER, [SHOP], { code: "123456" });

    expect(part.payment.status).toBe(ShopOrderPaymentStatus.PAID);
    expect(part.payment.paidAt).toEqual(paidAt);
  });

  it("enregistre une demande de retour avec motif, précision et photos", async () => {
    const part = makeShopOrder({ status: S.DELIVERED, deadlineAt: new Date(NOW.getTime() + DAY) });
    givenOrder(part);

    await run(part, ShopOrderAction.REQUEST_RETURN, [CLIENT], {
      reason: "damaged",
      note: "  Écran fissuré  ",
      photos: ["/uploads/images/a.jpg"],
    });

    expect(part.status).toBe(S.RETURN_REQUESTED);
    expect(part.return).toEqual({
      reason: "damaged",
      details: "Écran fissuré",
      photos: ["/uploads/images/a.jpg"],
      requestedAt: NOW,
    });
    expect(part.deadlineAt).toEqual(new Date(NOW.getTime() + 48 * HOUR));
    expect(part.reminderAt).toEqual(new Date(NOW.getTime() + 24 * HOUR));
  });

  it("enregistre une demande de retour sans précision ni photo", async () => {
    const part = makeShopOrder({ status: S.DELIVERED });
    givenOrder(part);

    await run(part, ShopOrderAction.REQUEST_RETURN, [CLIENT], { reason: "incomplete" });

    expect(part.return).toEqual({ reason: "incomplete", details: undefined, photos: [], requestedAt: NOW });
  });

  it("refuse un retour : la réponse de la boutique est gardée et le litige s'ouvre", async () => {
    const part = makeShopOrder({
      status: S.RETURN_REQUESTED,
      return: { reason: "not_as_described", photos: [], requestedAt: NOW },
    });
    givenOrder(part);

    await run(part, ShopOrderAction.REJECT_RETURN, [SHOP], { note: "  Produit conforme à la fiche  " });

    expect(part.status).toBe(S.DISPUTED);
    expect(part.return).toMatchObject({ shopResponse: "Produit conforme à la fiche", respondedAt: NOW });
    expect(part.deadlineAt).toBeNull();
  });
});

// ─────────────────────────────────────────────
describe("applyShopOrderAction — stock et argent d'une fin négative", () => {
  it("refus pour rupture : l'offre passe à 0, le stock réservé n'est pas rendu", async () => {
    const { part, offer } = withOneItem({}, 5);

    await run(part, ShopOrderAction.REFUSE, [SHOP], { reason: "out_of_stock" });

    expect(part.status).toBe(S.REFUSED);
    expect(offer.stock).toBe(0);
    expect(offer.save).toHaveBeenCalledWith({ session });
  });

  it("refus pour rupture : une offre déjà à 0 n'est pas réécrite", async () => {
    const { part, offer } = withOneItem({}, 0);

    await run(part, ShopOrderAction.REFUSE, [SHOP], { reason: "out_of_stock" });

    expect(offer.stock).toBe(0);
    expect(offer.save).not.toHaveBeenCalled();
  });

  it("refus pour un autre motif : le stock réservé est rendu", async () => {
    const { part, offer } = withOneItem({}, 5);

    await run(part, ShopOrderAction.REFUSE, [SHOP], { reason: "wrong_price" });

    expect(offer.stock).toBe(7);
    expect(offer.save).toHaveBeenCalledWith({ session });
  });

  it("rien n'avait été encaissé : le paiement est annulé, rien à rembourser", async () => {
    const { part, offer } = withOneItem();

    const result = await run(part, ShopOrderAction.CANCEL, [CLIENT], { reason: "changed_mind" });

    expect(part.status).toBe(S.CANCELLED);
    expect(part.payment.status).toBe(ShopOrderPaymentStatus.VOID);
    expect(part.payment.refundedAmount).toBe(0);
    expect(offer.stock).toBe(7);
    expect(result).toMatchObject({ refund: 0, refundViaProvider: false });
  });

  it("payé en ligne puis refusé : remboursement intégral par le prestataire", async () => {
    const { part } = withOneItem({ payment: paidOnline, amount: 75_000 });

    const result = await run(part, ShopOrderAction.REFUSE, [SHOP], { reason: "wrong_price" });

    expect(part.payment.status).toBe(ShopOrderPaymentStatus.REFUND_PENDING);
    expect(part.payment.refundedAmount).toBe(75_000);
    expect(result).toMatchObject({ refund: 75_000, refundViaProvider: true });
  });

  it("payé à la remise puis retourné : la boutique rembourse elle-même, le stock n'est pas rendu", async () => {
    const { part } = withOneItem({
      status: S.RETURN_REQUESTED,
      payment: paidOnDelivery,
      amount: 75_000,
      return: { reason: "damaged", photos: ["/p.jpg"], requestedAt: NOW },
    });

    const result = await run(part, ShopOrderAction.ACCEPT_RETURN, [SHOP]);

    expect(part.status).toBe(S.RETURNED);
    expect(part.return?.respondedAt).toEqual(NOW);
    expect(part.payment.status).toBe(ShopOrderPaymentStatus.REFUND_PENDING);
    expect(part.payment.refundedAmount).toBe(75_000);
    expect(result).toMatchObject({ refund: 75_000, refundViaProvider: false });
    // Un produit retourné ne revient pas d'office en vente.
    expect(PbMock.findById).not.toHaveBeenCalled();
  });

  it("annulée par l'administration en livraison : stock rendu, remboursement intégral", async () => {
    const { part, offer } = withOneItem({ status: S.SHIPPED, payment: paidOnline, amount: 75_000 });

    const result = await run(part, ShopOrderAction.ADMIN_CANCEL, [ADMIN], { note: "Fraude suspectée" });

    expect(part.status).toBe(S.CANCELLED);
    expect(offer.stock).toBe(7);
    expect(result).toMatchObject({ refund: 75_000, refundViaProvider: true });
    expect(part.deadlineAt).toBeNull();
  });

  /** Sous-commande payée en ligne dont la livraison a échoué pour `reason`. */
  const failedDelivery = (reason: string) =>
    withOneItem({
      status: S.DELIVERY_FAILED,
      payment: paidOnline,
      amount: 75_000,
      deliveryFee: 25_000,
      statusHistory: [
        { status: S.SHIPPED, changedAt: new Date("2026-03-01"), actor: SHOP },
        { status: S.DELIVERY_FAILED, changedAt: new Date("2026-03-02"), actor: SHOP, reason },
      ],
    });

  it("échec de livraison causé par le client : les frais de livraison ne sont pas rendus", async () => {
    const { part } = failedDelivery("customer_absent");

    const result = await run(part, ShopOrderAction.ABANDON_DELIVERY, [SHOP], {});

    expect(part.status).toBe(S.FAILED);
    expect(part.payment.refundedAmount).toBe(50_000);
    expect(result.refund).toBe(50_000);
  });

  it("abandon : la cause est celle constatée à l'échec, pas un motif envoyé avec l'abandon", async () => {
    const { part } = failedDelivery("address_not_found");

    const result = await run(part, ShopOrderAction.ABANDON_DELIVERY, [SHOP], { reason: "customer_absent" });

    // Adresse introuvable : le client n'y est pour rien, tout lui est rendu.
    expect(result.refund).toBe(75_000);
    // Le motif d'une action qui n'en prend pas n'entre pas dans l'historique.
    expect(part.statusHistory.at(-1)?.reason).toBeUndefined();
  });

  it("expire une commande prête au retrait payée en ligne : stock rendu, remboursement", async () => {
    const { part, offer } = withOneItem({
      status: S.READY_FOR_PICKUP,
      payment: paidOnline,
      delivery: { method: DeliveryMethod.PICKUP, fee: 0 },
      deliveryFee: 0,
      amount: 50_000,
    });

    const result = await run(part, ShopOrderAction.EXPIRE, [SYSTEM], {}, null);

    expect(part.status).toBe(S.EXPIRED);
    expect(offer.stock).toBe(7);
    expect(result).toMatchObject({ refund: 50_000, refundViaProvider: true });
  });

  it("litige rejeté : la commande est terminée, rien n'est remboursé", async () => {
    const part = makeShopOrder({
      status: S.DISPUTED,
      payment: paidOnline,
      return: { reason: "damaged", photos: ["/p.jpg"], requestedAt: NOW },
    });
    givenOrder(part);

    const result = await run(part, ShopOrderAction.RESOLVE_DISPUTE, [ADMIN], {
      resolution: "rejected",
      note: "Les photos ne montrent aucun défaut",
    });

    expect(part.status).toBe(S.COMPLETED);
    expect(part.return).toMatchObject({
      resolution: "rejected",
      resolutionNote: "Les photos ne montrent aucun défaut",
      resolvedAt: NOW,
    });
    expect(part.payment.status).toBe(ShopOrderPaymentStatus.PAID);
    expect(result).toMatchObject({ refund: 0, refundViaProvider: false });
  });

  it("litige tranché par un remboursement partiel : retournée, montant décidé", async () => {
    const part = makeShopOrder({
      status: S.DISPUTED,
      payment: paidOnline,
      amount: 75_000,
      return: { reason: "incomplete", photos: [], requestedAt: NOW },
    });
    givenOrder(part);

    const result = await run(part, ShopOrderAction.RESOLVE_DISPUTE, [ADMIN], {
      resolution: "refund_partial",
      refundAmount: 20_000,
      note: "Un article manquait",
    });

    expect(part.status).toBe(S.RETURNED);
    expect(part.return?.resolution).toBe("refund_partial");
    expect(part.payment.status).toBe(ShopOrderPaymentStatus.REFUND_PENDING);
    expect(part.payment.refundedAmount).toBe(20_000);
    expect(result).toMatchObject({ refund: 20_000, refundViaProvider: true });
    expect(PbMock.findById).not.toHaveBeenCalled();
  });

  it("déclare un remboursement intégral : remboursée, statut inchangé, pas de nouvel effet", async () => {
    const part = makeShopOrder({
      status: S.RETURNED,
      amount: 75_000,
      payment: { ...paidOnDelivery, status: ShopOrderPaymentStatus.REFUND_PENDING, refundedAmount: 75_000 },
    });
    givenOrder(part);

    const result = await run(part, ShopOrderAction.CONFIRM_REFUND, [SHOP]);

    expect(part.status).toBe(S.RETURNED);
    expect(part.payment.status).toBe(ShopOrderPaymentStatus.REFUNDED);
    expect(part.payment.refundedAt).toEqual(NOW);
    expect(part.statusHistory.at(-1)).toMatchObject({ status: S.RETURNED, note: "Remboursement effectué." });
    expect(result).toMatchObject({ from: S.RETURNED, refund: 0, refundViaProvider: false });
    expect(PbMock.findById).not.toHaveBeenCalled();
  });

  it("déclare un remboursement partiel : partiellement remboursée", async () => {
    const part = makeShopOrder({
      status: S.RETURNED,
      amount: 75_000,
      payment: { ...paidOnDelivery, status: ShopOrderPaymentStatus.REFUND_PENDING, refundedAmount: 20_000 },
    });
    givenOrder(part);

    await run(part, ShopOrderAction.CONFIRM_REFUND, [ADMIN]);

    expect(part.payment.status).toBe(ShopOrderPaymentStatus.PARTIALLY_REFUNDED);
  });

  it("met à jour la commande d'après ses sous-commandes", async () => {
    const part = makeShopOrder({ status: S.DELIVERED });
    const order = givenOrder(part);

    const result = await run(part, ShopOrderAction.COMPLETE, [SYSTEM], {}, null);

    expect(OrderMock.findById).toHaveBeenCalledWith(part.orderId);
    expect(order.status).toBe(OrderStatus.COMPLETED);
    expect(result.order).toBe(order);
  });
});

// ─────────────────────────────────────────────
describe("restoreStock / releaseCoupon", () => {
  it("rend chaque article à son offre, dans la transaction", async () => {
    const a = makeProductBoutique({ stock: 1 });
    const b = makeProductBoutique({ stock: 0 });
    givenOffers(a, b);

    await restoreStock(
      [
        makeOrderItem({ productBoutiqueId: a._id, quantity: 2 }),
        makeOrderItem({ productBoutiqueId: b._id, quantity: 3 }),
      ],
      session as any
    );

    expect(a.stock).toBe(3);
    expect(b.stock).toBe(3);
    expect(a.save).toHaveBeenCalledWith({ session });
  });

  it("ignore une offre supprimée entre-temps", async () => {
    await expect(restoreStock([makeOrderItem()], session as any)).resolves.toBeUndefined();
  });

  it("rend une utilisation du coupon", async () => {
    const promo = makePromotion({ code: "RENTREE10", usedCount: 3 });
    const query = mockQuery(promo);
    PromotionMock.findOne.mockReturnValue(query);

    await releaseCoupon("RENTREE10", session as any);

    expect(PromotionMock.findOne).toHaveBeenCalledWith({ code: "RENTREE10" });
    expect(query.session).toHaveBeenCalledWith(session);
    expect(promo.usedCount).toBe(2);
    expect(promo.save).toHaveBeenCalledWith({ session });
  });

  it("ne descend jamais le compteur du coupon sous 0", async () => {
    const promo = makePromotion({ usedCount: 0 });
    PromotionMock.findOne.mockReturnValue(mockQuery(promo));

    await releaseCoupon("RENTREE10", session as any);

    expect(promo.usedCount).toBe(0);
    expect(promo.save).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("syncOrderStatus", () => {
  const sync = (order: any, dbParts: IShopOrder[], changed: IShopOrder[] = [], userId?: string) => {
    OrderMock.findById.mockReturnValue(mockQuery(order));
    ShopOrderMock.find.mockReturnValue(mockQuery(dbParts));
    return syncOrderStatus(order?._id ?? oid(), changed, session as any, NOW, userId);
  };

  it("renvoie null quand la commande n'existe plus", async () => {
    await expect(sync(null, [])).resolves.toBeNull();
  });

  it("ne touche plus une commande dont le paiement a échoué", async () => {
    const order = makeOrder({ status: OrderStatus.PAYMENT_FAILED });

    const result = await sync(order, [makeShopOrder({ status: S.CANCELLED })]);

    expect(result).toBe(order);
    expect(order.status).toBe(OrderStatus.PAYMENT_FAILED);
    expect(ShopOrderMock.find).not.toHaveBeenCalled();
    expect(order.save).not.toHaveBeenCalled();
  });

  it("toutes négatives : commande annulée, utilisation du coupon rendue", async () => {
    const order = makeOrder({ status: OrderStatus.IN_PROGRESS, promotionCode: "RENTREE10" });
    const promo = makePromotion({ code: "RENTREE10", usedCount: 4 });
    PromotionMock.findOne.mockReturnValue(mockQuery(promo));

    await sync(order, [makeShopOrder({ status: S.CANCELLED }), makeShopOrder({ status: S.REFUSED })], [], USER_ID);

    expect(order.status).toBe(OrderStatus.CANCELLED);
    const entry = order.statusHistory.at(-1)!;
    expect(entry).toMatchObject({ status: OrderStatus.CANCELLED, changedAt: NOW });
    expect(String(entry.changedBy)).toBe(USER_ID);
    expect(promo.usedCount).toBe(3);
    expect(order.save).toHaveBeenCalledWith({ session });
  });

  it("toutes négatives sans coupon : aucune promotion consultée", async () => {
    const order = makeOrder({ status: OrderStatus.IN_PROGRESS, promotionCode: null });

    await sync(order, [makeShopOrder({ status: S.EXPIRED })]);

    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(order.statusHistory.at(-1)).not.toHaveProperty("changedBy");
    expect(PromotionMock.findOne).not.toHaveBeenCalled();
  });

  it("positives et négatives : commande partiellement terminée, coupon conservé", async () => {
    const order = makeOrder({ status: OrderStatus.IN_PROGRESS, promotionCode: "RENTREE10" });

    await sync(order, [makeShopOrder({ status: S.COMPLETED }), makeShopOrder({ status: S.RETURNED })]);

    expect(order.status).toBe(OrderStatus.PARTIALLY_COMPLETED);
    expect(PromotionMock.findOne).not.toHaveBeenCalled();
  });

  it("une partie encore ouverte : la commande reste en cours, rien n'est écrit", async () => {
    const order = makeOrder({ status: OrderStatus.IN_PROGRESS, statusHistory: [] });

    await sync(order, [makeShopOrder({ status: S.COMPLETED }), makeShopOrder({ status: S.SHIPPED })]);

    expect(order.status).toBe(OrderStatus.IN_PROGRESS);
    expect(order.statusHistory).toHaveLength(0);
    expect(order.save).not.toHaveBeenCalled();
  });

  it("préfère la version en mémoire d'une sous-commande modifiée dans la transaction", async () => {
    const order = makeOrder({ status: OrderStatus.IN_PROGRESS });
    const stale = makeShopOrder({ status: S.DELIVERED });
    const fresh = makeShopOrder({ _id: stale._id, status: S.COMPLETED });

    await sync(order, [stale], [fresh]);

    expect(order.status).toBe(OrderStatus.COMPLETED);
  });
});

// ─────────────────────────────────────────────
describe("settleProviderRefund", () => {
  const provider = (refund: PaymentProvider["refund"]): PaymentProvider => ({
    name: "test",
    initiate: vi.fn(),
    refund: vi.fn(refund),
  });
  const pendingRefund = (refundedAmount: number) =>
    makeShopOrder({
      status: S.REFUSED,
      amount: 75_000,
      reference: "CMD-42-1",
      payment: { ...paidOnline, status: ShopOrderPaymentStatus.REFUND_PENDING, refundedAmount },
    });

  it("sans prestataire : reste à rembourser, l'erreur est journalisée", async () => {
    const part = pendingRefund(75_000);

    await settleProviderRefund(part, { paymentRef: "SBX-1" });

    expect(part.payment.status).toBe(ShopOrderPaymentStatus.REFUND_PENDING);
    expect(part.save).not.toHaveBeenCalled();
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(expect.stringContaining("CMD-42-1"));
  });

  it("remboursement intégral confirmé : remboursée", async () => {
    const fake = provider(async () => ({ status: "refunded" }));
    vi.mocked(getPaymentProvider).mockReturnValue(fake);
    const part = pendingRefund(75_000);

    await settleProviderRefund(part, { paymentRef: "SBX-1" });

    expect(fake.refund).toHaveBeenCalledWith({ providerRef: "SBX-1", amount: 75_000, reference: "CMD-42-1" });
    expect(part.payment.status).toBe(ShopOrderPaymentStatus.REFUNDED);
    expect(part.payment.refundedAt).toBeInstanceOf(Date);
    expect(part.save).toHaveBeenCalled();
  });

  it("remboursement partiel confirmé : partiellement remboursée", async () => {
    vi.mocked(getPaymentProvider).mockReturnValue(provider(async () => ({ status: "refunded" })));
    const part = pendingRefund(20_000);

    await settleProviderRefund(part, null);

    expect(part.payment.status).toBe(ShopOrderPaymentStatus.PARTIALLY_REFUNDED);
  });

  it("transmet une référence nulle quand la commande est inconnue", async () => {
    const fake = provider(async () => ({ status: "refunded" }));
    vi.mocked(getPaymentProvider).mockReturnValue(fake);

    await settleProviderRefund(pendingRefund(75_000), null);

    expect(fake.refund).toHaveBeenCalledWith(expect.objectContaining({ providerRef: null }));
  });

  it("remboursement en attente chez le prestataire : rien n'est écrit", async () => {
    vi.mocked(getPaymentProvider).mockReturnValue(provider(async () => ({ status: "pending" })));
    const part = pendingRefund(75_000);

    await settleProviderRefund(part, { paymentRef: "SBX-1" });

    expect(part.payment.status).toBe(ShopOrderPaymentStatus.REFUND_PENDING);
    expect(part.save).not.toHaveBeenCalled();
  });

  it("prestataire en échec : reste à rembourser, sans lever", async () => {
    vi.mocked(getPaymentProvider).mockReturnValue(
      provider(async () => {
        throw new Error("timeout");
      })
    );
    const part = pendingRefund(75_000);

    await expect(settleProviderRefund(part, { paymentRef: "SBX-1" })).resolves.toBeUndefined();

    expect(part.payment.status).toBe(ShopOrderPaymentStatus.REFUND_PENDING);
    expect(part.save).not.toHaveBeenCalled();
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(expect.stringContaining("timeout"));
  });
});
