import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// ─── Mocks de modules ────────────────────────────────────────────────
// Les modèles Mongoose sont remplacés : aucun accès base de données.
vi.mock("../../../src/models/cart.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Cart: mockModel() };
});

vi.mock("../../../src/models/product.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Product: mockModel(), productBoutique: mockModel() };
});

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
import { Cart } from "../../../src/models/cart.model.js";
import { Product, productBoutique } from "../../../src/models/product.model.js";
import { User } from "../../../src/models/user.model.js";
import {
  addToCart,
  clearCart,
  getCart,
  removeFromCart,
  updateCartItem,
} from "../../../src/controllers/cart.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse, mockSession } from "../../helpers/express.mock.js";
import {
  makeCart,
  makeCartItem,
  makeProduct,
  makeProductBoutique,
  makeUser,
  oid,
} from "../../helpers/factories.js";

const CartMock = Cart as unknown as ReturnType<typeof vi.fn> & Record<string, any>;
const PbMock = productBoutique as unknown as Record<string, any>;
const ProductMock = Product as unknown as Record<string, any>;
const UserMock = User as unknown as Record<string, any>;

let session: ReturnType<typeof mockSession>;

/** Force le prochain validationResult à renvoyer les erreurs fournies. */
const failValidation = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({
    isEmpty: () => false,
    array: () => messages.map((msg) => ({ msg })),
  } as any);
};

beforeEach(() => {
  session = mockSession();
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);

  vi.mocked(validationResult).mockReturnValue({
    isEmpty: () => true,
    array: () => [],
  } as any);

  CartMock.findOne.mockReturnValue(mockQuery(null));
  PbMock.find.mockReturnValue(mockQuery([]));
  PbMock.findById.mockReturnValue(mockQuery(null));
  ProductMock.find.mockReturnValue(mockQuery([]));
  UserMock.findById.mockReturnValue(mockQuery(null));
});

// ─────────────────────────────────────────────
describe("getCart", () => {
  it("renvoie 422 quand la validation échoue", async () => {
    failValidation(["Identifiant utilisateur invalide."]);
    const res = mockResponse();

    await getCart(mockRequest({ params: { userId: "abc" } }), res);

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Identifiant utilisateur invalide.");
  });

  it("concatène plusieurs messages de validation", async () => {
    failValidation(["Erreur A", "Erreur B"]);
    const res = mockResponse();

    await getCart(mockRequest(), res);

    expect(res.body.message).toBe("Erreur A | Erreur B");
  });

  it("renvoie un panier vide sans créer de document quand aucun panier n'existe", async () => {
    const userId = oid().toString();
    CartMock.findOne.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await getCart(mockRequest({ params: { userId } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({
      id: null,
      userId,
      items: [],
      totalItems: 0,
      totalAmount: 0,
    });
    expect(CartMock).not.toHaveBeenCalled(); // aucun `new Cart(...)`
  });

  it("renvoie le panier enrichi des produits", async () => {
    const product = makeProduct({ name: "Galaxy A15" });
    const pb = makeProductBoutique({ productId: product._id, stock: 5 });
    const cart = makeCart({
      items: [makeCartItem({ productBoutiqueId: pb._id, quantity: 2, price: 1_000 })],
      amount: 2_000,
    });

    CartMock.findOne.mockReturnValue(mockQuery(cart));
    PbMock.find.mockReturnValue(mockQuery([pb]));
    ProductMock.find.mockReturnValue(mockQuery([product]));
    const res = mockResponse();

    await getCart(mockRequest({ params: { userId: cart.userId.toString() } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.totalItems).toBe(2);
    expect(res.body.data.totalAmount).toBe(2_000);
    expect(res.body.data.items[0].productName).toBe("Galaxy A15");
  });

  it("n'interroge pas les produits quand le panier n'a aucune ligne", async () => {
    CartMock.findOne.mockReturnValue(mockQuery(makeCart({ items: [] })));

    await getCart(mockRequest({ params: { userId: oid().toString() } }), mockResponse());

    expect(PbMock.find).not.toHaveBeenCalled();
    expect(ProductMock.find).not.toHaveBeenCalled();
  });

  it("renvoie 500 quand la lecture échoue", async () => {
    CartMock.findOne.mockImplementation(() => {
      throw new Error("connexion perdue");
    });
    const res = mockResponse();

    await getCart(mockRequest({ params: { userId: oid().toString() } }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("connexion perdue");
  });
});

// ─────────────────────────────────────────────
describe("addToCart", () => {
  const setup = (over: { user?: any; pb?: any; cart?: any } = {}) => {
    const user = over.user === null ? null : (over.user ?? makeUser());
    const pb = over.pb === null ? null : (over.pb ?? makeProductBoutique({ stock: 10 }));
    const cart = over.cart === undefined ? null : over.cart;

    UserMock.findById.mockReturnValue(mockQuery(user));
    PbMock.findById.mockReturnValue(mockQuery(pb));
    CartMock.findOne.mockReturnValue(mockQuery(cart));
    if (pb) PbMock.find.mockReturnValue(mockQuery([pb]));

    return { user, pb, cart };
  };

  it("renvoie 422 et annule la transaction si la validation échoue", async () => {
    failValidation(["Quantité invalide."]);
    const res = mockResponse();

    await addToCart(mockRequest(), res);

    expect(res.statusCode).toBe(422);
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.commitTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it("renvoie 404 quand l'utilisateur est introuvable", async () => {
    setup({ user: null });
    const res = mockResponse();

    await addToCart(
      mockRequest({ params: { userId: oid().toString() }, body: { productBoutiqueId: oid().toString() } }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Utilisateur introuvable");
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it("renvoie 404 quand le produit en boutique est introuvable", async () => {
    setup({ pb: null });
    const res = mockResponse();

    await addToCart(
      mockRequest({ params: { userId: oid().toString() }, body: { productBoutiqueId: oid().toString() } }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Produit en boutique introuvable");
  });

  it("crée un panier quand l'utilisateur n'en a pas encore", async () => {
    const { pb } = setup({ cart: null });
    const userId = oid().toString();
    const res = mockResponse();

    await addToCart(
      mockRequest({ params: { userId }, body: { productBoutiqueId: pb!._id.toString() } }),
      res
    );

    expect(CartMock).toHaveBeenCalledOnce();
    expect(CartMock.mock.calls[0]![0].userId).toBe(userId);

    // Le panier fraîchement instancié reçoit la ligne puis est persisté.
    const created = CartMock.mock.instances[0] as any;
    expect(created.items).toHaveLength(1);
    expect(created.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
  });

  it("ajoute la ligne au prix remisé quand il existe", async () => {
    const pb = makeProductBoutique({ price: 2_000, discountPrice: 1_500, stock: 10 });
    const cart = makeCart({ items: [] });
    setup({ pb, cart });
    const res = mockResponse();

    await addToCart(
      mockRequest({
        params: { userId: cart.userId.toString() },
        body: { productBoutiqueId: pb._id.toString(), quantity: 2 },
      }),
      res
    );

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.price).toBe(1_500);
    expect(cart.amount).toBe(3_000);
  });

  it("retombe sur le prix courant quand aucune remise n'est définie", async () => {
    const pb = makeProductBoutique({ price: 2_000, discountPrice: undefined, stock: 10 });
    const cart = makeCart({ items: [] });
    setup({ pb, cart });

    await addToCart(
      mockRequest({
        params: { userId: cart.userId.toString() },
        body: { productBoutiqueId: pb._id.toString() },
      }),
      mockResponse()
    );

    expect(cart.items[0]!.price).toBe(2_000);
  });

  it("utilise une quantité de 1 par défaut", async () => {
    const pb = makeProductBoutique({ stock: 10 });
    const cart = makeCart({ items: [] });
    setup({ pb, cart });

    await addToCart(
      mockRequest({
        params: { userId: cart.userId.toString() },
        body: { productBoutiqueId: pb._id.toString() },
      }),
      mockResponse()
    );

    expect(cart.items[0]!.quantity).toBe(1);
  });

  it("cumule la quantité d'une ligne déjà présente et rafraîchit le prix", async () => {
    const pb = makeProductBoutique({ price: 900, discountPrice: 800, stock: 10 });
    const cart = makeCart({
      items: [makeCartItem({ productBoutiqueId: pb._id, quantity: 2, price: 1_000 })],
      amount: 2_000,
    });
    setup({ pb, cart });

    await addToCart(
      mockRequest({
        params: { userId: cart.userId.toString() },
        body: { productBoutiqueId: pb._id.toString(), quantity: 3 },
      }),
      mockResponse()
    );

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.quantity).toBe(5);
    expect(cart.items[0]!.price).toBe(800);
    expect(cart.amount).toBe(4_000);
  });

  it("refuse un ajout dépassant le stock disponible", async () => {
    const pb = makeProductBoutique({ stock: 3 });
    const cart = makeCart({ items: [] });
    setup({ pb, cart });
    const res = mockResponse();

    await addToCart(
      mockRequest({
        params: { userId: cart.userId.toString() },
        body: { productBoutiqueId: pb._id.toString(), quantity: 4 },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Stock insuffisant (disponible : 3)");
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(cart.save).not.toHaveBeenCalled();
  });

  it("refuse quand le cumul avec la ligne existante dépasse le stock", async () => {
    const pb = makeProductBoutique({ stock: 5 });
    const cart = makeCart({
      items: [makeCartItem({ productBoutiqueId: pb._id, quantity: 4, price: 100 })],
    });
    setup({ pb, cart });
    const res = mockResponse();

    await addToCart(
      mockRequest({
        params: { userId: cart.userId.toString() },
        body: { productBoutiqueId: pb._id.toString(), quantity: 2 },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(cart.items[0]!.quantity).toBe(4); // inchangé
  });

  it("valide la transaction et libère la session en cas de succès", async () => {
    const pb = makeProductBoutique({ stock: 10 });
    const cart = makeCart({ items: [] });
    setup({ pb, cart });

    await addToCart(
      mockRequest({
        params: { userId: cart.userId.toString() },
        body: { productBoutiqueId: pb._id.toString() },
      }),
      mockResponse()
    );

    expect(session.startTransaction).toHaveBeenCalled();
    expect(cart.save).toHaveBeenCalledWith({ session });
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it("renvoie 500 et annule la transaction en cas d'erreur inattendue", async () => {
    UserMock.findById.mockImplementation(() => {
      throw new Error("panne réseau");
    });
    const res = mockResponse();

    await addToCart(
      mockRequest({ params: { userId: oid().toString() }, body: { productBoutiqueId: oid().toString() } }),
      res
    );

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("panne réseau");
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("updateCartItem", () => {
  it("renvoie 404 quand le panier n'existe pas", async () => {
    CartMock.findOne.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await updateCartItem(
      mockRequest({
        params: { userId: oid().toString(), productBoutiqueId: oid().toString() },
        body: { quantity: 2 },
      }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Panier introuvable");
  });

  it("renvoie 404 quand l'article n'est pas dans le panier", async () => {
    CartMock.findOne.mockReturnValue(mockQuery(makeCart({ items: [] })));
    const res = mockResponse();

    await updateCartItem(
      mockRequest({
        params: { userId: oid().toString(), productBoutiqueId: oid().toString() },
        body: { quantity: 2 },
      }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Article introuvable dans le panier");
  });

  it("met à jour la quantité et recalcule le montant", async () => {
    const pb = makeProductBoutique({ stock: 10 });
    const cart = makeCart({
      items: [makeCartItem({ productBoutiqueId: pb._id, quantity: 1, price: 500 })],
      amount: 500,
    });
    CartMock.findOne.mockReturnValue(mockQuery(cart));
    PbMock.findById.mockReturnValue(mockQuery(pb));
    PbMock.find.mockReturnValue(mockQuery([pb]));
    const res = mockResponse();

    await updateCartItem(
      mockRequest({
        params: { userId: cart.userId.toString(), productBoutiqueId: pb._id.toString() },
        body: { quantity: 4 },
      }),
      res
    );

    expect(cart.items[0]!.quantity).toBe(4);
    expect(cart.amount).toBe(2_000);
    expect(res.statusCode).toBe(200);
  });

  it("retire l'article quand la quantité vaut 0", async () => {
    const pb = makeProductBoutique();
    const cart = makeCart({
      items: [makeCartItem({ productBoutiqueId: pb._id, quantity: 2, price: 300 })],
      amount: 600,
    });
    CartMock.findOne.mockReturnValue(mockQuery(cart));
    const res = mockResponse();

    await updateCartItem(
      mockRequest({
        params: { userId: cart.userId.toString(), productBoutiqueId: pb._id.toString() },
        body: { quantity: 0 },
      }),
      res
    );

    expect(cart.items).toHaveLength(0);
    expect(cart.amount).toBe(0);
    expect(PbMock.findById).not.toHaveBeenCalled(); // pas de vérification de stock inutile
    expect(res.statusCode).toBe(200);
  });

  it("refuse une quantité supérieure au stock", async () => {
    const pb = makeProductBoutique({ stock: 2 });
    const cart = makeCart({
      items: [makeCartItem({ productBoutiqueId: pb._id, quantity: 1, price: 300 })],
    });
    CartMock.findOne.mockReturnValue(mockQuery(cart));
    PbMock.findById.mockReturnValue(mockQuery(pb));
    const res = mockResponse();

    await updateCartItem(
      mockRequest({
        params: { userId: cart.userId.toString(), productBoutiqueId: pb._id.toString() },
        body: { quantity: 5 },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Stock insuffisant (disponible : 2)");
    expect(cart.items[0]!.quantity).toBe(1);
  });

  it("renvoie 404 si le produit en boutique a disparu entre-temps", async () => {
    const pbId = oid();
    const cart = makeCart({
      items: [makeCartItem({ productBoutiqueId: pbId, quantity: 1, price: 300 })],
    });
    CartMock.findOne.mockReturnValue(mockQuery(cart));
    PbMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await updateCartItem(
      mockRequest({
        params: { userId: cart.userId.toString(), productBoutiqueId: pbId.toString() },
        body: { quantity: 2 },
      }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Produit en boutique introuvable");
  });
});

// ─────────────────────────────────────────────
describe("removeFromCart", () => {
  it("retire la ligne et recalcule le montant", async () => {
    const pbA = makeProductBoutique();
    const pbB = makeProductBoutique();
    const cart = makeCart({
      items: [
        makeCartItem({ productBoutiqueId: pbA._id, quantity: 1, price: 1_000 }),
        makeCartItem({ productBoutiqueId: pbB._id, quantity: 2, price: 500 }),
      ],
      amount: 2_000,
    });
    CartMock.findOne.mockReturnValue(mockQuery(cart));
    PbMock.find.mockReturnValue(mockQuery([pbB]));
    const res = mockResponse();

    await removeFromCart(
      mockRequest({
        params: { userId: cart.userId.toString(), productBoutiqueId: pbA._id.toString() },
      }),
      res
    );

    expect(cart.items).toHaveLength(1);
    expect(cart.amount).toBe(1_000);
    expect(res.statusCode).toBe(200);
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it("renvoie 404 quand le panier n'existe pas", async () => {
    CartMock.findOne.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await removeFromCart(
      mockRequest({ params: { userId: oid().toString(), productBoutiqueId: oid().toString() } }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Panier introuvable");
  });

  it("renvoie 404 quand l'article n'est pas dans le panier", async () => {
    CartMock.findOne.mockReturnValue(mockQuery(makeCart({ items: [] })));
    const res = mockResponse();

    await removeFromCart(
      mockRequest({ params: { userId: oid().toString(), productBoutiqueId: oid().toString() } }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Article introuvable dans le panier");
  });
});

// ─────────────────────────────────────────────
describe("clearCart", () => {
  it("vide toutes les lignes et remet le montant à zéro", async () => {
    const cart = makeCart({
      items: [makeCartItem({ quantity: 2, price: 500 }), makeCartItem({ quantity: 1, price: 800 })],
      amount: 1_800,
    });
    CartMock.findOne.mockReturnValue(mockQuery(cart));
    const res = mockResponse();

    await clearCart(mockRequest({ params: { userId: cart.userId.toString() } }), res);

    expect(cart.items).toHaveLength(0);
    expect(cart.amount).toBe(0);
    expect(cart.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.totalItems).toBe(0);
    expect(res.body.data.totalAmount).toBe(0);
  });

  it("renvoie 404 quand le panier n'existe pas", async () => {
    CartMock.findOne.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await clearCart(mockRequest({ params: { userId: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it("renvoie 500 et annule la transaction en cas d'erreur", async () => {
    CartMock.findOne.mockImplementation(() => {
      throw new Error("écriture refusée");
    });
    const res = mockResponse();

    await clearCart(mockRequest({ params: { userId: oid().toString() } }), res);

    expect(res.statusCode).toBe(500);
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });
});
