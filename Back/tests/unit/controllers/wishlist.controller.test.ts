import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

vi.mock("../../../src/models/wishlist.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Wishlist: mockModel() };
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
import { Wishlist } from "../../../src/models/wishlist.model.js";
import { Product, productBoutique } from "../../../src/models/product.model.js";
import { Shop } from "../../../src/models/boutique.model.js";
import { Famille } from "../../../src/models/famille.model.js";
import { Categorie } from "../../../src/models/categorie.model.js";
import { SousCategorie } from "../../../src/models/sousCategorie.model.js";
import { User } from "../../../src/models/user.model.js";
import {
  addToWishlist,
  clearWishlist,
  getWishlist,
  removeFromWishlist,
} from "../../../src/controllers/wishlist.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse, mockSession } from "../../helpers/express.mock.js";
import {
  makeCategorie,
  makeFamille,
  makeProduct,
  makeProductBoutique,
  makeShop,
  makeSousCategorie,
  makeUser,
  makeWishlist,
  oid,
} from "../../helpers/factories.js";

const WishlistMock = Wishlist as unknown as ReturnType<typeof vi.fn> & Record<string, any>;
const PbMock = productBoutique as unknown as Record<string, any>;
const ProductMock = Product as unknown as Record<string, any>;
const ShopMock = Shop as unknown as Record<string, any>;
const FamilleMock = Famille as unknown as Record<string, any>;
const CategorieMock = Categorie as unknown as Record<string, any>;
const SousCategorieMock = SousCategorie as unknown as Record<string, any>;
const UserMock = User as unknown as Record<string, any>;

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

  WishlistMock.findOne.mockReturnValue(mockQuery(null));
  UserMock.findById.mockReturnValue(mockQuery(makeUser()));
  PbMock.find.mockReturnValue(mockQuery([]));
  PbMock.findById.mockReturnValue(mockQuery(null));
  ProductMock.find.mockReturnValue(mockQuery([]));
  ShopMock.find.mockReturnValue(mockQuery([]));
  FamilleMock.find.mockReturnValue(mockQuery([]));
  CategorieMock.find.mockReturnValue(mockQuery([]));
  SousCategorieMock.find.mockReturnValue(mockQuery([]));
});

// ─────────────────────────────────────────────
describe("getWishlist", () => {
  it("renvoie 422 quand la validation échoue", async () => {
    failValidation(["Identifiant utilisateur invalide."]);
    const res = mockResponse();

    await getWishlist(mockRequest(), res);

    expect(res.statusCode).toBe(422);
  });

  it("renvoie une liste vide sans créer de document", async () => {
    const userId = oid().toString();
    const res = mockResponse();

    await getWishlist(mockRequest({ params: { userId } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({ id: null, userId, items: [], totalItems: 0 });
    expect(WishlistMock).not.toHaveBeenCalled();
  });

  it("renvoie la liste enrichie du produit, de la boutique et de la taxonomie", async () => {
    const famille = makeFamille();
    const categorie = makeCategorie({ familleId: famille._id });
    const sousCategorie = makeSousCategorie({ categorieId: categorie._id });
    const shop = makeShop({ nom: "Boutique Kaloum" });
    const product = makeProduct({
      name: "Galaxy A15",
      familleId: famille._id,
      categoryId: categorie._id,
      sousCategoryId: sousCategorie._id,
    });
    const pb = makeProductBoutique({ boutiqueId: shop._id, productId: product._id });
    const wishlist = makeWishlist({ items: [{ productBoutiqueId: pb._id }] });

    WishlistMock.findOne.mockReturnValue(mockQuery(wishlist));
    PbMock.find.mockReturnValue(mockQuery([pb]));
    ShopMock.find.mockReturnValue(mockQuery([shop]));
    ProductMock.find.mockReturnValue(mockQuery([product]));
    FamilleMock.find.mockReturnValue(mockQuery([famille]));
    CategorieMock.find.mockReturnValue(mockQuery([categorie]));
    SousCategorieMock.find.mockReturnValue(mockQuery([sousCategorie]));

    const res = mockResponse();

    await getWishlist(mockRequest({ params: { userId: wishlist.userId.toString() } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.totalItems).toBe(1);
    expect(res.body.data.items[0].productBoutique.boutique.nom).toBe("Boutique Kaloum");
    expect(res.body.data.items[0].productBoutique.product.name).toBe("Galaxy A15");
  });

  it("n'interroge pas les produits pour une liste sans article", async () => {
    WishlistMock.findOne.mockReturnValue(mockQuery(makeWishlist({ items: [] })));

    await getWishlist(mockRequest({ params: { userId: oid().toString() } }), mockResponse());

    expect(PbMock.find).not.toHaveBeenCalled();
  });

  it("renvoie 500 en cas d'erreur de lecture", async () => {
    WishlistMock.findOne.mockImplementation(() => {
      throw new Error("timeout");
    });
    const res = mockResponse();

    await getWishlist(mockRequest({ params: { userId: oid().toString() } }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("timeout");
  });
});

// ─────────────────────────────────────────────
describe("addToWishlist", () => {
  it("renvoie 404 quand l'utilisateur est introuvable", async () => {
    UserMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await addToWishlist(
      mockRequest({
        params: { userId: oid().toString() },
        body: { productBoutiqueId: oid().toString() },
      }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Utilisateur introuvable");
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it("renvoie 404 quand le produit en boutique est introuvable", async () => {
    PbMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await addToWishlist(
      mockRequest({
        params: { userId: oid().toString() },
        body: { productBoutiqueId: oid().toString() },
      }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Produit en boutique introuvable");
  });

  it("crée la liste de favoris quand elle n'existe pas encore", async () => {
    const pb = makeProductBoutique();
    PbMock.findById.mockReturnValue(mockQuery(pb));
    PbMock.find.mockReturnValue(mockQuery([pb]));
    WishlistMock.findOne.mockReturnValue(mockQuery(null));
    const userId = oid().toString();

    await addToWishlist(
      mockRequest({ params: { userId }, body: { productBoutiqueId: pb._id.toString() } }),
      mockResponse()
    );

    expect(WishlistMock).toHaveBeenCalledOnce();
    expect(WishlistMock.mock.calls[0]![0].userId).toBe(userId);
    expect((WishlistMock.mock.instances[0] as any).items).toHaveLength(1);
  });

  it("ajoute le produit aux favoris", async () => {
    const pb = makeProductBoutique();
    const wishlist = makeWishlist({ items: [] });
    PbMock.findById.mockReturnValue(mockQuery(pb));
    PbMock.find.mockReturnValue(mockQuery([pb]));
    WishlistMock.findOne.mockReturnValue(mockQuery(wishlist));
    const res = mockResponse();

    await addToWishlist(
      mockRequest({
        params: { userId: wishlist.userId.toString() },
        body: { productBoutiqueId: pb._id.toString() },
      }),
      res
    );

    expect(wishlist.items).toHaveLength(1);
    expect(res.body.message).toBe("Produit ajouté aux favoris avec succès");
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it("est idempotent : un produit déjà présent n'est pas dupliqué", async () => {
    const pb = makeProductBoutique();
    const wishlist = makeWishlist({ items: [{ productBoutiqueId: pb._id }] });
    PbMock.findById.mockReturnValue(mockQuery(pb));
    PbMock.find.mockReturnValue(mockQuery([pb]));
    WishlistMock.findOne.mockReturnValue(mockQuery(wishlist));
    const res = mockResponse();

    await addToWishlist(
      mockRequest({
        params: { userId: wishlist.userId.toString() },
        body: { productBoutiqueId: pb._id.toString() },
      }),
      res
    );

    expect(wishlist.items).toHaveLength(1);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Ce produit est déjà dans les favoris");
  });

  it("renvoie 500 et annule la transaction en cas d'erreur", async () => {
    UserMock.findById.mockImplementation(() => {
      throw new Error("connexion interrompue");
    });
    const res = mockResponse();

    await addToWishlist(
      mockRequest({
        params: { userId: oid().toString() },
        body: { productBoutiqueId: oid().toString() },
      }),
      res
    );

    expect(res.statusCode).toBe(500);
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("removeFromWishlist", () => {
  it("retire le produit des favoris", async () => {
    const pbA = makeProductBoutique();
    const pbB = makeProductBoutique();
    const wishlist = makeWishlist({
      items: [{ productBoutiqueId: pbA._id }, { productBoutiqueId: pbB._id }],
    });
    WishlistMock.findOne.mockReturnValue(mockQuery(wishlist));
    PbMock.find.mockReturnValue(mockQuery([pbB]));
    const res = mockResponse();

    await removeFromWishlist(
      mockRequest({
        params: { userId: wishlist.userId.toString(), productBoutiqueId: pbA._id.toString() },
      }),
      res
    );

    expect(wishlist.items).toHaveLength(1);
    expect(wishlist.items[0]!.productBoutiqueId).toBe(pbB._id);
    expect(res.statusCode).toBe(200);
  });

  it("renvoie 404 quand la liste n'existe pas", async () => {
    WishlistMock.findOne.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await removeFromWishlist(
      mockRequest({ params: { userId: oid().toString(), productBoutiqueId: oid().toString() } }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Liste de favoris introuvable");
  });

  it("renvoie 404 quand le produit n'est pas dans les favoris", async () => {
    WishlistMock.findOne.mockReturnValue(mockQuery(makeWishlist({ items: [] })));
    const res = mockResponse();

    await removeFromWishlist(
      mockRequest({ params: { userId: oid().toString(), productBoutiqueId: oid().toString() } }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Article introuvable dans les favoris");
  });
});

// ─────────────────────────────────────────────
describe("clearWishlist", () => {
  it("vide tous les favoris", async () => {
    const wishlist = makeWishlist({
      items: [{ productBoutiqueId: oid() }, { productBoutiqueId: oid() }],
    });
    WishlistMock.findOne.mockReturnValue(mockQuery(wishlist));
    const res = mockResponse();

    await clearWishlist(mockRequest({ params: { userId: wishlist.userId.toString() } }), res);

    expect(wishlist.items).toHaveLength(0);
    expect(wishlist.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.totalItems).toBe(0);
  });

  it("renvoie 404 quand la liste n'existe pas", async () => {
    WishlistMock.findOne.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await clearWishlist(mockRequest({ params: { userId: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});
