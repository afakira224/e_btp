import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

vi.mock("../../../src/models/categorie.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Categorie: mockModel() };
});

vi.mock("../../../src/models/famille.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Famille: mockModel() };
});

vi.mock("../../../src/models/sousCategorie.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { SousCategorie: mockModel() };
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
import { Categorie } from "../../../src/models/categorie.model.js";
import { Famille } from "../../../src/models/famille.model.js";
import { SousCategorie } from "../../../src/models/sousCategorie.model.js";
import { cleanupUploadedFiles, deleteFileByUrl } from "../../../src/shared/helpers/fileUpload.js";
import {
  createCategorie,
  deleteCategorie,
  getCategorieById,
  getCategories,
  reorderCategories,
  updateCategorie,
} from "../../../src/controllers/categorie.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse, mockSession } from "../../helpers/express.mock.js";
import { makeCategorie, makeFamille, makeSousCategorie, oid } from "../../helpers/factories.js";

const CategorieMock = Categorie as unknown as Record<string, any>;
const FamilleMock = Famille as unknown as Record<string, any>;
const SousCategorieMock = SousCategorie as unknown as Record<string, any>;

let session: ReturnType<typeof mockSession>;

const failValidation = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({
    isEmpty: () => false,
    array: () => messages.map((msg) => ({ msg })),
  } as any);
};

const uploadedFile = (path = "/tmp/uploads/image-1.jpg") =>
  ({ path, originalname: "image.jpg", mimetype: "image/jpeg", size: 1024 }) as Express.Multer.File;

beforeEach(() => {
  session = mockSession();
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);

  CategorieMock.find.mockReturnValue(mockQuery([]));
  CategorieMock.findOne.mockReturnValue(mockQuery(null));
  CategorieMock.findById.mockReturnValue(mockQuery(null));
  CategorieMock.create.mockImplementation(async (docs: any[]) => [makeCategorie(docs[0])]);
  FamilleMock.findById.mockReturnValue(mockQuery(makeFamille()));
  SousCategorieMock.find.mockReturnValue(mockQuery([]));
});

// ─────────────────────────────────────────────
describe("getCategories", () => {
  it("renvoie les catégories triées par ordre", async () => {
    const query = mockQuery([makeCategorie()]);
    CategorieMock.find.mockReturnValue(query);
    const res = mockResponse();

    await getCategories(mockRequest(), res);

    expect(query.sort).toHaveBeenCalledWith({ ordre: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("filtre par famille", async () => {
    const familleId = oid().toString();

    await getCategories(mockRequest({ query: { familleId } }), mockResponse());

    expect(CategorieMock.find).toHaveBeenCalledWith({ familleId });
  });

  it("filtre sur actif", async () => {
    await getCategories(mockRequest({ query: { actif: "true" } }), mockResponse());

    expect(CategorieMock.find).toHaveBeenCalledWith({ actif: true });
  });

  it("ne remonte que les sous-catégories actives", async () => {
    await getCategories(mockRequest(), mockResponse());

    expect(SousCategorieMock.find).toHaveBeenCalledWith({ actif: true });
  });

  it("rattache chaque sous-catégorie à sa catégorie parente", async () => {
    const catA = makeCategorie({ nom: "Téléphonie" });
    const catB = makeCategorie({ nom: "Informatique" });
    const scA = makeSousCategorie({ categorieId: catA._id, nom: "Smartphones" });

    CategorieMock.find.mockReturnValue(mockQuery([catA, catB]));
    SousCategorieMock.find.mockReturnValue(mockQuery([scA]));
    const res = mockResponse();

    await getCategories(mockRequest(), res);

    expect(res.body.data[0].sousCategories).toHaveLength(1);
    expect(res.body.data[0].sousCategories[0].nom).toBe("Smartphones");
    expect(res.body.data[1].sousCategories).toHaveLength(0);
  });

  it("renvoie 500 en cas d'erreur", async () => {
    CategorieMock.find.mockImplementation(() => {
      throw new Error("panne");
    });
    const res = mockResponse();

    await getCategories(mockRequest(), res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
describe("getCategorieById", () => {
  it("renvoie la catégorie et ses sous-catégories", async () => {
    const categorie = makeCategorie({ nom: "Téléphonie" });
    const sc = makeSousCategorie({ categorieId: categorie._id });
    CategorieMock.findById.mockReturnValue(mockQuery(categorie));
    SousCategorieMock.find.mockReturnValue(mockQuery([sc]));
    const res = mockResponse();

    await getCategorieById(mockRequest({ params: { id: categorie._id.toString() } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.nom).toBe("Téléphonie");
    expect(res.body.data.sousCategories).toHaveLength(1);
  });

  it("expose familleId dans la réponse", async () => {
    const categorie = makeCategorie();
    CategorieMock.findById.mockReturnValue(mockQuery(categorie));
    const res = mockResponse();

    await getCategorieById(mockRequest({ params: { id: categorie._id.toString() } }), res);

    expect(res.body.data.familleId).toBe(categorie.familleId.toString());
  });

  it("renvoie 404 quand la catégorie est introuvable", async () => {
    CategorieMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await getCategorieById(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Catégorie non trouvée");
  });
});

// ─────────────────────────────────────────────
describe("createCategorie", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    familleId: oid().toString(),
    nom: "Téléphonie",
    ...over,
  });

  it("renvoie 422 et nettoie le fichier quand la validation échoue", async () => {
    failValidation(["Le nom est requis."]);
    const req = mockRequest({ body: {} });
    (req as any).file = uploadedFile();
    const res = mockResponse();

    await createCategorie(req, res);

    expect(res.statusCode).toBe(422);
    expect(cleanupUploadedFiles).toHaveBeenCalledOnce();
  });

  it("renvoie 404 quand la famille parente n'existe pas", async () => {
    FamilleMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await createCategorie(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Famille introuvable");
    expect(CategorieMock.create).not.toHaveBeenCalled();
  });

  it("renvoie 409 quand le nom existe déjà dans la famille", async () => {
    CategorieMock.findOne.mockReturnValue(mockQuery(makeCategorie()));
    const res = mockResponse();

    await createCategorie(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe("Une catégorie avec ce nom existe déjà dans cette famille");
  });

  it("vérifie l'unicité du nom au sein de la famille uniquement", async () => {
    const familleId = oid().toString();

    await createCategorie(mockRequest({ body: body({ familleId, nom: " Téléphonie " }) }), mockResponse());

    expect(CategorieMock.findOne).toHaveBeenCalledWith({ familleId, nom: "Téléphonie" });
  });

  it("attribue l'ordre 10 à la première catégorie de la famille", async () => {
    CategorieMock.findOne.mockReturnValue(mockQuery(null));

    await createCategorie(mockRequest({ body: body() }), mockResponse());

    expect(CategorieMock.create.mock.calls[0]![0][0].ordre).toBe(10);
  });

  it("incrémente l'ordre de 10 par rapport à la dernière catégorie", async () => {
    CategorieMock.findOne
      .mockReturnValueOnce(mockQuery(null))
      .mockReturnValueOnce(mockQuery(makeCategorie({ ordre: 20 })));

    await createCategorie(mockRequest({ body: body() }), mockResponse());

    expect(CategorieMock.create.mock.calls[0]![0][0].ordre).toBe(30);
  });

  it("renvoie 201 et valide la transaction", async () => {
    const res = mockResponse();

    await createCategorie(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(201);
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it("enregistre l'URL du fichier envoyé", async () => {
    const req = mockRequest({ body: body() });
    (req as any).file = uploadedFile("/tmp/uploads/cat.jpg");

    await createCategorie(req, mockResponse());

    expect(CategorieMock.create.mock.calls[0]![0][0].image).toBe("/uploads/images/cat.jpg");
  });
});

// ─────────────────────────────────────────────
describe("updateCategorie", () => {
  it("renvoie 404 quand la catégorie n'existe pas", async () => {
    CategorieMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await updateCategorie(mockRequest({ params: { id: oid().toString() }, body: {} }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it("ne modifie que les champs fournis", async () => {
    const categorie = makeCategorie({ nom: "Téléphonie", ordre: 10 });
    CategorieMock.findById.mockReturnValue(mockQuery(categorie));
    const res = mockResponse();

    await updateCategorie(
      mockRequest({ params: { id: categorie._id.toString() }, body: { ordre: 40 } }),
      res
    );

    expect(categorie.ordre).toBe(40);
    expect(categorie.nom).toBe("Téléphonie");
    expect(categorie.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
  });

  it("supprime l'image sur removeImage", async () => {
    const categorie = makeCategorie({ image: "/uploads/images/a.jpg" });
    CategorieMock.findById.mockReturnValue(mockQuery(categorie));

    await updateCategorie(
      mockRequest({ params: { id: categorie._id.toString() }, body: { removeImage: "true" } }),
      mockResponse()
    );

    expect(deleteFileByUrl).toHaveBeenCalledWith("/uploads/images/a.jpg");
    expect(categorie.image).toBeNull();
  });
});

// ─────────────────────────────────────────────
describe("reorderCategories", () => {
  it("réécrit les ordres par pas de 10", async () => {
    const ids = [oid().toString(), oid().toString()];
    const res = mockResponse();

    await reorderCategories(mockRequest({ body: { orderedIds: ids } }), res);

    const ops = CategorieMock.bulkWrite.mock.calls[0]![0];
    expect(ops[0].updateOne.update.ordre).toBe(10);
    expect(ops[1].updateOne.update.ordre).toBe(20);
    expect(res.statusCode).toBe(200);
  });

  it("refuse un tableau vide", async () => {
    const res = mockResponse();

    await reorderCategories(mockRequest({ body: { orderedIds: [] } }), res);

    expect(res.statusCode).toBe(400);
    expect(CategorieMock.bulkWrite).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("deleteCategorie", () => {
  it("effectue une suppression logique", async () => {
    const categorie = makeCategorie();
    CategorieMock.findById.mockReturnValue(mockQuery(categorie));
    const res = mockResponse();

    await deleteCategorie(mockRequest({ params: { id: categorie._id.toString() } }), res);

    expect(categorie.deletedAt).toBeInstanceOf(Date);
    expect(categorie.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
  });

  it("renvoie 404 quand la catégorie est introuvable", async () => {
    CategorieMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await deleteCategorie(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
  });
});
