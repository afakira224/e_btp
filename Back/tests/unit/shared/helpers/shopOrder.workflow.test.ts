import { describe, it, expect } from "vitest";
import { DeliveryMethod } from "../../../../src/models/delivery.model.js";
import { OrderStatus } from "../../../../src/models/order.model.js";
import {
  ShopOrderActor,
  ShopOrderPaymentStatus,
  ShopOrderStatus,
} from "../../../../src/models/shopOrder.model.js";
import {
  ACTION_RULES,
  allocateDiscount,
  availableActions,
  checkAction,
  DEADLINES,
  generatePickupCode,
  groupOf,
  isManualAction,
  MANUAL_ACTIONS,
  orderStatusFrom,
  refundAmountFor,
  scheduleFor,
  ShopOrderAction,
  targetStatus,
} from "../../../../src/shared/helpers/shopOrder.workflow.js";

const { CLIENT, SHOP, ADMIN, SYSTEM } = ShopOrderActor;
const S = ShopOrderStatus;
const NOW = new Date("2026-10-25T10:00:00.000Z");

/** Sous-commande minimale : seuls les champs que les règles lisent. */
const part = (over: Record<string, unknown> = {}) =>
  ({
    status: S.PENDING,
    delivery: { method: DeliveryMethod.FLAT_RATE },
    deliveryAttempts: 0,
    pickupCode: "123456",
    amount: 80_000,
    deliveryFee: 25_000,
    payment: { status: ShopOrderPaymentStatus.UNPAID },
    deadlineAt: null,
    ...over,
  }) as any;

describe("checkAction — qui peut agir", () => {
  it("réserve la confirmation à la boutique", () => {
    expect(checkAction(ShopOrderAction.CONFIRM, [CLIENT], part(), {}, NOW)).toBe(
      "Vous ne pouvez pas effectuer cette action sur cette commande."
    );
    expect(checkAction(ShopOrderAction.CONFIRM, [SHOP], part(), {}, NOW)).toBeNull();
  });

  it("réserve l'annulation simple au client et l'annulation d'office à l'administration", () => {
    expect(checkAction(ShopOrderAction.CANCEL, [SHOP], part(), {}, NOW)).not.toBeNull();
    expect(checkAction(ShopOrderAction.CANCEL, [CLIENT], part(), {}, NOW)).toBeNull();
    expect(checkAction(ShopOrderAction.ADMIN_CANCEL, [CLIENT], part(), {}, NOW)).not.toBeNull();
    expect(checkAction(ShopOrderAction.ADMIN_CANCEL, [ADMIN], part(), {}, NOW)).toBeNull();
  });

  it("n'expose aucune action automatique à l'API", () => {
    expect(MANUAL_ACTIONS).not.toContain(ShopOrderAction.EXPIRE);
    expect(MANUAL_ACTIONS).not.toContain(ShopOrderAction.COMPLETE);
    expect(MANUAL_ACTIONS).not.toContain(ShopOrderAction.ESCALATE);
    expect(isManualAction("expire")).toBe(false);
    expect(isManualAction("confirm")).toBe(true);
    expect(isManualAction("changer-statut")).toBe(false);
  });

  it("garde les actions automatiques pour la plateforme seule", () => {
    expect(ACTION_RULES[ShopOrderAction.EXPIRE].actors).toEqual([SYSTEM]);
    expect(checkAction(ShopOrderAction.EXPIRE, [ADMIN], part(), {}, NOW)).not.toBeNull();
  });
});

describe("checkAction — depuis quel statut", () => {
  it("refuse une confirmation sur une commande déjà en préparation, en le disant", () => {
    expect(checkAction(ShopOrderAction.CONFIRM, [SHOP], part({ status: S.CONFIRMED }), {}, NOW)).toBe(
      "Action impossible : la commande est en préparation."
    );
  });

  it("interdit au client d'annuler une commande partie en livraison", () => {
    expect(checkAction(ShopOrderAction.CANCEL, [CLIENT], part({ status: S.SHIPPED }), {}, NOW)).toBe(
      "Action impossible : la commande est en livraison."
    );
  });

  it("n'autorise aucune action manuelle sur une commande terminée", () => {
    for (const status of [S.COMPLETED, S.CANCELLED, S.REFUSED, S.EXPIRED, S.FAILED]) {
      expect(availableActions([CLIENT, SHOP, ADMIN], part({ status }), NOW)).toEqual([]);
    }
  });
});

describe("checkAction — motifs et conditions", () => {
  it("exige un motif de la liste pour refuser", () => {
    expect(checkAction(ShopOrderAction.REFUSE, [SHOP], part(), {}, NOW)).toBe("Le motif est requis.");
    expect(checkAction(ShopOrderAction.REFUSE, [SHOP], part(), { reason: "flemme" }, NOW)).toContain("Motif invalide");
    expect(checkAction(ShopOrderAction.REFUSE, [SHOP], part(), { reason: "out_of_stock" }, NOW)).toBeNull();
  });

  it("exige une précision quand le motif est « Autre »", () => {
    expect(checkAction(ShopOrderAction.REFUSE, [SHOP], part(), { reason: "other" }, NOW)).toBe(
      "Précisez le motif « Autre »."
    );
    expect(checkAction(ShopOrderAction.REFUSE, [SHOP], part(), { reason: "other", note: "Fermé" }, NOW)).toBeNull();
  });

  it("laisse le motif d'annulation facultatif au client", () => {
    expect(checkAction(ShopOrderAction.CANCEL, [CLIENT], part(), {}, NOW)).toBeNull();
  });

  it("n'expédie pas une commande à retirer, et ne met pas à disposition une commande à livrer", () => {
    const pickup = part({ status: S.CONFIRMED, delivery: { method: DeliveryMethod.PICKUP } });
    const delivery = part({ status: S.CONFIRMED });
    expect(checkAction(ShopOrderAction.SHIP, [SHOP], pickup, {}, NOW)).toContain("ne s'expédie pas");
    expect(checkAction(ShopOrderAction.READY, [SHOP], delivery, {}, NOW)).toContain("retirer en boutique");
    expect(availableActions([SHOP], pickup, NOW)).toEqual(
      expect.arrayContaining([ShopOrderAction.READY, ShopOrderAction.REFUSE])
    );
    expect(availableActions([SHOP], pickup, NOW)).not.toContain(ShopOrderAction.SHIP);
  });

  it("exige le code de remise exact pour livrer", () => {
    const shipped = part({ status: S.SHIPPED });
    expect(checkAction(ShopOrderAction.DELIVER, [SHOP], shipped, {}, NOW)).toBe("Code de remise incorrect.");
    expect(checkAction(ShopOrderAction.DELIVER, [SHOP], shipped, { code: "000000" }, NOW)).toBe("Code de remise incorrect.");
    expect(checkAction(ShopOrderAction.DELIVER, [SHOP], shipped, { code: " 123456 " }, NOW)).toBeNull();
  });

  it("limite les tentatives de livraison à deux", () => {
    const failedOnce = part({ status: S.DELIVERY_FAILED, deliveryAttempts: 1 });
    const failedTwice = part({ status: S.DELIVERY_FAILED, deliveryAttempts: 2 });
    expect(checkAction(ShopOrderAction.RETRY_DELIVERY, [SHOP], failedOnce, {}, NOW)).toBeNull();
    expect(checkAction(ShopOrderAction.RETRY_DELIVERY, [SHOP], failedTwice, {}, NOW)).toContain("2 tentatives");
    expect(availableActions([SHOP], failedTwice, NOW)).toEqual([ShopOrderAction.ABANDON_DELIVERY]);
  });

  it("ferme la demande de retour à la fin du délai de 7 jours", () => {
    const open = part({ status: S.DELIVERED, deadlineAt: new Date(NOW.getTime() + 1_000) });
    const closed = part({ status: S.DELIVERED, deadlineAt: new Date(NOW.getTime() - 1_000) });
    expect(checkAction(ShopOrderAction.REQUEST_RETURN, [CLIENT], open, { reason: "incomplete" }, NOW)).toBeNull();
    expect(checkAction(ShopOrderAction.REQUEST_RETURN, [CLIENT], closed, { reason: "incomplete" }, NOW)).toBe(
      "Le délai de retour est dépassé."
    );
    expect(availableActions([CLIENT], closed, NOW)).toEqual([]);
  });

  it("exige une photo pour un produit abîmé", () => {
    const delivered = part({ status: S.DELIVERED });
    expect(checkAction(ShopOrderAction.REQUEST_RETURN, [CLIENT], delivered, { reason: "damaged" }, NOW)).toContain("photo");
    expect(
      checkAction(ShopOrderAction.REQUEST_RETURN, [CLIENT], delivered, { reason: "damaged", photos: ["/uploads/a.jpg"] }, NOW)
    ).toBeNull();
  });

  it("exige une explication pour refuser un retour", () => {
    const requested = part({ status: S.RETURN_REQUESTED });
    expect(checkAction(ShopOrderAction.REJECT_RETURN, [SHOP], requested, {}, NOW)).toContain("Expliquez");
    expect(checkAction(ShopOrderAction.REJECT_RETURN, [SHOP], requested, { note: "Produit utilisé" }, NOW)).toBeNull();
  });

  it("borne un remboursement partiel entre 1 GNF et le montant moins 1", () => {
    const disputed = part({ status: S.DISPUTED });
    const resolve = (refundAmount?: number) =>
      checkAction(ShopOrderAction.RESOLVE_DISPUTE, [ADMIN], disputed, { resolution: "refund_partial", note: "Moitié", refundAmount }, NOW);
    expect(resolve()).toContain("remboursement partiel");
    expect(resolve(0)).toContain("remboursement partiel");
    expect(resolve(80_000)).toContain("remboursement partiel");
    expect(resolve(40_000)).toBeNull();
    expect(checkAction(ShopOrderAction.RESOLVE_DISPUTE, [ADMIN], disputed, { resolution: "rejected" }, NOW)).toContain("Motivez");
  });

  it("ne propose la confirmation de remboursement que lorsqu'un remboursement attend", () => {
    const returned = part({ status: S.RETURNED, payment: { status: ShopOrderPaymentStatus.REFUND_PENDING } });
    const settled = part({ status: S.RETURNED, payment: { status: ShopOrderPaymentStatus.REFUNDED } });
    expect(availableActions([SHOP], returned, NOW)).toEqual([ShopOrderAction.CONFIRM_REFUND]);
    expect(availableActions([SHOP], settled, NOW)).toEqual([]);
    expect(checkAction(ShopOrderAction.CONFIRM_REFUND, [SHOP], settled, {}, NOW)).toBe("Aucun remboursement n'est en attente.");
  });
});

describe("targetStatus", () => {
  it("mène un litige à « retournée » sur remboursement et à « terminée » sur rejet", () => {
    const disputed = part({ status: S.DISPUTED });
    expect(targetStatus(ShopOrderAction.RESOLVE_DISPUTE, { resolution: "refund_full" }, disputed)).toBe(S.RETURNED);
    expect(targetStatus(ShopOrderAction.RESOLVE_DISPUTE, { resolution: "refund_partial" }, disputed)).toBe(S.RETURNED);
    expect(targetStatus(ShopOrderAction.RESOLVE_DISPUTE, { resolution: "rejected" }, disputed)).toBe(S.COMPLETED);
  });

  it("laisse le statut inchangé quand l'action ne le change pas", () => {
    const returned = part({ status: S.RETURNED });
    expect(targetStatus(ShopOrderAction.CONFIRM_REFUND, {}, returned)).toBe(S.RETURNED);
  });
});

describe("scheduleFor — délais", () => {
  const after = (date: Date | null) => (date ? date.getTime() - NOW.getTime() : null);

  it("donne 48 h à la boutique pour confirmer, avec un rappel à 24 h", () => {
    const schedule = scheduleFor(S.PENDING, NOW);
    expect(after(schedule.deadlineAt)).toBe(DEADLINES.confirm);
    expect(after(schedule.reminderAt)).toBe(24 * 60 * 60 * 1000);
  });

  it("donne 7 jours pour retirer et 7 jours pour demander un retour", () => {
    expect(after(scheduleFor(S.READY_FOR_PICKUP, NOW).deadlineAt)).toBe(7 * 24 * 60 * 60 * 1000);
    expect(after(scheduleFor(S.DELIVERED, NOW).deadlineAt)).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("n'a aucune échéance en préparation ni après une fin", () => {
    for (const status of [S.CONFIRMED, S.COMPLETED, S.CANCELLED, S.RETURNED]) {
      expect(scheduleFor(status, NOW)).toEqual({ deadlineAt: null, reminderAt: null });
    }
  });
});

describe("refundAmountFor", () => {
  const paid = { amount: 80_000, deliveryFee: 25_000 };

  it("rend tout pour une annulation, un refus ou une expiration", () => {
    for (const status of [S.CANCELLED, S.REFUSED, S.EXPIRED]) {
      expect(refundAmountFor(paid, status, {})).toBe(80_000);
    }
  });

  it("garde les frais de livraison quand l'échec vient du client", () => {
    expect(refundAmountFor(paid, S.FAILED, { reason: "customer_absent" })).toBe(55_000);
    expect(refundAmountFor(paid, S.FAILED, { reason: "parcel_refused" })).toBe(55_000);
    expect(refundAmountFor(paid, S.FAILED, { reason: "address_not_found" })).toBe(80_000);
  });

  it("rend le montant décidé sur un litige, jamais plus que la sous-commande", () => {
    expect(refundAmountFor(paid, S.RETURNED, { resolution: "refund_partial", refundAmount: 30_000 })).toBe(30_000);
    expect(refundAmountFor(paid, S.RETURNED, { resolution: "refund_partial", refundAmount: 99_000 })).toBe(80_000);
    expect(refundAmountFor(paid, S.RETURNED, {})).toBe(80_000);
  });

  it("ne rend rien sur une fin positive", () => {
    expect(refundAmountFor(paid, S.COMPLETED, {})).toBe(0);
  });
});

describe("allocateDiscount", () => {
  it("répartit au prorata, en GNF entiers, sans perdre un franc", () => {
    expect(allocateDiscount([30_000, 10_000], 4_000)).toEqual([3_000, 1_000]);
    const shares = allocateDiscount([1, 1, 1], 100);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
    expect(shares).toEqual([34, 33, 33]);
  });

  it("ne répartit rien sans réduction ou sans montant", () => {
    expect(allocateDiscount([10_000, 5_000], 0)).toEqual([0, 0]);
    expect(allocateDiscount([0, 0], 1_000)).toEqual([0, 0]);
  });
});

describe("orderStatusFrom — statut de la commande", () => {
  it("attend le paiement tant qu'une partie l'attend", () => {
    expect(orderStatusFrom([S.AWAITING_PAYMENT, S.AWAITING_PAYMENT])).toBe(OrderStatus.AWAITING_PAYMENT);
  });

  it("reste en cours tant qu'une partie n'est pas finie", () => {
    expect(orderStatusFrom([S.COMPLETED, S.SHIPPED])).toBe(OrderStatus.IN_PROGRESS);
    expect(orderStatusFrom([S.CANCELLED, S.RETURN_REQUESTED])).toBe(OrderStatus.IN_PROGRESS);
  });

  it("distingue terminée, partiellement terminée et annulée", () => {
    expect(orderStatusFrom([S.COMPLETED, S.COMPLETED])).toBe(OrderStatus.COMPLETED);
    expect(orderStatusFrom([S.COMPLETED, S.REFUSED])).toBe(OrderStatus.PARTIALLY_COMPLETED);
    expect(orderStatusFrom([S.EXPIRED, S.RETURNED])).toBe(OrderStatus.CANCELLED);
  });
});

describe("groupOf — onglets de la boutique", () => {
  it("range chaque statut visible dans un onglet", () => {
    expect(groupOf(S.PENDING)).toBe("todo");
    expect(groupOf(S.READY_FOR_PICKUP)).toBe("delivering");
    expect(groupOf(S.DISPUTED)).toBe("issues");
    expect(groupOf(S.RETURNED)).toBe("done");
  });

  it("n'en donne aucun à une commande pas encore payée", () => {
    expect(groupOf(S.AWAITING_PAYMENT)).toBeNull();
  });
});

describe("generatePickupCode", () => {
  it("produit 6 chiffres, zéros de tête compris", () => {
    for (let i = 0; i < 50; i += 1) expect(generatePickupCode()).toMatch(/^\d{6}$/);
  });
});
