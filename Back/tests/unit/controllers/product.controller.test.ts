import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

vi.mock("../../../src/models/product.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Product: mockModel(), productBoutique: mockModel() };
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

vi.mock("../../../src/shared/helpers/fileUpload.js", () => ({
  getFileUrl: vi.fn((p: string) => `/uploads/images/${p.split(/[\\/]/).pop()}`),
  deleteUploadedFile: vi.fn(),
}));

// Le contrôleur nettoie ses uploads via fs.unlink : aucun accès disque en test.
vi.mock("fs", () => {
  const fsMock = { unlink: vi.fn((_p: string, cb?: () => void) => cb?.()) };
  return { default: fsMock, ...fsMock };
});

vi.mock("express-validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("express-validator")>();
  return {
    ...actual,
    validationResult: vi.fn(() => ({ isEmpty: () => true, array: () => [] })),
  };
});

import fs from "fs";
import { validationResult } from "express-validator";
import { Product } from "../../../src/models/product.model.js";
import { Famille } from "../../../src/models/famille.model.js";
import { Categorie } from "../../../src/models/categorie.model.js";
import { SousCategorie } from "../../../src/models/sousCategorie.model.js";
import { deleteUploadedFile } from "../../../src/shared/helpers/fileUpload.js";
import {
  createProduct,
  deleteProduct,
  getProductById,
  getProducts,
  updateProduct,
} from "../../../src/controllers/product.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse, mockSession } from "../../helpers/express.mock.js";
import {
  makeCategorie,
  makeFamille,
  makeProduct,
  makeSousCategorie,
  oid,
} from "../../helpers/factories.js";

const ProductMock = Product as unknown as Record<string, any>;
const FamilleMock = Famille as unknown as Record<string, any>;
const CategorieMock = Categorie as unknown as Record<string, any>;
const SousCategorieMock = SousCategorie as unknown as Record<string, any>;

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

  ProductMock.find.mockReturnValue(mockQuery([]));
  ProductMock.findById.mockReturnValue(mockQuery(null));
  ProductMock.countDocuments.mockReturnValue(mockQuery(0));
  ProductMock.create.mockImplementation(async (docs: any[]) => [makeProduct(docs[0])]);

  FamilleMock.find.mockReturnValue(mockQuery([]));
  CategorieMock.find.mockReturnValue(mockQuery([]));
  SousCategorieMock.find.mockReturnValue(mockQuery([]));
  FamilleMock.findById.mockReturnValue(mockQuery(makeFamille()));
  CategorieMock.findById.mockReturnValue(mockQuery(makeCategorie()));
  SousCategorieMock.findById.mockReturnValue(mockQuery(makeSousCategorie()));
});

// ─────────────────────────────────────────────
describe("getProducts", () => {
  it("pagine avec les valeurs par défaut", async () => {
    const query = mockQuery([]);
    ProductMock.find.mockReturnValue(query);
    const res = mockResponse();

    await getProducts(mockRequest(), res);

    expect(query.skip).toHaveBeenCalledWith(0);
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(res.body.data.page).toBe(1);
  });

  it("filtre par taxonomie", async () => {
    const familleId = oid().toString();
    const categoryId = oid().toString();
    const sousCategoryId = oid().toString();

    await getProducts(
      mockRequest({ query: { familleId, categoryId, sousCategoryId } }),
      mockResponse()
    );

    expect(ProductMock.find).toHaveBeenCalledWith({ familleId, categoryId, sousCategoryId });
  });

  it("recherche par nom, insensible à la casse", async () => {
    await getProducts(mockRequest({ query: { search: "galaxy" } }), mockResponse());

    expect(ProductMock.find).toHaveBeenCalledWith({
      name: { $regex: "galaxy", $options: "i" },
    });
  });

  it("plafonne la taille de page à 100", async () => {
    const query = mockQuery([]);
    ProductMock.find.mockReturnValue(query);

    await getProducts(mockRequest({ query: { limit: "1000" } }), mockResponse());

    expect(query.limit).toHaveBeenCalledWith(100);
  });

  it("enrichit chaque produit de sa taxonomie", async () => {
    const famille = makeFamille();
    const categorie = makeCategorie({ familleId: famille._id });
    const sousCategorie = makeSousCategorie({ categorieId: categorie._id });
    const product = makeProduct({
      name: "Galaxy A15",
      familleId: famille._id,
      categoryId: categorie._id,
      sousCategoryId: sousCategorie._id,
    });

    ProductMock.find.mockReturnValue(mockQuery([product]));
    FamilleMock.find.mockReturnValue(mockQuery([famille]));
    CategorieMock.find.mockReturnValue(mockQuery([categorie]));
    SousCategorieMock.find.mockReturnValue(mockQuery([sousCategorie]));
    const res = mockResponse();

    await getProducts(mockRequest(), res);

    expect(res.body.data.products[0].name).toBe("Galaxy A15");
    expect(res.body.data.products[0].familles).toHaveLength(1);
    expect(res.body.data.products[0].categories).toHaveLength(1);
    expect(res.body.data.products[0].sousCategories).toHaveLength(1);
  });

  it("calcule le nombre de pages", async () => {
    ProductMock.countDocuments.mockReturnValue(mockQuery(42));
    const res = mockResponse();

    await getProducts(mockRequest({ query: { limit: "20" } }), res);

    expect(res.body.data.totalPages).toBe(3);
  });

  it("renvoie 500 en cas d'erreur", async () => {
    ProductMock.find.mockImplementation(() => {
      throw new Error("panne");
    });
    const res = mockResponse();

    await getProducts(mockRequest(), res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
describe("getProductById", () => {
  it("renvoie le produit avec sa taxonomie", async () => {
    const product = makeProduct({ name: "Galaxy A15" });
    ProductMock.findById.mockReturnValue(mockQuery(product));
    const res = mockResponse();

    await getProductById(mockRequest({ params: { id: product._id.toString() } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.name).toBe("Galaxy A15");
  });

  it("renvoie 404 quand le produit est introuvable", async () => {
    ProductMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await getProductById(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Produit non trouvé");
  });
});

// ─────────────────────────────────────────────
describe("createProduct", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    name: "Galaxy A15",
    description: "Smartphone 128 Go",
    familleId: oid().toString(),
    categoryId: oid().toString(),
    sousCategoryId: oid().toString(),
    ...over,
  });

  const withFiles = (paths: string[], bodyValue = body()) => {
    const req = mockRequest({ body: bodyValue });
    (req as any).files = paths.map(uploadedFile);
    return req;
  };

  it("renvoie 422 et nettoie les fichiers quand la validation échoue", async () => {
    failValidation(["Le nom est requis."]);
    const res = mockResponse();

    await createProduct(withFiles(["/tmp/a.jpg"], {} as any), res);

    expect(res.statusCode).toBe(422);
    expect(fs.unlink).toHaveBeenCalledOnce();
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it("exige au moins une image", async () => {
    const res = mockResponse();

    await createProduct(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Au moins une image est requise.");
    expect(ProductMock.create).not.toHaveBeenCalled();
  });

  it("renvoie 404 quand la famille n'existe pas", async () => {
    FamilleMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await createProduct(withFiles(["/tmp/a.jpg"]), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Famille introuvable");
  });

  it("renvoie 404 quand la catégorie n'existe pas", async () => {
    CategorieMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await createProduct(withFiles(["/tmp/a.jpg"]), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Catégorie introuvable");
  });

  it("renvoie 404 quand la sous-catégorie n'existe pas", async () => {
    SousCategorieMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await createProduct(withFiles(["/tmp/a.jpg"]), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Sous-catégorie introuvable");
  });

  it("enregistre l'URL publique de chaque image", async () => {
    await createProduct(withFiles(["/tmp/a.jpg", "/tmp/b.jpg"]), mockResponse());

    expect(ProductMock.create.mock.calls[0]![0][0].urlImages).toEqual([
      "/uploads/images/a.jpg",
      "/uploads/images/b.jpg",
    ]);
  });

  it("renvoie 201 et valide la transaction", async () => {
    const res = mockResponse();

    await createProduct(withFiles(["/tmp/a.jpg"]), res);

    expect(res.statusCode).toBe(201);
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it("nettoie les fichiers en cas d'erreur", async () => {
    ProductMock.create.mockRejectedValue(new Error("écriture refusée"));
    const res = mockResponse();

    await createProduct(withFiles(["/tmp/a.jpg", "/tmp/b.jpg"]), res);

    expect(res.statusCode).toBe(500);
    expect(fs.unlink).toHaveBeenCalledTimes(2);
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("updateProduct", () => {
  it("renvoie 404 quand le produit n'existe pas", async () => {
    ProductMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await updateProduct(mockRequest({ params: { id: oid().toString() }, body: {} }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it("ne modifie que les champs fournis", async () => {
    const product = makeProduct({ name: "Galaxy A15", description: "128 Go" });
    ProductMock.findById.mockReturnValue(mockQuery(product));
    const res = mockResponse();

    await updateProduct(
      mockRequest({ params: { id: product._id.toString() }, body: { name: "Galaxy A25" } }),
      res
    );

    expect(product.name).toBe("Galaxy A25");
    expect(product.description).toBe("128 Go");
    expect(product.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
  });

  it("ajoute les nouvelles images aux existantes", async () => {
    const product = makeProduct({ urlImages: ["/uploads/images/existante.jpg"] });
    ProductMock.findById.mockReturnValue(mockQuery(product));
    const req = mockRequest({ params: { id: product._id.toString() }, body: {} });
    (req as any).files = [uploadedFile("/tmp/nouvelle.jpg")];

    await updateProduct(req, mockResponse());

    expect(product.urlImages).toEqual([
      "/uploads/images/existante.jpg",
      "/uploads/images/nouvelle.jpg",
    ]);
  });

  it("retire les images demandées du produit et du disque", async () => {
    const product = makeProduct({
      urlImages: ["/uploads/images/a.jpg", "/uploads/images/b.jpg"],
    });
    ProductMock.findById.mockReturnValue(mockQuery(product));

    await updateProduct(
      mockRequest({
        params: { id: product._id.toString() },
        body: { imagesToRemove: ["/uploads/images/a.jpg"] },
      }),
      mockResponse()
    );

    expect(deleteUploadedFile).toHaveBeenCalledWith("images/a.jpg");
    expect(product.urlImages).toEqual(["/uploads/images/b.jpg"]);
  });

  it("accepte imagesToRemove en JSON stringifié (multipart)", async () => {
    const product = makeProduct({ urlImages: ["/uploads/images/a.jpg"] });
    ProductMock.findById.mockReturnValue(mockQuery(product));

    await updateProduct(
      mockRequest({
        params: { id: product._id.toString() },
        body: { imagesToRemove: JSON.stringify(["/uploads/images/a.jpg"]) },
      }),
      mockResponse()
    );

    expect(product.urlImages).toEqual([]);
  });

  it("renvoie 404 quand la nouvelle famille n'existe pas", async () => {
    ProductMock.findById.mockReturnValue(mockQuery(makeProduct()));
    FamilleMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await updateProduct(
      mockRequest({
        params: { id: oid().toString() },
        body: { familleId: oid().toString() },
      }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Famille introuvable");
  });
});

// ─────────────────────────────────────────────
describe("deleteProduct", () => {
  it("effectue une suppression logique", async () => {
    const product = makeProduct();
    ProductMock.findById.mockReturnValue(mockQuery(product));
    const res = mockResponse();

    await deleteProduct(mockRequest({ params: { id: product._id.toString() } }), res);

    expect(product.deletedAt).toBeInstanceOf(Date);
    expect(product.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it("renvoie 404 quand le produit est introuvable", async () => {
    ProductMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await deleteProduct(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});
