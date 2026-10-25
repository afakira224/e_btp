import { describe, it, expect } from "vitest";
import { DeliveryMethod } from "../../../../src/models/delivery.model.js";
import { PaymentMethod } from "../../../../src/models/order.model.js";
import {
  ShopOrderActor,
  ShopOrderPaymentStatus,
  ShopOrderStatus,
} from "../../../../src/models/shopOrder.model.js";
import { ShopOrderAction } from "../../../../src/shared/helpers/shopOrder.workflow.js";
import {
  reasonLabel,
  toShopOrderResponseDto,
} from "../../../../src/shared/interfaces/ShopOrder.interfaces.js";
import { makeOrderItem, makeShopOrder, oid } from "../../../helpers/factories.js";

const { CLIENT, SHOP, ADMIN } = ShopOrderActor;
const S = ShopOrderStatus;
const A = ShopOrderAction;
const NOW = new Date("2026-10-25T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────
describe("toShopOrderResponseDto — ce que chacun voit", () => {
  const part = makeShopOrder({ pickupCode: "481516" });

  it("montre au client son code de remise, jamais les coordonnées figées du client", () => {
    const dto = toShopOrderResponseDto(part, "client", [CLIENT], NOW);

    expect(dto.pickupCode).toBe("481516");
    expect(dto.customer).toBeUndefined();
  });

  it("montre à la boutique les coordonnées du client pour livrer, jamais le code", () => {
    const dto = toShopOrderResponseDto(part, "shop", [SHOP], NOW);

    expect(dto.pickupCode).toBeUndefined();
    expect(dto.customer).toEqual({ nom: "Diallo", prenom: "Mamadou", telephone: "620000000" });
    expect(dto.shippingAddress).toMatchObject({ adresse: "Rue KA-020", ville: "Conakry" });
  });

  it("montre tout à l'administration, sauf le code", () => {
    const dto = toShopOrderResponseDto(part, "admin", [ADMIN], NOW);

    expect(dto.pickupCode).toBeUndefined();
    expect(dto.customer).toEqual(part.customer);
  });
});

// ─────────────────────────────────────────────
describe("toShopOrderResponseDto — champs", () => {
  it("convertit les identifiants et calcule les totaux des articles", () => {
    const productId = oid();
    const part = makeShopOrder({
      boutiqueNom: "Boutique Kaloum",
      reference: "CMD-42-1",
      items: [
        makeOrderItem({ productId, productName: "Ciment 50 kg", price: 90_000, quantity: 3 }),
        makeOrderItem({ productId: undefined, price: 1_000, quantity: 2, urlImages: undefined }),
      ],
      subtotal: 272_000,
      discountAmount: 2_000,
      deliveryFee: 25_000,
      amount: 295_000,
    });

    const dto = toShopOrderResponseDto(part, "client", [CLIENT], NOW);

    expect(dto).toMatchObject({
      id: part._id.toString(),
      orderId: part.orderId.toString(),
      reference: "CMD-42-1",
      boutique: { id: part.boutiqueId.toString(), nom: "Boutique Kaloum" },
      totalItems: 5,
      subtotal: 272_000,
      discountAmount: 2_000,
      deliveryFee: 25_000,
      amount: 295_000,
      createdAt: part.createdAt,
      updatedAt: part.updatedAt,
    });
    expect(dto.items[0]).toEqual({
      productBoutiqueId: part.items[0]!.productBoutiqueId.toString(),
      productId: productId.toString(),
      productName: "Ciment 50 kg",
      urlImages: [],
      price: 90_000,
      quantity: 3,
      lineTotal: 270_000,
    });
    expect(dto.items[1]).toMatchObject({ productId: undefined, urlImages: [], lineTotal: 2_000 });
  });

  it("expose la livraison figée sous forme de chaînes", () => {
    const part = makeShopOrder({ delivery: { method: DeliveryMethod.PICKUP, fee: 0, pickupAdresse: "Kaloum" } });

    const dto = toShopOrderResponseDto(part, "client", [CLIENT], NOW);

    expect(dto.delivery).toMatchObject({
      boutiqueId: part.boutiqueId.toString(),
      method: DeliveryMethod.PICKUP,
      fee: 0,
      pickupAdresse: "Kaloum",
    });
  });

  it("complète le paiement de valeurs nulles", () => {
    const part = makeShopOrder();
    part.payment = { method: PaymentMethod.ONLINE, status: ShopOrderPaymentStatus.PAID } as any;

    const dto = toShopOrderResponseDto(part, "client", [CLIENT], NOW);

    expect(dto.payment).toEqual({
      method: PaymentMethod.ONLINE,
      status: ShopOrderPaymentStatus.PAID,
      paidAt: null,
      refundedAmount: 0,
      refundedAt: null,
    });
  });

  it("libelle les motifs de l'historique, et garde tel quel un motif inconnu", () => {
    const changedAt = new Date("2026-10-24T10:00:00.000Z");
    const part = makeShopOrder({
      status: S.REFUSED,
      statusHistory: [
        { status: S.PENDING, changedAt, actor: CLIENT, note: "Commande passée" },
        { status: S.REFUSED, changedAt, actor: SHOP, reason: "out_of_stock" },
        { status: S.REFUSED, changedAt, actor: SHOP, reason: "motif_maison" },
      ],
    });

    const dto = toShopOrderResponseDto(part, "shop", [SHOP], NOW);

    expect(dto.statusHistory).toEqual([
      { status: S.PENDING, changedAt, actor: CLIENT, reason: undefined, reasonLabel: undefined, note: "Commande passée" },
      { status: S.REFUSED, changedAt, actor: SHOP, reason: "out_of_stock", reasonLabel: "Rupture de stock", note: undefined },
      { status: S.REFUSED, changedAt, actor: SHOP, reason: "motif_maison", reasonLabel: "motif_maison", note: undefined },
    ]);
  });

  it("renvoie un retour null, ou complet avec le libellé de son motif", () => {
    const requestedAt = new Date("2026-10-24T10:00:00.000Z");
    const withReturn = makeShopOrder({
      status: S.RETURN_REQUESTED,
      return: { reason: "damaged", details: "Écran fissuré", photos: undefined, requestedAt },
    });

    expect(toShopOrderResponseDto(makeShopOrder(), "client", [CLIENT], NOW).return).toBeNull();
    expect(toShopOrderResponseDto(withReturn, "client", [CLIENT], NOW).return).toEqual({
      reason: "damaged",
      reasonLabel: "Produit abîmé",
      details: "Écran fissuré",
      photos: [],
      requestedAt,
      shopResponse: undefined,
      respondedAt: null,
      resolution: undefined,
      resolutionNote: undefined,
      resolvedAt: null,
    });
  });

  it("renvoie une échéance nulle et zéro tentative par défaut", () => {
    const part = makeShopOrder();
    (part as any).deadlineAt = undefined;
    (part as any).deliveryAttempts = undefined;
    (part as any).statusHistory = undefined;

    const dto = toShopOrderResponseDto(part, "client", [CLIENT], NOW);

    expect(dto.deadlineAt).toBeNull();
    expect(dto.deliveryAttempts).toBe(0);
    expect(dto.statusHistory).toEqual([]);
  });
});

// ─────────────────────────────────────────────
describe("toShopOrderResponseDto — boutons disponibles", () => {
  const actionsOf = (over: Record<string, unknown>, actors: ShopOrderActor[]) =>
    toShopOrderResponseDto(makeShopOrder(over), "client", actors, NOW).availableActions;

  it("à confirmer : la boutique confirme ou refuse, le client annule, l'admin annule d'office", () => {
    expect(actionsOf({ status: S.PENDING }, [SHOP])).toEqual([A.CONFIRM, A.REFUSE]);
    expect(actionsOf({ status: S.PENDING }, [CLIENT])).toEqual([A.CANCEL]);
    expect(actionsOf({ status: S.PENDING }, [ADMIN])).toEqual([A.ADMIN_CANCEL]);
  });

  it("additionne les boutons des rôles qu'une personne cumule", () => {
    expect(actionsOf({ status: S.PENDING }, [CLIENT, SHOP])).toEqual([A.CONFIRM, A.REFUSE, A.CANCEL]);
  });

  it("en préparation : expédier une livraison, mettre au retrait un retrait", () => {
    expect(actionsOf({ status: S.CONFIRMED }, [SHOP])).toEqual([A.REFUSE, A.SHIP]);
    expect(
      actionsOf({ status: S.CONFIRMED, delivery: { method: DeliveryMethod.PICKUP, fee: 0 } }, [SHOP])
    ).toEqual([A.REFUSE, A.READY]);
  });

  it("livrée : le client demande un retour tant que le délai court", () => {
    expect(actionsOf({ status: S.DELIVERED, deadlineAt: new Date(NOW.getTime() + DAY) }, [CLIENT])).toEqual([
      A.REQUEST_RETURN,
    ]);
    expect(actionsOf({ status: S.DELIVERED, deadlineAt: new Date(NOW.getTime() - DAY) }, [CLIENT])).toEqual([]);
  });

  it("aucun bouton pour un simple lecteur ni pour une commande terminée", () => {
    expect(actionsOf({ status: S.PENDING }, [])).toEqual([]);
    expect(actionsOf({ status: S.COMPLETED }, [CLIENT])).toEqual([]);
  });

  it("retournée : déclarer le remboursement seulement s'il est en attente", () => {
    const pending = { status: S.RETURNED, payment: { status: ShopOrderPaymentStatus.REFUND_PENDING } };
    const done = { status: S.RETURNED, payment: { status: ShopOrderPaymentStatus.REFUNDED } };

    expect(actionsOf(pending, [SHOP])).toEqual([A.CONFIRM_REFUND]);
    expect(actionsOf(done, [SHOP])).toEqual([]);
  });
});

// ─────────────────────────────────────────────
describe("reasonLabel", () => {
  it("libelle les motifs de chaque liste", () => {
    expect(reasonLabel("changed_mind")).toBe("Changement d'avis");
    expect(reasonLabel("area_not_served")).toBe("Zone non desservie");
    expect(reasonLabel("customer_absent")).toBe("Client absent ou injoignable");
    expect(reasonLabel("not_received")).toBe("Commande non reçue");
  });

  it("garde un motif inconnu et ignore l'absence de motif", () => {
    expect(reasonLabel("inconnu")).toBe("inconnu");
    expect(reasonLabel(undefined)).toBeUndefined();
    expect(reasonLabel("")).toBeUndefined();
  });
});
