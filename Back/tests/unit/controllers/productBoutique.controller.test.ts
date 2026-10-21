import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

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

vi.mock("../../../src/models/recentlyViewed.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { RecentlyViewed: mockModel() };
});

vi.mock("../../../src/shared/helpers/fileUpload.js", () => ({
  getFileUrl: vi.fn((p: string) => `/uploads/images/${p.split(/[\\/]/).pop()}`),
  deleteFileByUrl: vi.fn(),
  cleanupUploadedFiles: vi.fn(),
}));

vi.mock("express-validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("express-validator")>();
  return {
    ...actual,
    validationResult: vi.fn(() => ({ isEmpty: () => true, array: () => [] })),
  };
});

import { validationResult } from "express-validator";
import { Product, productBoutique } from "../../../src/models/product.model.js";
import { Shop } from "../../../src/models/boutique.model.js";
import { Famille } from "../../../src/models/famille.model.js";
import { Categorie } from "../../../src/models/categorie.model.js";
import { SousCategorie } from "../../../src/models/sousCategorie.model.js";
import { RecentlyViewed } from "../../../src/models/recentlyViewed.model.js";
import { cleanupUploadedFiles, deleteFileByUrl } from "../../../src/shared/helpers/fileUpload.js";
import {
  createProductBoutique,
  deleteProductBoutique,
  getProductBoutiqueById,
  getProductBoutiques,
  getRecentlyViewed,
  getSuggestions,
  searchProductBoutiques,
  updateProductBoutique,
} from "../../../src/controllers/productBoutique.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse, mockSession } from "../../helpers/express.mock.js";
import { makeProduct, makeProductBoutique, makeShop, oid } from "../../helpers/factories.js";

// Les écritures d'offres exigent un gérant de la boutique ou un admin
// (contrôle d'appartenance testé en fin de fichier).
const ADMIN = { id: oid().toString(), entityType: "admin" };

const PbMock = productBoutique as unknown as ReturnType<typeof vi.fn> & Record<string, any>;
const ProductMock = Product as unknown as Record<string, any>;
const ShopMock = Shop as unknown as Record<string, any>;
const FamilleMock = Famille as unknown as Record<string, any>;
const CategorieMock = Categorie as unknown as Record<string, any>;
const SousCategorieMock = SousCategorie as unknown as Record<string, any>;
const RecentlyViewedMock = RecentlyViewed as unknown as ReturnType<typeof vi.fn> &
  Record<string, any>;

let session: ReturnType<typeof mockSession>;

const failValidation = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({
    isEmpty: () => false,
    array: () => messages.map((msg) => ({ msg })),
  } as any);
};

const uploadedFile = (path: string) =>
  ({ path, originalname: "img.jpg", mimetype: "image/jpeg", size: 1024 }) as Express.Multer.File;

beforeEach(() => {
  session = mockSession();
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);

  PbMock.find.mockReturnValue(mockQuery([]));
  PbMock.findOne.mockReturnValue(mockQuery(null));
  PbMock.findById.mockReturnValue(mockQuery(null));
  PbMock.countDocuments.mockReturnValue(mockQuery(0));
  PbMock.create.mockImplementation(async (docs: any[]) => [makeProductBoutique(docs[0])]);

  ProductMock.find.mockReturnValue(mockQuery([]));
  ProductMock.findById.mockReturnValue(mockQuery(makeProduct()));
  ShopMock.find.mockReturnValue(mockQuery([]));
  ShopMock.findById.mockReturnValue(mockQuery(makeShop()));
  FamilleMock.find.mockReturnValue(mockQuery([]));
  FamilleMock.findById.mockReturnValue(mockQuery(null));
  CategorieMock.find.mockReturnValue(mockQuery([]));
  CategorieMock.findById.mockReturnValue(mockQuery(null));
  SousCategorieMock.find.mockReturnValue(mockQuery([]));
  SousCategorieMock.findById.mockReturnValue(mockQuery(null));
  RecentlyViewedMock.findOne.mockReturnValue(mockQuery(null));
});

// ─────────────────────────────────────────────
describe("getProductBoutiques", () => {
  it("liste tous les produits sans filtre de boutique", async () => {
    const shop = makeShop({ nom: "Boutique Kaloum" });
    const pb = makeProductBoutique({ boutiqueId: shop._id });
    PbMock.find.mockReturnValue(mockQuery([pb]));
    ShopMock.find.mockReturnValue(mockQuery([shop]));
    const res = mockResponse();

    await getProductBoutiques(mockRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].boutique.nom).toBe("Boutique Kaloum");
    // Sans boutiqueId, aucune vérification d'existence de boutique n'est faite.
    expect(ShopMock.findById).not.toHaveBeenCalled();
  });

  it("renvoie 404 quand la boutique filtrée n'existe pas", async () => {
    ShopMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await getProductBoutiques(mockRequest({ query: { boutiqueId: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Boutique introuvable");
  });

  it("filtre par boutique et par produit", async () => {
    const boutiqueId = oid().toString();
    const productId = oid().toString();

    await getProductBoutiques(mockRequest({ query: { boutiqueId, productId } }), mockResponse());

    expect(PbMock.find).toHaveBeenCalledWith({ boutiqueId, productId });
  });

  it("filtre sur isFeatured", async () => {
    await getProductBoutiques(mockRequest({ query: { isFeatured: "true" } }), mockResponse());

    expect(PbMock.find).toHaveBeenCalledWith({ isFeatured: true });
  });

  it("pagine avec les valeurs par défaut", async () => {
    const query = mockQuery([]);
    PbMock.find.mockReturnValue(query);
    const res = mockResponse();

    await getProductBoutiques(mockRequest(), res);

    expect(query.skip).toHaveBeenCalledWith(0);
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(res.body.data.page).toBe(1);
  });

  it("associe chaque produit à sa propre boutique", async () => {
    const shopA = makeShop({ nom: "Kaloum" });
    const shopB = makeShop({ nom: "Madina" });
    const pbA = makeProductBoutique({ boutiqueId: shopA._id });
    const pbB = makeProductBoutique({ boutiqueId: shopB._id });
    PbMock.find.mockReturnValue(mockQuery([pbA, pbB]));
    ShopMock.find.mockReturnValue(mockQuery([shopA, shopB]));
    const res = mockResponse();

    await getProductBoutiques(mockRequest(), res);

    expect(res.body.data.items[0].boutique.nom).toBe("Kaloum");
    expect(res.body.data.items[1].boutique.nom).toBe("Madina");
  });

  it("renvoie 500 en cas d'erreur", async () => {
    PbMock.find.mockImplementation(() => {
      throw new Error("panne");
    });
    const res = mockResponse();

    await getProductBoutiques(mockRequest(), res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
describe("getProductBoutiqueById", () => {
  it("renvoie le produit avec sa boutique et son produit", async () => {
    const product = makeProduct({ name: "Galaxy A15" });
    const shop = makeShop({ nom: "Kaloum" });
    const pb = makeProductBoutique({ productId: product._id, boutiqueId: shop._id });
    PbMock.findById.mockReturnValue(mockQuery(pb));
    ProductMock.findById.mockReturnValue(mockQuery(product));
    ShopMock.findById.mockReturnValue(mockQuery(shop));
    const res = mockResponse();

    await getProductBoutiqueById(mockRequest({ params: { id: pb._id.toString() } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.product.name).toBe("Galaxy A15");
    expect(res.body.data.boutique.nom).toBe("Kaloum");
  });

  it("renvoie 404 quand le produit en boutique est introuvable", async () => {
    PbMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await getProductBoutiqueById(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Produit en boutique non trouvé");
  });

  it("renvoie 404 quand le produit associé a disparu", async () => {
    PbMock.findById.mockReturnValue(mockQuery(makeProductBoutique()));
    ProductMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await getProductBoutiqueById(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Produit non trouvé");
  });

  it("n'enregistre aucune vue sans userId", async () => {
    PbMock.findById.mockReturnValue(mockQuery(makeProductBoutique()));

    await getProductBoutiqueById(mockRequest({ params: { id: oid().toString() } }), mockResponse());

    expect(RecentlyViewedMock.findOne).not.toHaveBeenCalled();
  });

  it("crée l'historique de consultation au premier passage", async () => {
    const pb = makeProductBoutique();
    PbMock.findById.mockReturnValue(mockQuery(pb));
    RecentlyViewedMock.findOne.mockReturnValue(mockQuery(null));
    const userId = oid().toString();

    await getProductBoutiqueById(
      mockRequest({ params: { id: pb._id.toString() }, query: { userId } }),
      mockResponse()
    );

    expect(RecentlyViewedMock).toHaveBeenCalledOnce();
    const created = RecentlyViewedMock.mock.instances[0] as any;
    expect(created.items).toHaveLength(1);
    expect(created.save).toHaveBeenCalled();
  });

  it("place le produit consulté en tête de l'historique", async () => {
    const pb = makeProductBoutique();
    const ancien = { productBoutiqueId: oid(), viewedAt: new Date("2026-01-01") };
    const rv: any = { userId: oid(), items: [ancien], save: vi.fn() };
    PbMock.findById.mockReturnValue(mockQuery(pb));
    RecentlyViewedMock.findOne.mockReturnValue(mockQuery(rv));

    await getProductBoutiqueById(
      mockRequest({ params: { id: pb._id.toString() }, query: { userId: oid().toString() } }),
      mockResponse()
    );

    expect(rv.items).toHaveLength(2);
    expect(rv.items[0].productBoutiqueId.toString()).toBe(pb._id.toString());
    expect(rv.save).toHaveBeenCalled();
  });

  it("déduplique un produit déjà consulté", async () => {
    const pb = makeProductBoutique();
    const rv: any = {
      userId: oid(),
      items: [{ productBoutiqueId: pb._id, viewedAt: new Date("2026-01-01") }],
      save: vi.fn(),
    };
    PbMock.findById.mockReturnValue(mockQuery(pb));
    RecentlyViewedMock.findOne.mockReturnValue(mockQuery(rv));

    await getProductBoutiqueById(
      mockRequest({ params: { id: pb._id.toString() }, query: { userId: oid().toString() } }),
      mockResponse()
    );

    expect(rv.items).toHaveLength(1);
  });

  it("plafonne l'historique à 20 entrées", async () => {
    const pb = makeProductBoutique();
    const rv: any = {
      userId: oid(),
      items: Array.from({ length: 20 }, () => ({ productBoutiqueId: oid(), viewedAt: new Date() })),
      save: vi.fn(),
    };
    PbMock.findById.mockReturnValue(mockQuery(pb));
    RecentlyViewedMock.findOne.mockReturnValue(mockQuery(rv));

    await getProductBoutiqueById(
      mockRequest({ params: { id: pb._id.toString() }, query: { userId: oid().toString() } }),
      mockResponse()
    );

    expect(rv.items).toHaveLength(20);
  });
});

// ─────────────────────────────────────────────
describe("createProductBoutique", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    boutiqueId: oid().toString(),
    productId: oid().toString(),
    price: 1_500_000,
    stock: 10,
    ...over,
  });

  const withFiles = (paths: string[], bodyValue = body()) => {
    const req = mockRequest({ body: bodyValue, user: ADMIN });
    (req as any).files = paths.map(uploadedFile);
    return req;
  };

  it("renvoie 422 et nettoie les fichiers quand la validation échoue", async () => {
    failValidation(["Le prix est requis."]);
    const res = mockResponse();

    await createProductBoutique(withFiles(["/tmp/a.jpg"]), res);

    expect(res.statusCode).toBe(422);
    expect(cleanupUploadedFiles).toHaveBeenCalledOnce();
  });

  it("exige au moins une image", async () => {
    const res = mockResponse();

    await createProductBoutique(mockRequest({ body: body(), user: ADMIN }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Au moins une image est requise.");
    expect(PbMock.create).not.toHaveBeenCalled();
  });

  it("renvoie 404 quand la boutique n'existe pas", async () => {
    ShopMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await createProductBoutique(withFiles(["/tmp/a.jpg"]), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Boutique introuvable");
  });

  it("renvoie 404 quand le produit n'existe pas", async () => {
    ProductMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await createProductBoutique(withFiles(["/tmp/a.jpg"]), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Produit introuvable");
  });

  it("renvoie 409 quand le produit est déjà référencé dans la boutique", async () => {
    PbMock.findOne.mockReturnValue(mockQuery(makeProductBoutique()));
    const res = mockResponse();

    await createProductBoutique(withFiles(["/tmp/a.jpg"]), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe("Ce produit est déjà référencé dans cette boutique");
    expect(PbMock.create).not.toHaveBeenCalled();
  });

  it("enregistre l'URL publique de chaque image", async () => {
    await createProductBoutique(withFiles(["/tmp/a.jpg", "/tmp/b.jpg"]), mockResponse());

    expect(PbMock.create.mock.calls[0]![0][0].urlImages).toEqual([
      "/uploads/images/a.jpg",
      "/uploads/images/b.jpg",
    ]);
  });

  it("applique les valeurs par défaut de isFeatured et tags", async () => {
    await createProductBoutique(withFiles(["/tmp/a.jpg"]), mockResponse());

    const created = PbMock.create.mock.calls[0]![0][0];
    expect(created.isFeatured).toBe(false);
    expect(created.tags).toEqual([]);
  });

  it("renvoie 201 et valide la transaction", async () => {
    const res = mockResponse();

    await createProductBoutique(withFiles(["/tmp/a.jpg"]), res);

    expect(res.statusCode).toBe(201);
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("updateProductBoutique", () => {
  it("renvoie 404 quand le produit en boutique n'existe pas", async () => {
    PbMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await updateProductBoutique(mockRequest({ params: { id: oid().toString() }, body: {}, user: ADMIN }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it("ne modifie que les champs fournis", async () => {
    const pb = makeProductBoutique({ price: 1_000, stock: 5 });
    PbMock.findById.mockReturnValue(mockQuery(pb));
    const res = mockResponse();

    await updateProductBoutique(
      mockRequest({ params: { id: pb._id.toString() }, body: { price: 2_000 }, user: ADMIN }),
      res
    );

    expect(pb.price).toBe(2_000);
    expect(pb.stock).toBe(5);
    expect(pb.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
  });

  it("accepte une remise à zéro du stock", async () => {
    const pb = makeProductBoutique({ stock: 12 });
    PbMock.findById.mockReturnValue(mockQuery(pb));

    await updateProductBoutique(
      mockRequest({ params: { id: pb._id.toString() }, body: { stock: 0 }, user: ADMIN }),
      mockResponse()
    );

    expect(pb.stock).toBe(0);
  });

  it("renvoie 404 quand la nouvelle boutique n'existe pas", async () => {
    const pb = makeProductBoutique();
    PbMock.findById.mockReturnValue(mockQuery(pb));
    ShopMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await updateProductBoutique(
      mockRequest({
        params: { id: pb._id.toString() },
        body: { boutiqueId: oid().toString() },
        user: ADMIN,
      }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Boutique introuvable");
  });

  it("ne revérifie pas la boutique quand elle est inchangée", async () => {
    const pb = makeProductBoutique();
    PbMock.findById.mockReturnValue(mockQuery(pb));

    await updateProductBoutique(
      mockRequest({
        params: { id: pb._id.toString() },
        body: { boutiqueId: pb.boutiqueId.toString() },
        user: ADMIN,
      }),
      mockResponse()
    );

    // Contrôle d'appartenance + résolution finale pour le DTO : aucun contrôle
    // d'existence d'une « nouvelle » boutique qui est la même.
    expect(ShopMock.findById).toHaveBeenCalledTimes(2);
  });

  it("retire les images demandées et ajoute les nouvelles", async () => {
    const pb = makeProductBoutique({
      urlImages: ["/uploads/images/a.jpg", "/uploads/images/b.jpg"],
    });
    PbMock.findById.mockReturnValue(mockQuery(pb));
    const req = mockRequest({
      params: { id: pb._id.toString() },
      body: { imagesToRemove: ["/uploads/images/a.jpg"] },
      user: ADMIN,
    });
    (req as any).files = [uploadedFile("/tmp/c.jpg")];

    await updateProductBoutique(req, mockResponse());

    expect(deleteFileByUrl).toHaveBeenCalledWith("/uploads/images/a.jpg");
    expect(pb.urlImages).toEqual(["/uploads/images/b.jpg", "/uploads/images/c.jpg"]);
  });
});

// ─────────────────────────────────────────────
describe("deleteProductBoutique", () => {
  it("effectue une suppression logique", async () => {
    const pb = makeProductBoutique();
    PbMock.findById.mockReturnValue(mockQuery(pb));
    const res = mockResponse();

    await deleteProductBoutique(mockRequest({ params: { id: pb._id.toString() } }), res);

    expect(pb.deletedAt).toBeInstanceOf(Date);
    expect(pb.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
  });

  it("renvoie 404 quand il est introuvable", async () => {
    PbMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await deleteProductBoutique(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("getRecentlyViewed", () => {
  it("renvoie une liste vide sans historique", async () => {
    RecentlyViewedMock.findOne.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await getRecentlyViewed(mockRequest({ params: { userId: oid().toString() } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("renvoie une liste vide quand l'historique ne contient rien", async () => {
    RecentlyViewedMock.findOne.mockReturnValue(mockQuery({ items: [] }));
    const res = mockResponse();

    await getRecentlyViewed(mockRequest({ params: { userId: oid().toString() } }), res);

    expect(res.body.data).toEqual([]);
  });

  it("respecte l'ordre de l'historique et joint viewedAt", async () => {
    const pbA = makeProductBoutique();
    const pbB = makeProductBoutique();
    const vuA = new Date("2026-02-01");
    const vuB = new Date("2026-01-01");

    RecentlyViewedMock.findOne.mockReturnValue(
      mockQuery({
        items: [
          { productBoutiqueId: pbA._id, viewedAt: vuA },
          { productBoutiqueId: pbB._id, viewedAt: vuB },
        ],
      })
    );
    // La base peut renvoyer les documents dans un autre ordre.
    PbMock.find.mockReturnValue(mockQuery([pbB, pbA]));
    const res = mockResponse();

    await getRecentlyViewed(mockRequest({ params: { userId: oid().toString() } }), res);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].id).toBe(pbA._id.toString());
    expect(res.body.data[0].viewedAt).toBe(vuA);
    expect(res.body.data[1].id).toBe(pbB._id.toString());
  });

  it("ignore les entrées dont le produit a été supprimé", async () => {
    const pb = makeProductBoutique();
    RecentlyViewedMock.findOne.mockReturnValue(
      mockQuery({
        items: [
          { productBoutiqueId: pb._id, viewedAt: new Date() },
          { productBoutiqueId: oid(), viewedAt: new Date() },
        ],
      })
    );
    PbMock.find.mockReturnValue(mockQuery([pb]));
    const res = mockResponse();

    await getRecentlyViewed(mockRequest({ params: { userId: oid().toString() } }), res);

    expect(res.body.data).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────
describe("getSuggestions", () => {
  const product = makeProduct();
  const item = makeProductBoutique({ productId: product._id });
  const request = (limit?: string) => mockRequest({ params: { id: item._id.toString() }, query: limit ? { limit } : {} });
  // Lectures de la cascade (elles excluent les produits déjà vus) ; les
  // autres appels à Product.find servent à mettre en forme le résultat.
  const tierCalls = () => ProductMock.find.mock.calls.map((c: any[]) => c[0]).filter((f: any) => f?._id?.$nin);

  beforeEach(() => {
    PbMock.findById.mockReturnValue(mockQuery(item));
    ProductMock.findById.mockReturnValue(mockQuery(product));
  });

  it("renvoie 404 si l'offre n'existe pas", async () => {
    PbMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await getSuggestions(request(), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("s'arrête à la sous-catégorie quand elle suffit, sans lire la famille", async () => {
    const related = [makeProduct(), makeProduct()];
    ProductMock.find.mockReturnValueOnce(mockQuery(related));
    PbMock.find.mockReturnValueOnce(mockQuery([makeProductBoutique(), makeProductBoutique()]));
    const res = mockResponse();

    await getSuggestions(request("2"), res);

    expect(tierCalls()).toHaveLength(1);
    expect(tierCalls()[0]).toMatchObject({ sousCategoryId: product.sousCategoryId });
    expect(res.body.data).toHaveLength(2);
  });

  it("complète avec la catégorie puis la famille, sans reprendre un produit déjà vu", async () => {
    const sameSous = makeProduct();
    const sameCat = makeProduct();
    ProductMock.find
      .mockReturnValueOnce(mockQuery([sameSous]))
      .mockReturnValueOnce(mockQuery([sameCat]))
      .mockReturnValueOnce(mockQuery([]));
    PbMock.find
      .mockReturnValueOnce(mockQuery([makeProductBoutique({ productId: sameSous._id })]))
      .mockReturnValueOnce(mockQuery([makeProductBoutique({ productId: sameCat._id })]));
    const res = mockResponse();

    await getSuggestions(request("4"), res);

    expect(tierCalls()).toHaveLength(3);
    const [, second, third] = tierCalls();
    expect(second).toMatchObject({ categoryId: product.categoryId });
    expect(second._id.$nin.map(String)).toEqual([product._id, sameSous._id].map(String));
    expect(third).toMatchObject({ familleId: product.familleId });
    expect(res.body.data).toHaveLength(2);
  });

  it("borne la lecture à ce qui manque encore", async () => {
    const query = mockQuery([makeProduct()]);
    ProductMock.find.mockReturnValueOnce(query);

    await getSuggestions(request("5"), mockResponse());

    expect(query.limit).toHaveBeenCalledWith(15);
  });

  it("renvoie une liste vide quand rien n'est apparenté", async () => {
    const res = mockResponse();

    await getSuggestions(request(), res);

    expect(res.body.data).toEqual([]);
  });
});

describe("searchProductBoutiques", () => {
  beforeEach(() => {
    PbMock.findOne.mockReturnValue(mockQuery(null));
  });

  it("recherche sur le nom et la description du produit", async () => {
    ProductMock.find.mockReturnValue(mockQuery([makeProduct()]));

    await searchProductBoutiques(mockRequest({ query: { q: "galaxy" } }), mockResponse());

    expect(ProductMock.find).toHaveBeenCalledWith({
      $or: [
        { name: { $regex: "galaxy", $options: "i" } },
        { description: { $regex: "galaxy", $options: "i" } },
      ],
    });
  });

  it("renvoie un résultat vide quand aucun produit ne correspond", async () => {
    ProductMock.find.mockReturnValue(mockQuery([]));
    const res = mockResponse();

    await searchProductBoutiques(mockRequest({ query: { q: "inexistant" } }), res);

    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.priceRange).toEqual({ min: 0, max: 0 });
    expect(PbMock.find).not.toHaveBeenCalled();
  });

  it("saute la jointure produit sans critère textuel ni taxonomie", async () => {
    await searchProductBoutiques(mockRequest({ query: { minPrice: "1000" } }), mockResponse());

    // Seule la résolution finale des DTO interroge Product, jamais le filtre de recherche.
    for (const [filter] of ProductMock.find.mock.calls) {
      expect(filter).toHaveProperty("_id");
    }
    expect(PbMock.find).toHaveBeenCalledWith(
      expect.not.objectContaining({ productId: expect.anything() })
    );
  });

  it("applique une fourchette de prix", async () => {
    await searchProductBoutiques(
      mockRequest({ query: { minPrice: "1000", maxPrice: "5000" } }),
      mockResponse()
    );

    expect(PbMock.find).toHaveBeenCalledWith(
      expect.objectContaining({ price: { $gte: 1000, $lte: 5000 } })
    );
  });

  it("filtre sur la note minimale et la disponibilité", async () => {
    await searchProductBoutiques(
      mockRequest({ query: { minRating: "4", inStock: "true" } }),
      mockResponse()
    );

    expect(PbMock.find).toHaveBeenCalledWith(
      expect.objectContaining({ rating: { $gte: 4 }, stock: { $gt: 0 } })
    );
  });

  it("découpe les tags séparés par des virgules", async () => {
    await searchProductBoutiques(
      mockRequest({ query: { tags: "samsung, smartphone ,promo" } }),
      mockResponse()
    );

    expect(PbMock.find).toHaveBeenCalledWith(
      expect.objectContaining({ tags: { $in: ["samsung", "smartphone", "promo"] } })
    );
  });

  it("ne retient que les produits réellement remisés", async () => {
    await searchProductBoutiques(mockRequest({ query: { discounted: "true" } }), mockResponse());

    expect(PbMock.find).toHaveBeenCalledWith(
      expect.objectContaining({ $expr: { $lt: ["$discountPrice", "$price"] } })
    );
  });

  it.each([
    ["price_asc", { price: 1 }],
    ["price_desc", { price: -1 }],
    ["rating", { rating: -1 }],
    ["popular", { reviewsCount: -1 }],
    ["newest", { createdAt: -1 }],
  ])("trie selon %s", async (sort, expected) => {
    const query = mockQuery([]);
    PbMock.find.mockReturnValue(query);

    await searchProductBoutiques(mockRequest({ query: { sort } }), mockResponse());

    expect(query.sort).toHaveBeenCalledWith(expected);
  });

  it("retombe sur un tri par date pour une valeur inconnue", async () => {
    const query = mockQuery([]);
    PbMock.find.mockReturnValue(query);

    await searchProductBoutiques(mockRequest({ query: { sort: "n_importe_quoi" } }), mockResponse());

    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it("expose la fourchette de prix des résultats", async () => {
    PbMock.findOne
      .mockReturnValueOnce(mockQuery({ price: 500 }))
      .mockReturnValueOnce(mockQuery({ price: 9_000 }));
    const res = mockResponse();

    await searchProductBoutiques(mockRequest(), res);

    expect(res.body.data.priceRange).toEqual({ min: 500, max: 9_000 });
  });

  it("sans filtre, lit le total dans les métadonnées au lieu de compter", async () => {
    await searchProductBoutiques(mockRequest(), mockResponse());

    expect(PbMock.estimatedDocumentCount).toHaveBeenCalled();
    expect(PbMock.countDocuments).not.toHaveBeenCalled();
  });

  it("avec un filtre, compte exactement les résultats", async () => {
    await searchProductBoutiques(mockRequest({ query: { inStock: "true" } }), mockResponse());

    expect(PbMock.countDocuments).toHaveBeenCalledWith({ stock: { $gt: 0 } });
  });

  it("plafonne la taille de page à 100", async () => {
    const query = mockQuery([]);
    PbMock.find.mockReturnValue(query);

    await searchProductBoutiques(mockRequest({ query: { limit: "500" } }), mockResponse());

    expect(query.limit).toHaveBeenCalledWith(100);
  });

  it("renvoie 500 en cas d'erreur", async () => {
    PbMock.find.mockImplementation(() => {
      throw new Error("panne");
    });
    const res = mockResponse();

    await searchProductBoutiques(mockRequest(), res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
//  Livraison d'une offre et droits du vendeur
// ─────────────────────────────────────────────
describe("offres — livraison et droits du vendeur", () => {
  const ownerId = oid();
  const OWNER = { id: ownerId.toString(), entityType: "shop" };
  const OTHER_SELLER = { id: oid().toString(), entityType: "shop" };

  const shopWith = (over: Record<string, unknown> = {}) =>
    makeShop({
      ownerId,
      adresse: "Matam, Conakry",
      delivery: { modes: ["pickup", "flat_rate"], flatRateFee: 50_000 },
      ...over,
    });

  const createReq = (shop: ReturnType<typeof makeShop>, extra: Record<string, unknown> = {}, user = OWNER) => {
    const req = mockRequest({
      body: { boutiqueId: shop._id.toString(), productId: oid().toString(), price: 1_000, stock: 5, ...extra },
      user,
    });
    (req as any).files = [uploadedFile("/tmp/a.jpg")];
    return req;
  };

  describe("création", () => {
    it("laisse un nouveau produit hériter de la livraison de sa boutique", async () => {
      const shop = shopWith();
      ShopMock.findById.mockReturnValue(mockQuery(shop));
      const res = mockResponse();

      await createProductBoutique(createReq(shop), res);

      expect(res.statusCode).toBe(201);
      // Aucune configuration propre : la valeur par défaut du schéma (héritage) s'applique.
      expect(PbMock.create.mock.calls[0]![0][0]).not.toHaveProperty("delivery");
      expect(res.body.data.delivery).toEqual({
        source: "shop",
        modes: ["pickup", "flat_rate"],
        flatRateFee: 50_000,
        options: [
          { method: "pickup", fee: 0 },
          { method: "flat_rate", fee: 50_000 },
        ],
        currency: "GNF",
      });
    });

    it("enregistre une livraison personnalisée", async () => {
      const shop = shopWith();
      ShopMock.findById.mockReturnValue(mockQuery(shop));
      const res = mockResponse();

      await createProductBoutique(
        createReq(shop, { delivery: { useShopSettings: false, modes: ["flat_rate"], flatRateFee: 150_000 } }),
        res
      );

      expect(res.statusCode).toBe(201);
      expect(PbMock.create.mock.calls[0]![0][0].delivery).toEqual({
        useShopSettings: false,
        modes: ["flat_rate"],
        flatRateFee: 150_000,
      });
      expect(res.body.data.delivery).toMatchObject({ source: "product", flatRateFee: 150_000 });
    });

    it("refuse un prix fixe personnalisé sans tarif", async () => {
      const shop = shopWith();
      ShopMock.findById.mockReturnValue(mockQuery(shop));
      const res = mockResponse();

      await createProductBoutique(
        createReq(shop, { delivery: { useShopSettings: false, modes: ["flat_rate"] } }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe("Le tarif de la livraison à prix fixe est requis quand ce mode est activé.");
      expect(PbMock.create).not.toHaveBeenCalled();
      expect(cleanupUploadedFiles).toHaveBeenCalled();
    });

    it("interdit d'ajouter un produit à la boutique d'un autre vendeur", async () => {
      const shop = shopWith();
      ShopMock.findById.mockReturnValue(mockQuery(shop));
      const res = mockResponse();

      await createProductBoutique(createReq(shop, {}, OTHER_SELLER), res);

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toBe("Vous ne pouvez gérer que les produits de vos propres boutiques.");
      expect(PbMock.create).not.toHaveBeenCalled();
      expect(session.abortTransaction).toHaveBeenCalled();
    });
  });

  describe("modification", () => {
    const updateReq = (pb: ReturnType<typeof makeProductBoutique>, body: Record<string, unknown>, user = OWNER) =>
      mockRequest({ params: { id: pb._id.toString() }, body, user });

    it("personnalise la livraison d'un produit qui héritait", async () => {
      const shop = shopWith();
      const pb = makeProductBoutique({ boutiqueId: shop._id, delivery: { useShopSettings: true, modes: [], flatRateFee: null } });
      PbMock.findById.mockReturnValue(mockQuery(pb));
      ShopMock.findById.mockReturnValue(mockQuery(shop));
      const res = mockResponse();

      await updateProductBoutique(
        updateReq(pb, { delivery: { useShopSettings: false, modes: ["pickup"] } }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect(pb.delivery).toEqual({ useShopSettings: false, modes: ["pickup"], flatRateFee: null });
      expect(res.body.data.delivery).toMatchObject({ source: "product", modes: ["pickup"] });
    });

    it("rend le produit à la configuration actuelle de sa boutique", async () => {
      const shop = shopWith({ delivery: { modes: ["free"], flatRateFee: null } });
      const pb = makeProductBoutique({
        boutiqueId: shop._id,
        delivery: { useShopSettings: false, modes: ["flat_rate"], flatRateFee: 150_000 },
      });
      PbMock.findById.mockReturnValue(mockQuery(pb));
      ShopMock.findById.mockReturnValue(mockQuery(shop));
      const res = mockResponse();

      await updateProductBoutique(updateReq(pb, { delivery: { useShopSettings: true } }), res);

      expect(pb.delivery).toEqual({ useShopSettings: true, modes: [], flatRateFee: null });
      expect(res.body.data.delivery).toMatchObject({ source: "shop", modes: ["free"], flatRateFee: null });
    });

    it("ne touche pas à la livraison quand le champ est absent", async () => {
      const shop = shopWith();
      const custom = { useShopSettings: false, modes: ["pickup"], flatRateFee: null };
      const pb = makeProductBoutique({ boutiqueId: shop._id, delivery: custom });
      PbMock.findById.mockReturnValue(mockQuery(pb));
      ShopMock.findById.mockReturnValue(mockQuery(shop));

      await updateProductBoutique(updateReq(pb, { price: 2_000 }), mockResponse());

      expect(pb.delivery).toBe(custom);
    });

    it("interdit à un vendeur de modifier le produit d'une autre boutique", async () => {
      const shop = shopWith();
      const pb = makeProductBoutique({ boutiqueId: shop._id, price: 1_000 });
      PbMock.findById.mockReturnValue(mockQuery(pb));
      ShopMock.findById.mockReturnValue(mockQuery(shop));
      const res = mockResponse();

      await updateProductBoutique(
        updateReq(pb, { price: 1, delivery: { useShopSettings: false, modes: ["free"] } }, OTHER_SELLER),
        res
      );

      expect(res.statusCode).toBe(403);
      expect(pb.price).toBe(1_000);
      expect(pb.save).not.toHaveBeenCalled();
    });

    it("interdit de déplacer un produit vers la boutique d'un autre vendeur", async () => {
      const mine = shopWith();
      const theirs = makeShop({ ownerId: oid() });
      const pb = makeProductBoutique({ boutiqueId: mine._id });
      PbMock.findById.mockReturnValue(mockQuery(pb));
      ShopMock.findById.mockImplementation((id: unknown) =>
        mockQuery(String(id) === theirs._id.toString() ? theirs : mine)
      );
      const res = mockResponse();

      await updateProductBoutique(updateReq(pb, { boutiqueId: theirs._id.toString() }), res);

      expect(res.statusCode).toBe(403);
      expect(pb.boutiqueId).toBe(mine._id);
    });
  });
});
