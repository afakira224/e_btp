import { describe, it, expect, vi, beforeEach } from "vitest";

// La migration importe la connexion : elle ne doit jamais s'ouvrir en test.
vi.mock("../../../src/db/db.js", () => ({ DB_CONNECT: vi.fn() }));

// Seuls les modèles Mongoose sont simulés : enums et constantes restent réels.
vi.mock("../../../src/models/order.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/order.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, Order: mockModel() };
});

vi.mock("../../../src/models/shopOrder.model.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/models/shopOrder.model.js")>();
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, ShopOrder: mockModel() };
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

import { DeliveryMethod } from "../../../src/models/delivery.model.js";
import {
  Order,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
} from "../../../src/models/order.model.js";
import {
  ShopOrder,
  ShopOrderActor,
  ShopOrderPaymentStatus,
  ShopOrderStatus,
} from "../../../src/models/shopOrder.model.js";
import { Shop } from "../../../src/models/boutique.model.js";
import { User } from "../../../src/models/user.model.js";
import { buildLegacyParts, migrateLegacyOrders } from "../../../src/migrations/shopOrders.migration.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { makeOrder, makeOrderItem, makeShop, makeUser, oid, UPDATED_AT } from "../../helpers/factories.js";

const OrderMock = Order as unknown as Record<string, any>;
const ShopOrderMock = ShopOrder as unknown as Record<string, any>;
const ShopMock = Shop as unknown as Record<string, any>;
const UserMock = User as unknown as Record<string, any>;

const S = ShopOrderStatus;
const NOW = new Date("2026-10-25T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const shopA = oid();
const shopB = oid();
const shopNames = new Map([
  [shopA.toString(), "Quincaillerie Kipé"],
  [shopB.toString(), "Boutique Kaloum"],
]);
const customer = { nom: "Diallo", prenom: "Mamadou", telephone: "620000000" };

/**
 * Commande ancienne : deux articles chez A (30 000 GNF), un chez B
 * (10 000 GNF), un article orphelin, 4 000 GNF de coupon, livraison à 25 000.
 */
const legacyOrder = (over: Record<string, unknown> = {}) => {
  const a1 = makeOrderItem({ boutiqueId: shopA, price: 10_000, quantity: 2 });
  const b1 = makeOrderItem({ boutiqueId: shopB, price: 5_000, quantity: 2 });
  const a2 = makeOrderItem({ boutiqueId: shopA, price: 10_000, quantity: 1 });
  const orphan = makeOrderItem({ boutiqueId: undefined });
  return makeOrder({
    reference: "CMD-42",
    status: OrderStatus.PENDING,
    items: [a1, b1, orphan, a2],
    subtotal: 41_000,
    discountAmount: 4_000,
    shippingFee: 25_000,
    deliveries: [],
    telephone: undefined,
    ...over,
  });
};

// ─────────────────────────────────────────────
describe("buildLegacyParts — découpage", () => {
  it("regroupe les articles par boutique, dans l'ordre d'apparition, sans les orphelins", () => {
    const order = legacyOrder();

    const parts = buildLegacyParts(order, customer, shopNames, NOW);

    expect(parts).toHaveLength(2);
    expect(parts[0]!.boutiqueId).toEqual(shopA);
    expect(parts[0]!.items).toEqual([order.items[0], order.items[3]]);
    expect(parts[1]!.boutiqueId).toEqual(shopB);
    expect(parts[1]!.items).toEqual([order.items[1]]);
  });

  it("numérote les références à la suite de celle de la commande", () => {
    const parts = buildLegacyParts(legacyOrder(), customer, shopNames, NOW);

    expect(parts.map((part) => part.reference)).toEqual(["CMD-42-1", "CMD-42-2"]);
  });

  it("ne crée rien pour une commande sans article rattaché à une boutique", () => {
    const order = legacyOrder({ items: [makeOrderItem({ boutiqueId: undefined })] });

    expect(buildLegacyParts(order, customer, shopNames, NOW)).toEqual([]);
  });

  it("répartit le coupon au prorata des sous-totaux", () => {
    const parts = buildLegacyParts(legacyOrder(), customer, shopNames, NOW);

    expect(parts.map((part) => part.subtotal)).toEqual([30_000, 10_000]);
    expect(parts.map((part) => part.discountAmount)).toEqual([3_000, 1_000]);
  });

  it("sans livraisons par boutique : les anciens frais vont à la première partie, en prix fixe", () => {
    const parts = buildLegacyParts(legacyOrder(), customer, shopNames, NOW);

    expect(parts[0]!.delivery).toEqual({
      boutiqueId: shopA,
      boutiqueNom: "Quincaillerie Kipé",
      method: DeliveryMethod.FLAT_RATE,
      fee: 25_000,
    });
    expect(parts[1]!.delivery).toMatchObject({ boutiqueNom: "Boutique Kaloum", method: DeliveryMethod.FLAT_RATE, fee: 0 });
    expect(parts.map((part) => part.deliveryFee)).toEqual([25_000, 0]);
    // montant = sous-total − part du coupon + livraison
    expect(parts.map((part) => part.amount)).toEqual([30_000 - 3_000 + 25_000, 10_000 - 1_000]);
    expect(parts.map((part) => part.boutiqueNom)).toEqual(["Quincaillerie Kipé", "Boutique Kaloum"]);
  });

  it("reprend la livraison figée de chaque boutique, sans adresse pour un retrait", () => {
    const shippingAddress = { telephone: "620000000", adresse: "Rue KA-020", ville: "Conakry", pays: "Guinée" };
    const pickup = { boutiqueId: shopA, boutiqueNom: "Kipé (figé)", method: DeliveryMethod.PICKUP, fee: 0, pickupAdresse: "Kipé" };
    const flat = { boutiqueId: shopB, boutiqueNom: "Kaloum (figé)", method: DeliveryMethod.FLAT_RATE, fee: 15_000 };
    const order = legacyOrder({ deliveries: [pickup, flat], shippingFee: 15_000, shippingAddress });

    const parts = buildLegacyParts(order, customer, shopNames, NOW);

    expect(parts[0]!.delivery).toBe(pickup);
    expect(parts[0]!.boutiqueNom).toBe("Kipé (figé)");
    expect(parts[0]).not.toHaveProperty("shippingAddress");
    expect(parts[1]!.delivery).toBe(flat);
    expect(parts[1]!.shippingAddress).toBe(shippingAddress);
    expect(parts.map((part) => part.amount)).toEqual([27_000, 9_000 + 15_000]);
  });

  it("fige les coordonnées du client, le téléphone de la commande en priorité", () => {
    const withPhone = buildLegacyParts(legacyOrder({ telephone: "621111111" }), customer, shopNames, NOW);
    const withoutPhone = buildLegacyParts(legacyOrder(), customer, shopNames, NOW);

    expect(withPhone[0]!.customer).toEqual({ nom: "Diallo", prenom: "Mamadou", telephone: "621111111" });
    expect(withoutPhone[0]!.customer).toEqual({ nom: "Diallo", prenom: "Mamadou", telephone: "620000000" });
  });

  it("nomme « Client » un client dont le compte a disparu", () => {
    const parts = buildLegacyParts(legacyOrder({ telephone: "621111111" }), null, shopNames, NOW);

    expect(parts[0]!.customer).toEqual({ nom: "Client", prenom: "", telephone: "621111111" });
  });

  it("garde la date de la commande, un code de remise à 6 chiffres et ses identifiants", () => {
    const order = legacyOrder();

    const [part] = buildLegacyParts(order, customer, shopNames, NOW);

    expect(part).toMatchObject({ orderId: order._id, userId: order.userId, createdAt: order.createdAt, updatedAt: NOW });
    expect(part!.pickupCode).toMatch(/^\d{6}$/);
  });
});

// ─────────────────────────────────────────────
describe("buildLegacyParts — anciens statuts", () => {
  const build = (status: string, over: Record<string, unknown> = {}) =>
    buildLegacyParts(legacyOrder({ status, ...over }), customer, shopNames, NOW);

  it("livrée : terminée, payée à la date de livraison, avec l'historique repris", () => {
    const placedAt = new Date("2026-03-01T10:00:00.000Z");
    const deliveredAt = new Date("2026-03-04T10:00:00.000Z");
    const adminId = oid();

    const [part] = build(OrderStatus.DELIVERED, {
      statusHistory: [
        { status: OrderStatus.PENDING, changedAt: placedAt, changedBy: adminId, note: "Commande passée" },
        { status: OrderStatus.IN_PROGRESS, changedAt: placedAt },
        { status: OrderStatus.DELIVERED, changedAt: deliveredAt },
      ],
    });

    expect(part!.status).toBe(S.COMPLETED);
    expect(part!.payment).toEqual({
      method: PaymentMethod.ON_DELIVERY,
      status: ShopOrderPaymentStatus.PAID,
      paidAt: deliveredAt,
      refundedAmount: 0,
    });
    expect(part!.statusHistory).toEqual([
      { status: S.PENDING, changedAt: placedAt, actor: ShopOrderActor.SYSTEM, changedBy: adminId, note: "Commande passée" },
      { status: S.DELIVERED, changedAt: deliveredAt, actor: ShopOrderActor.SYSTEM },
      { status: S.COMPLETED, changedAt: NOW, actor: ShopOrderActor.SYSTEM, note: "Clôturée à la migration des commandes" },
    ]);
    expect(part!.deliveryAttempts).toBe(1);
    expect(part!.deadlineAt).toBeNull();
    expect(part!.reminderAt).toBeNull();
  });

  it("livrée sans trace de livraison : payée à la dernière modification", () => {
    const [part] = build(OrderStatus.DELIVERED);

    expect((part!.payment as any).paidAt).toEqual(UPDATED_AT);
  });

  it("annulée : annulée, paiement annulé", () => {
    const [part] = build(OrderStatus.CANCELLED);

    expect(part!.status).toBe(S.CANCELLED);
    expect(part!.payment).toMatchObject({ status: ShopOrderPaymentStatus.VOID, paidAt: null });
    expect(part!.deliveryAttempts).toBe(0);
    expect(part!.deadlineAt).toBeNull();
  });

  it("en attente : à confirmer sous 48 h à compter de la migration, rappel à 24 h", () => {
    const [part] = build(OrderStatus.PENDING);

    expect(part!.status).toBe(S.PENDING);
    expect(part!.payment).toMatchObject({ status: ShopOrderPaymentStatus.UNPAID, paidAt: null });
    expect(part!.deadlineAt).toEqual(new Date(NOW.getTime() + 48 * HOUR));
    expect(part!.reminderAt).toEqual(new Date(NOW.getTime() + 24 * HOUR));
  });

  it("confirmée : en préparation, sans échéance", () => {
    const [part] = build(OrderStatus.CONFIRMED);

    expect(part!.status).toBe(S.CONFIRMED);
    expect(part!.deadlineAt).toBeNull();
  });

  it("expédiée : en livraison, une tentative, alerte à 7 jours", () => {
    const [part] = build(OrderStatus.SHIPPED);

    expect(part!.status).toBe(S.SHIPPED);
    expect(part!.deliveryAttempts).toBe(1);
    expect(part!.deadlineAt).toEqual(new Date(NOW.getTime() + 7 * DAY));
  });

  it("statut inconnu de l'ancien modèle : à confirmer", () => {
    const [part] = build(OrderStatus.IN_PROGRESS);

    expect(part!.status).toBe(S.PENDING);
  });
});

// ─────────────────────────────────────────────
describe("migrateLegacyOrders", () => {
  let inserted: Record<string, unknown>[][];

  beforeEach(() => {
    inserted = [];
    // `new ShopOrder(part)` : un document qui se valide et se convertit en objet.
    ShopOrderMock.mockImplementation(function (this: any, values: Record<string, unknown>) {
      Object.assign(this, values);
      this.validate = vi.fn(async () => undefined);
      this.toObject = vi.fn(() => ({ ...values }));
    });
    ShopOrderMock.collection = { insertMany: vi.fn(async (docs: Record<string, unknown>[]) => inserted.push(docs)) };
    OrderMock.collection = { updateOne: vi.fn(async () => ({ modifiedCount: 1 })) };
    ShopMock.find.mockReturnValue(mockQuery([makeShop({ _id: shopA, nom: "Quincaillerie Kipé" })]));
    UserMock.findById.mockReturnValue(mockQuery(makeUser(customer)));
  });

  const givenOrders = (...orders: any[]) => {
    OrderMock.find.mockReturnValue({
      cursor: () =>
        (async function* () {
          yield* orders;
        })(),
    });
  };

  it("découpe les commandes anciennes, ignore celles déjà découpées ou sans boutique", async () => {
    const done = legacyOrder();
    const empty = legacyOrder({ items: [makeOrderItem({ boutiqueId: undefined })] });
    const todo = legacyOrder({ status: OrderStatus.DELIVERED });
    ShopOrderMock.distinct.mockReturnValue(mockQuery([done._id]));
    givenOrders(done, empty, todo);

    const report = await migrateLegacyOrders(NOW);

    expect(report).toEqual({ orders: 1, parts: 2, skipped: 1 });
    expect(ShopOrderMock.distinct).toHaveBeenCalledWith("orderId");
    expect(ShopOrderMock.collection.insertMany).toHaveBeenCalledTimes(1);
    expect(inserted[0]!.map((part) => part.reference)).toEqual(["CMD-42-1", "CMD-42-2"]);
    expect(inserted[0]![0]).toMatchObject({ boutiqueNom: "Quincaillerie Kipé", customer: { nom: "Diallo" } });
    expect(OrderMock.collection.updateOne).toHaveBeenCalledWith(
      { _id: todo._id },
      {
        $set: {
          status: OrderStatus.COMPLETED,
          paymentMethod: PaymentMethod.ON_DELIVERY,
          paymentStatus: OrderPaymentStatus.ON_DELIVERY,
        },
      }
    );
  });

  it("valide chaque sous-commande avant de l'insérer", async () => {
    ShopOrderMock.distinct.mockReturnValue(mockQuery([]));
    givenOrders(legacyOrder());

    await migrateLegacyOrders(NOW);

    const documents = ShopOrderMock.mock.instances;
    expect(documents).toHaveLength(2);
    for (const document of documents) {
      expect(document.validate).toHaveBeenCalled();
      expect(document.toObject).toHaveBeenCalledWith({ depopulate: true });
    }
    // Commande en attente : chaque partie est à confirmer, la commande en cours.
    expect(OrderMock.collection.updateOne.mock.calls[0][1].$set.status).toBe(OrderStatus.IN_PROGRESS);
  });

  it("n'insère rien quand une sous-commande est invalide", async () => {
    ShopOrderMock.mockImplementation(function (this: any, values: Record<string, unknown>) {
      Object.assign(this, values);
      this.validate = vi.fn(async () => {
        throw new Error("pickupCode requis");
      });
    });
    ShopOrderMock.distinct.mockReturnValue(mockQuery([]));
    givenOrders(legacyOrder());

    await expect(migrateLegacyOrders(NOW)).rejects.toThrow("pickupCode requis");
    expect(ShopOrderMock.collection.insertMany).not.toHaveBeenCalled();
    expect(OrderMock.collection.updateOne).not.toHaveBeenCalled();
  });
});
