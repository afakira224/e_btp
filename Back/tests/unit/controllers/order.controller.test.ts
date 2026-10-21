import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

vi.mock("../../../src/models/order.model.js", async () => {
  // Seul le modèle Mongoose est simulé : enums et constantes restent réels.
  const actual = await import("../../../src/models/order.model.js");
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, Order: mockModel() };
});

vi.mock("../../../src/models/promotion.model.js", async () => {
  // Seul le modèle Mongoose est simulé : enums et constantes restent réels.
  const actual = await import("../../../src/models/promotion.model.js");
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { ...actual, Promotion: mockModel() };
});

vi.mock("../../../src/models/cart.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Cart: mockModel() };
});

vi.mock("../../../src/models/product.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Product: mockModel(), productBoutique: mockModel() };
});

vi.mock("../../../src/models/boutique.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Shop: mockModel() };
});

vi.mock("../../../src/models/famille.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Famille: mockModel() };
});

vi.mock("../../../src/models/categorie.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Categorie: mockModel() };
});

vi.mock("../../../src/models/sousCategorie.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { SousCategorie: mockModel() };
});

vi.mock("../../../src/models/address.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Address: mockModel() };
});

// Les emails partent dans une file asynchrone : on vérifie l'appel, pas l'envoi.
vi.mock("../../../src/shared/helpers/mail.helper.js", () => ({
  sendOrderConfirmationMail: vi.fn(() => 1),
  sendOrderStatusMail: vi.fn(() => 2),
}));

vi.mock("../../../src/models/user.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { User: mockModel() };
});

vi.mock("express-validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("express-validator")>();
  return {
    ...actual,
    validationResult: vi.fn(() => ({ isEmpty: () => true, array: () => [] })),
  };
});

import { validationResult } from "express-validator";
import { DeliveryMethod, Order, OrderStatus } from "../../../src/models/order.model.js";
import { Promotion, PromotionScope } from "../../../src/models/promotion.model.js";
import { Cart } from "../../../src/models/cart.model.js";
import { Product, productBoutique } from "../../../src/models/product.model.js";
import { Shop } from "../../../src/models/boutique.model.js";
import { Famille } from "../../../src/models/famille.model.js";
import { Categorie } from "../../../src/models/categorie.model.js";
import { SousCategorie } from "../../../src/models/sousCategorie.model.js";
import { User } from "../../../src/models/user.model.js";
import { Address } from "../../../src/models/address.model.js";
import {
  sendOrderConfirmationMail,
  sendOrderStatusMail,
} from "../../../src/shared/helpers/mail.helper.js";
import {
  createOrder,
  deleteOrder,
  getOrderById,
  getOrders,
  updateOrderStatus,
} from "../../../src/controllers/order.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse, mockSession } from "../../helpers/express.mock.js";
import {
  makeAddress,
  makeCart,
  makeCartItem,
  makeOrder,
  makeOrderItem,
  makeProduct,
  makeProductBoutique,
  makePromotion,
  makeUser,
  oid,
} from "../../helpers/factories.js";

const OrderMock = Order as unknown as Record<string, any>;
const PromotionMock = Promotion as unknown as Record<string, any>;
const CartMock = Cart as unknown as Record<string, any>;
const PbMock = productBoutique as unknown as Record<string, any>;
const ProductMock = Product as unknown as Record<string, any>;
const ShopMock = Shop as unknown as Record<string, any>;
const FamilleMock = Famille as unknown as Record<string, any>;
const CategorieMock = Categorie as unknown as Record<string, any>;
const SousCategorieMock = SousCategorie as unknown as Record<string, any>;
const UserMock = User as unknown as Record<string, any>;
const AddressMock = Address as unknown as Record<string, any>;

let session: ReturnType<typeof mockSession>;

const failValidation = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({
    isEmpty: () => false,
    array: () => messages.map((msg) => ({ msg })),
  } as any);
};

beforeEach(() => {
  session = mockSession();
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);

  UserMock.findById.mockReturnValue(mockQuery(makeUser()));
  CartMock.findOne.mockReturnValue(mockQuery(null));
  PbMock.find.mockReturnValue(mockQuery([]));
  PbMock.findById.mockReturnValue(mockQuery(null));
  ProductMock.find.mockReturnValue(mockQuery([]));
  ShopMock.find.mockReturnValue(mockQuery([]));
  FamilleMock.find.mockReturnValue(mockQuery([]));
  CategorieMock.find.mockReturnValue(mockQuery([]));
  SousCategorieMock.find.mockReturnValue(mockQuery([]));
  PromotionMock.findOne.mockReturnValue(mockQuery(null));
  OrderMock.find.mockReturnValue(mockQuery([]));
  OrderMock.findById.mockReturnValue(mockQuery(null));
  OrderMock.countDocuments.mockReturnValue(mockQuery(0));
  OrderMock.create.mockImplementation(async (docs: any[]) => [makeOrder(docs[0])]);
  AddressMock.findById.mockReturnValue(mockQuery(null));
});

/** Prépare un panier d'un article dont le stock est suffisant. */
const setupCheckout = (
  opts: { stock?: number; quantity?: number; price?: number } = {}
) => {
  const { stock = 10, quantity = 2, price = 10_000 } = opts;

  const product = makeProduct({ name: "Galaxy A15" });
  const pb = makeProductBoutique({ productId: product._id, stock });
  const item = makeCartItem({ productBoutiqueId: pb._id, quantity, price });
  const cart = makeCart({ items: [item], amount: price * quantity });

  CartMock.findOne.mockReturnValue(mockQuery(cart));
  PbMock.find.mockReturnValue(mockQuery([pb]));
  ProductMock.find.mockReturnValue(mockQuery([product]));

  return { product, pb, cart, item };
};

/** Corps de checkout valide : une adresse est requise hors retrait en boutique. */
const checkout = (over: Record<string, unknown> = {}) => ({
  adresse: "Conakry, Ratoma",
  telephone: "620000000",
  ...over,
});

// ─────────────────────────────────────────────
describe("createOrder", () => {
  it("renvoie 422 et annule la transaction quand la validation échoue", async () => {
    failValidation(["Identifiant utilisateur invalide."]);
    const res = mockResponse();

    await createOrder(mockRequest(), res);

    expect(res.statusCode).toBe(422);
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(OrderMock.create).not.toHaveBeenCalled();
  });

  it("renvoie 404 quand l'utilisateur est introuvable", async () => {
    UserMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await createOrder(mockRequest({ params: { userId: oid().toString() }, body: checkout() }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Utilisateur introuvable");
  });

  it("renvoie 400 quand le panier est vide", async () => {
    CartMock.findOne.mockReturnValue(mockQuery(makeCart({ items: [] })));
    const res = mockResponse();

    await createOrder(mockRequest({ params: { userId: oid().toString() }, body: checkout() }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Le panier est vide.");
  });

  it("renvoie 400 quand le panier n'existe pas", async () => {
    CartMock.findOne.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await createOrder(mockRequest({ params: { userId: oid().toString() }, body: checkout() }), res);

    expect(res.statusCode).toBe(400);
  });

  it("renvoie 400 quand un produit du panier n'est plus disponible", async () => {
    const cart = makeCart({ items: [makeCartItem()] });
    CartMock.findOne.mockReturnValue(mockQuery(cart));
    PbMock.find.mockReturnValue(mockQuery([])); // le produit a disparu
    const res = mockResponse();

    await createOrder(mockRequest({ params: { userId: oid().toString() }, body: checkout() }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain("n'est plus disponible");
  });

  it("renvoie 400 quand le stock est insuffisant", async () => {
    setupCheckout({ stock: 1, quantity: 3 });
    const res = mockResponse();

    await createOrder(mockRequest({ params: { userId: oid().toString() }, body: checkout() }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Stock insuffisant pour un produit (disponible : 1).");
    expect(OrderMock.create).not.toHaveBeenCalled();
  });

  it("décrémente le stock des produits commandés", async () => {
    const { pb } = setupCheckout({ stock: 10, quantity: 3 });

    await createOrder(mockRequest({ params: { userId: oid().toString() }, body: checkout() }), mockResponse());

    expect(pb.stock).toBe(7);
    expect(pb.save).toHaveBeenCalledWith({ session });
  });

  it("fige le prix, le nom et les images du produit dans la commande", async () => {
    setupCheckout({ quantity: 2, price: 10_000 });

    await createOrder(mockRequest({ params: { userId: oid().toString() }, body: checkout() }), mockResponse());

    const created = OrderMock.create.mock.calls[0]![0][0];
    expect(created.items[0].price).toBe(10_000);
    expect(created.items[0].quantity).toBe(2);
    expect(created.items[0].productName).toBe("Galaxy A15");
    expect(created.subtotal).toBe(20_000);
    // 20 000 d'articles + 25 000 de livraison standard
    expect(created.shippingFee).toBe(25_000);
    expect(created.amount).toBe(45_000);
    expect(created.status).toBe(OrderStatus.PENDING);
  });

  it("génère une référence préfixée CMD-", async () => {
    setupCheckout();

    await createOrder(mockRequest({ params: { userId: oid().toString() }, body: checkout() }), mockResponse());

    expect(OrderMock.create.mock.calls[0]![0][0].reference).toMatch(/^CMD-\d+-\d+$/);
  });

  it("vide le panier après le passage de commande", async () => {
    const { cart } = setupCheckout();

    await createOrder(mockRequest({ params: { userId: oid().toString() }, body: checkout() }), mockResponse());

    expect(cart.items).toHaveLength(0);
    expect(cart.amount).toBe(0);
    expect(cart.save).toHaveBeenCalledWith({ session });
  });

  it("renvoie 201 et valide la transaction", async () => {
    setupCheckout();
    const res = mockResponse();

    await createOrder(
      mockRequest({
        params: { userId: oid().toString() },
        body: { telephone: "620000000", adresse: "Conakry" },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  describe("application d'un coupon", () => {
    const activePromo = (over: Record<string, unknown> = {}) =>
      makePromotion({
        code: "RENTREE10",
        startDate: new Date("2000-01-01"),
        endDate: new Date("2999-01-01"),
        ...over,
      });

    it("renvoie 404 quand le coupon est introuvable", async () => {
      setupCheckout();
      PromotionMock.findOne.mockReturnValue(mockQuery(null));
      const res = mockResponse();

      await createOrder(
        mockRequest({ params: { userId: oid().toString() }, body: checkout({ code: "INCONNU" }) }),
        res
      );

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe("Coupon introuvable");
      expect(OrderMock.create).not.toHaveBeenCalled();
    });

    it("renvoie 400 quand le coupon est expiré", async () => {
      setupCheckout();
      PromotionMock.findOne.mockReturnValue(
        mockQuery(activePromo({ endDate: new Date("2001-01-01") }))
      );
      const res = mockResponse();

      await createOrder(
        mockRequest({ params: { userId: oid().toString() }, body: checkout({ code: "RENTREE10" }) }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain("n'est pas valide");
    });

    it("renvoie 400 quand le montant minimum n'est pas atteint", async () => {
      setupCheckout({ quantity: 1, price: 10_000 });
      PromotionMock.findOne.mockReturnValue(mockQuery(activePromo({ minAmount: 50_000 })));
      const res = mockResponse();

      await createOrder(
        mockRequest({ params: { userId: oid().toString() }, body: checkout({ code: "RENTREE10" }) }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain("Montant minimum non atteint");
    });

    it("applique la réduction et incrémente le compteur d'utilisation", async () => {
      setupCheckout({ quantity: 2, price: 10_000 }); // sous-total 20 000
      const promo = activePromo({ discountValue: 10, usedCount: 4 });
      PromotionMock.findOne.mockReturnValue(mockQuery(promo));

      await createOrder(
        mockRequest({ params: { userId: oid().toString() }, body: checkout({ code: " rentree10 " }) }),
        mockResponse()
      );

      expect(PromotionMock.findOne).toHaveBeenCalledWith({ code: "RENTREE10" });
      expect(promo.usedCount).toBe(5);
      expect(promo.save).toHaveBeenCalledWith({ session });

      const created = OrderMock.create.mock.calls[0]![0][0];
      expect(created.subtotal).toBe(20_000);
      expect(created.discountAmount).toBe(2_000);
      // La réduction porte sur les articles, la livraison s'ajoute ensuite.
      expect(created.amount).toBe(20_000 - 2_000 + 25_000);
      expect(created.promotionCode).toBe("RENTREE10");
    });

    it("renvoie 400 quand aucun article n'est éligible", async () => {
      setupCheckout();
      PromotionMock.findOne.mockReturnValue(
        mockQuery(
          activePromo({
            scope: PromotionScope.PRODUCT_BOUTIQUE,
            productBoutiqueIds: [oid()],
          })
        )
      );
      const res = mockResponse();

      await createOrder(
        mockRequest({ params: { userId: oid().toString() }, body: checkout({ code: "RENTREE10" }) }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe("Aucun article de la commande n'est éligible à ce coupon.");
    });

    it("ne consulte aucune promotion quand aucun code n'est fourni", async () => {
      setupCheckout();

      await createOrder(
        mockRequest({ params: { userId: oid().toString() }, body: checkout() }),
        mockResponse()
      );

      expect(PromotionMock.findOne).not.toHaveBeenCalled();
      expect(OrderMock.create.mock.calls[0]![0][0].discountAmount).toBe(0);
      expect(OrderMock.create.mock.calls[0]![0][0].promotionCode).toBeNull();
    });
  });

  it("renvoie 500 et annule la transaction en cas d'erreur", async () => {
    UserMock.findById.mockImplementation(() => {
      throw new Error("réplique indisponible");
    });
    const res = mockResponse();

    await createOrder(mockRequest({ params: { userId: oid().toString() }, body: checkout() }), res);

    expect(res.statusCode).toBe(500);
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("getOrders", () => {
  it("pagine avec les valeurs par défaut", async () => {
    const query = mockQuery([]);
    OrderMock.find.mockReturnValue(query);
    const res = mockResponse();

    await getOrders(mockRequest(), res);

    expect(query.skip).toHaveBeenCalledWith(0);
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(res.body.data.page).toBe(1);
  });

  it("filtre par utilisateur et par statut", async () => {
    const userId = oid().toString();

    await getOrders(
      mockRequest({ query: { userId, status: OrderStatus.SHIPPED } }),
      mockResponse()
    );

    expect(OrderMock.find).toHaveBeenCalledWith({ userId, status: OrderStatus.SHIPPED });
  });

  it("plafonne la taille de page à 100", async () => {
    const query = mockQuery([]);
    OrderMock.find.mockReturnValue(query);

    await getOrders(mockRequest({ query: { limit: "1000" } }), mockResponse());

    expect(query.limit).toHaveBeenCalledWith(100);
  });

  it("calcule le nombre de pages", async () => {
    OrderMock.countDocuments.mockReturnValue(mockQuery(45));
    const res = mockResponse();

    await getOrders(mockRequest({ query: { limit: "20" } }), res);

    expect(res.body.data.total).toBe(45);
    expect(res.body.data.totalPages).toBe(3);
  });

  it("renvoie 500 en cas d'erreur", async () => {
    OrderMock.find.mockImplementation(() => {
      throw new Error("panne");
    });
    const res = mockResponse();

    await getOrders(mockRequest(), res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
describe("getOrderById", () => {
  it("renvoie la commande enrichie", async () => {
    const pb = makeProductBoutique();
    const order = makeOrder({
      reference: "CMD-1",
      items: [makeOrderItem({ productBoutiqueId: pb._id, price: 1_000, quantity: 2 })],
    });
    OrderMock.findById.mockReturnValue(mockQuery(order));
    PbMock.find.mockReturnValue(mockQuery([pb]));
    const res = mockResponse();

    await getOrderById(mockRequest({ params: { id: order._id.toString() } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.reference).toBe("CMD-1");
    expect(res.body.data.totalItems).toBe(2);
    expect(res.body.data.items[0].lineTotal).toBe(2_000);
  });

  it("renvoie 404 quand la commande est introuvable", async () => {
    OrderMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await getOrderById(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Commande non trouvée");
  });
});

// ─────────────────────────────────────────────
describe("updateOrderStatus", () => {
  it("renvoie 404 quand la commande est introuvable", async () => {
    OrderMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await updateOrderStatus(
      mockRequest({ params: { id: oid().toString() }, body: { status: OrderStatus.SHIPPED } }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it("refuse une transition vers le statut courant", async () => {
    const order = makeOrder({ status: OrderStatus.PENDING });
    OrderMock.findById.mockReturnValue(mockQuery(order));
    const res = mockResponse();

    await updateOrderStatus(
      mockRequest({ params: { id: order._id.toString() }, body: { status: OrderStatus.PENDING } }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('La commande est déjà au statut "pending".');
    expect(order.save).not.toHaveBeenCalled();
  });

  it("met à jour un statut non terminal sans toucher au stock", async () => {
    const order = makeOrder({ status: OrderStatus.PENDING, items: [makeOrderItem()] });
    OrderMock.findById.mockReturnValue(mockQuery(order));
    const res = mockResponse();

    await updateOrderStatus(
      mockRequest({ params: { id: order._id.toString() }, body: { status: OrderStatus.CONFIRMED } }),
      res
    );

    expect(order.status).toBe(OrderStatus.CONFIRMED);
    expect(order.save).toHaveBeenCalledWith({ session });
    expect(PbMock.findById).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("restitue le stock à l'annulation", async () => {
    const pb = makeProductBoutique({ stock: 5 });
    const order = makeOrder({
      status: OrderStatus.CONFIRMED,
      items: [makeOrderItem({ productBoutiqueId: pb._id, quantity: 3 })],
    });
    OrderMock.findById.mockReturnValue(mockQuery(order));
    PbMock.findById.mockReturnValue(mockQuery(pb));
    PbMock.find.mockReturnValue(mockQuery([pb]));

    await updateOrderStatus(
      mockRequest({ params: { id: order._id.toString() }, body: { status: OrderStatus.CANCELLED } }),
      mockResponse()
    );

    expect(pb.stock).toBe(8);
    expect(pb.save).toHaveBeenCalledWith({ session });
    expect(order.status).toBe(OrderStatus.CANCELLED);
  });

  it("tolère un produit supprimé lors de la restitution du stock", async () => {
    const order = makeOrder({
      status: OrderStatus.CONFIRMED,
      items: [makeOrderItem({ quantity: 2 })],
    });
    OrderMock.findById.mockReturnValue(mockQuery(order));
    PbMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await updateOrderStatus(
      mockRequest({ params: { id: order._id.toString() }, body: { status: OrderStatus.CANCELLED } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(order.status).toBe(OrderStatus.CANCELLED);
  });

  it("restitue l'utilisation du coupon à l'annulation", async () => {
    const promo = makePromotion({ code: "RENTREE10", usedCount: 3 });
    const order = makeOrder({
      status: OrderStatus.CONFIRMED,
      promotionCode: "RENTREE10",
      items: [makeOrderItem()],
    });
    OrderMock.findById.mockReturnValue(mockQuery(order));
    PromotionMock.findOne.mockReturnValue(mockQuery(promo));

    await updateOrderStatus(
      mockRequest({ params: { id: order._id.toString() }, body: { status: OrderStatus.CANCELLED } }),
      mockResponse()
    );

    expect(PromotionMock.findOne).toHaveBeenCalledWith({ code: "RENTREE10" });
    expect(promo.usedCount).toBe(2);
    expect(promo.save).toHaveBeenCalledWith({ session });
  });

  it("ne descend pas le compteur d'utilisation en dessous de zéro", async () => {
    const promo = makePromotion({ code: "RENTREE10", usedCount: 0 });
    const order = makeOrder({
      status: OrderStatus.CONFIRMED,
      promotionCode: "RENTREE10",
      items: [],
    });
    OrderMock.findById.mockReturnValue(mockQuery(order));
    PromotionMock.findOne.mockReturnValue(mockQuery(promo));

    await updateOrderStatus(
      mockRequest({ params: { id: order._id.toString() }, body: { status: OrderStatus.CANCELLED } }),
      mockResponse()
    );

    expect(promo.usedCount).toBe(0);
    expect(promo.save).not.toHaveBeenCalled();
  });

  it("ne cherche aucun coupon quand la commande n'en a pas", async () => {
    const order = makeOrder({ status: OrderStatus.CONFIRMED, promotionCode: null, items: [] });
    OrderMock.findById.mockReturnValue(mockQuery(order));

    await updateOrderStatus(
      mockRequest({ params: { id: order._id.toString() }, body: { status: OrderStatus.CANCELLED } }),
      mockResponse()
    );

    expect(PromotionMock.findOne).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("deleteOrder", () => {
  it("effectue une suppression logique", async () => {
    const order = makeOrder();
    OrderMock.findById.mockReturnValue(mockQuery(order));
    const res = mockResponse();

    await deleteOrder(mockRequest({ params: { id: order._id.toString() } }), res);

    expect(order.deletedAt).toBeInstanceOf(Date);
    expect(order.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toBeNull();
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it("renvoie 404 quand la commande est introuvable", async () => {
    OrderMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await deleteOrder(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
//  Frais de livraison et adresse
// ─────────────────────────────────────────────
describe("createOrder — livraison", () => {
  it.each([
    [DeliveryMethod.PICKUP, 0],
    [DeliveryMethod.STANDARD, 25_000],
    [DeliveryMethod.EXPRESS, 50_000],
  ])("applique les frais du mode %s", async (deliveryMethod, expectedFee) => {
    setupCheckout({ quantity: 1, price: 10_000 });

    await createOrder(
      mockRequest({
        params: { userId: oid().toString() },
        body: checkout({ deliveryMethod }),
      }),
      mockResponse()
    );

    const created = OrderMock.create.mock.calls[0]![0][0];
    expect(created.deliveryMethod).toBe(deliveryMethod);
    expect(created.shippingFee).toBe(expectedFee);
    expect(created.amount).toBe(10_000 + expectedFee);
  });

  it("utilise la livraison standard par défaut", async () => {
    setupCheckout({ quantity: 1, price: 5_000 });

    await createOrder(
      mockRequest({ params: { userId: oid().toString() }, body: checkout() }),
      mockResponse()
    );

    expect(OrderMock.create.mock.calls[0]![0][0].deliveryMethod).toBe(DeliveryMethod.STANDARD);
  });

  it("exige une adresse pour une livraison à domicile", async () => {
    setupCheckout();
    const res = mockResponse();

    await createOrder(
      mockRequest({
        params: { userId: oid().toString() },
        body: { deliveryMethod: DeliveryMethod.STANDARD },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Une adresse de livraison est requise (addressId ou adresse).");
    expect(OrderMock.create).not.toHaveBeenCalled();
  });

  it("n'exige pas d'adresse pour un retrait en boutique", async () => {
    setupCheckout();
    const res = mockResponse();

    await createOrder(
      mockRequest({
        params: { userId: oid().toString() },
        body: { deliveryMethod: DeliveryMethod.PICKUP },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    expect(OrderMock.create.mock.calls[0]![0][0].shippingFee).toBe(0);
  });

  it("fige une copie de l'adresse enregistrée dans la commande", async () => {
    const userId = oid();
    const address = makeAddress({
      userId,
      destinataire: "Fatoumata Camara",
      adresse: "Rue DI-482",
      ville: "Conakry",
      commune: "Dixinn",
    });
    setupCheckout();
    AddressMock.findById.mockReturnValue(mockQuery(address));
    const res = mockResponse();

    await createOrder(
      mockRequest({
        params: { userId: userId.toString() },
        body: { addressId: address._id.toString() },
      }),
      res
    );

    expect(res.statusCode).toBe(201);
    const created = OrderMock.create.mock.calls[0]![0][0];
    expect(created.addressId).toBe(address._id);
    expect(created.shippingAddress).toEqual({
      destinataire: "Fatoumata Camara",
      telephone: address.telephone,
      adresse: "Rue DI-482",
      ville: "Conakry",
      commune: "Dixinn",
      pays: "Guinée",
    });
  });

  it("renvoie 404 quand l'adresse référencée n'existe pas", async () => {
    setupCheckout();
    AddressMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await createOrder(
      mockRequest({
        params: { userId: oid().toString() },
        body: { addressId: oid().toString() },
      }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Adresse de livraison introuvable");
  });

  it("renvoie 403 quand l'adresse appartient à quelqu'un d'autre", async () => {
    setupCheckout();
    AddressMock.findById.mockReturnValue(mockQuery(makeAddress({ userId: oid() })));
    const res = mockResponse();

    await createOrder(
      mockRequest({
        params: { userId: oid().toString() },
        body: { addressId: oid().toString() },
      }),
      res
    );

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Cette adresse ne vous appartient pas.");
    expect(OrderMock.create).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
//  Historique de statut
// ─────────────────────────────────────────────
describe("historique de statut", () => {
  it("initialise l'historique à la création de la commande", async () => {
    const userId = oid().toString();
    setupCheckout();

    await createOrder(mockRequest({ params: { userId }, body: checkout() }), mockResponse());

    const history = OrderMock.create.mock.calls[0]![0][0].statusHistory;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      status: OrderStatus.PENDING,
      changedBy: userId,
      note: "Commande créée",
    });
    expect(history[0].changedAt).toBeInstanceOf(Date);
  });

  it("ajoute une entrée à chaque changement de statut", async () => {
    const order = makeOrder({ status: OrderStatus.PENDING, items: [], statusHistory: [] });
    OrderMock.findById.mockReturnValue(mockQuery(order));

    await updateOrderStatus(
      mockRequest({
        params: { id: order._id.toString() },
        body: { status: OrderStatus.CONFIRMED },
      }),
      mockResponse()
    );

    expect(order.statusHistory).toHaveLength(1);
    expect(order.statusHistory[0]!.status).toBe(OrderStatus.CONFIRMED);
    expect(order.statusHistory[0]!.changedAt).toBeInstanceOf(Date);
  });

  it("conserve la note et l'auteur du changement", async () => {
    const auteur = oid().toString();
    const order = makeOrder({ status: OrderStatus.CONFIRMED, items: [], statusHistory: [] });
    OrderMock.findById.mockReturnValue(mockQuery(order));

    const req = mockRequest({
      params: { id: order._id.toString() },
      body: { status: OrderStatus.SHIPPED, note: "Suivi GN-4471" },
    });
    (req as any).user = { id: auteur, entityType: "admin" };

    await updateOrderStatus(req, mockResponse());

    expect(order.statusHistory[0]!.note).toBe("Suivi GN-4471");
    expect(order.statusHistory[0]!.changedBy?.toString()).toBe(auteur);
  });

  it("empile les transitions successives", async () => {
    const order = makeOrder({ status: OrderStatus.PENDING, items: [], statusHistory: [] });
    OrderMock.findById.mockReturnValue(mockQuery(order));

    await updateOrderStatus(
      mockRequest({ params: { id: "x" }, body: { status: OrderStatus.CONFIRMED } }),
      mockResponse()
    );
    await updateOrderStatus(
      mockRequest({ params: { id: "x" }, body: { status: OrderStatus.SHIPPED } }),
      mockResponse()
    );

    expect(order.statusHistory.map((h) => h.status)).toEqual([
      OrderStatus.CONFIRMED,
      OrderStatus.SHIPPED,
    ]);
  });

  it("expose l'historique dans le DTO de réponse", async () => {
    const order = makeOrder({
      status: OrderStatus.SHIPPED,
      items: [],
      statusHistory: [
        { status: OrderStatus.PENDING, changedAt: new Date("2026-01-01") },
        { status: OrderStatus.CONFIRMED, changedAt: new Date("2026-01-02") },
      ],
    });
    OrderMock.findById.mockReturnValue(mockQuery(order));
    const res = mockResponse();

    await getOrderById(mockRequest({ params: { id: order._id.toString() } }), res);

    expect(res.body.data.statusHistory).toHaveLength(2);
    expect(res.body.data.statusHistory[0].status).toBe(OrderStatus.PENDING);
  });
});

// ─────────────────────────────────────────────
//  Transitions de statut autorisées
// ─────────────────────────────────────────────
describe("transitions de statut", () => {
  const transition = async (from: OrderStatus, to: OrderStatus) => {
    const order = makeOrder({ status: from, items: [], statusHistory: [] });
    OrderMock.findById.mockReturnValue(mockQuery(order));
    const res = mockResponse();

    await updateOrderStatus(
      mockRequest({ params: { id: order._id.toString() }, body: { status: to } }),
      res
    );

    return { order, res };
  };

  it.each([
    [OrderStatus.PENDING, OrderStatus.CONFIRMED],
    [OrderStatus.PENDING, OrderStatus.CANCELLED],
    [OrderStatus.CONFIRMED, OrderStatus.SHIPPED],
    [OrderStatus.SHIPPED, OrderStatus.DELIVERED],
  ])("autorise %s vers %s", async (from, to) => {
    const { order, res } = await transition(from, to);

    expect(res.statusCode).toBe(200);
    expect(order.status).toBe(to);
  });

  it.each([
    [OrderStatus.PENDING, OrderStatus.SHIPPED],
    [OrderStatus.PENDING, OrderStatus.DELIVERED],
    [OrderStatus.CONFIRMED, OrderStatus.DELIVERED],
  ])("refuse le saut %s vers %s", async (from, to) => {
    const { order, res } = await transition(from, to);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain("Transition invalide");
    expect(order.status).toBe(from);
    expect(order.save).not.toHaveBeenCalled();
  });

  it.each([
    [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
    [OrderStatus.CANCELLED, OrderStatus.CONFIRMED],
  ])("refuse toute sortie du statut terminal %s", async (from, to) => {
    const { res } = await transition(from, to);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain("statut terminal");
  });
});

// ─────────────────────────────────────────────
//  Notifications par email
// ─────────────────────────────────────────────
describe("emails de commande", () => {
  it("envoie l'email de confirmation après le checkout", async () => {
    const client = makeUser({ email: "client@example.com", nom: "Diallo" });
    UserMock.findById.mockReturnValue(mockQuery(client));
    setupCheckout({ quantity: 2, price: 10_000 });

    await createOrder(
      mockRequest({ params: { userId: oid().toString() }, body: checkout() }),
      mockResponse()
    );

    expect(sendOrderConfirmationMail).toHaveBeenCalledOnce();
    const [user, order] = vi.mocked(sendOrderConfirmationMail).mock.calls[0]!;
    expect(user.email).toBe("client@example.com");
    expect(order.reference).toMatch(/^CMD-/);
    expect(order.subtotal).toBe(20_000);
    expect(order.shippingFee).toBe(25_000);
    expect(order.amount).toBe(45_000);
    expect(order.items[0]!.productName).toBe("Galaxy A15");
  });

  it("n'envoie aucun email quand le checkout échoue", async () => {
    setupCheckout({ stock: 0, quantity: 5 });

    await createOrder(
      mockRequest({ params: { userId: oid().toString() }, body: checkout() }),
      mockResponse()
    );

    expect(sendOrderConfirmationMail).not.toHaveBeenCalled();
  });

  it("ne fait pas échouer la commande si l'email part en erreur", async () => {
    vi.mocked(sendOrderConfirmationMail).mockImplementationOnce(() => {
      throw new Error("SMTP indisponible");
    });
    setupCheckout();
    const res = mockResponse();

    await createOrder(
      mockRequest({ params: { userId: oid().toString() }, body: checkout() }),
      res
    );

    expect(res.statusCode).toBe(201);
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it("notifie le client à chaque changement de statut", async () => {
    const client = makeUser({ email: "client@example.com" });
    const order = makeOrder({ status: OrderStatus.PENDING, items: [], statusHistory: [] });
    OrderMock.findById.mockReturnValue(mockQuery(order));
    UserMock.findById.mockReturnValue(mockQuery(client));

    await updateOrderStatus(
      mockRequest({
        params: { id: order._id.toString() },
        body: { status: OrderStatus.CONFIRMED },
      }),
      mockResponse()
    );

    expect(sendOrderStatusMail).toHaveBeenCalledWith(
      expect.objectContaining({ email: "client@example.com" }),
      order.reference,
      OrderStatus.CONFIRMED
    );
  });

  it("n'envoie aucun email sur une transition refusée", async () => {
    const order = makeOrder({ status: OrderStatus.DELIVERED, items: [], statusHistory: [] });
    OrderMock.findById.mockReturnValue(mockQuery(order));

    await updateOrderStatus(
      mockRequest({
        params: { id: order._id.toString() },
        body: { status: OrderStatus.PENDING },
      }),
      mockResponse()
    );

    expect(sendOrderStatusMail).not.toHaveBeenCalled();
  });
});
