import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

vi.mock("../../../src/models/sousCategorie.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { SousCategorie: mockModel() };
});

vi.mock("../../../src/models/categorie.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Categorie: mockModel() };
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
import { SousCategorie } from "../../../src/models/sousCategorie.model.js";
import { Categorie } from "../../../src/models/categorie.model.js";
import { cleanupUploadedFiles, deleteFileByUrl } from "../../../src/shared/helpers/fileUpload.js";
import {
  createSousCategorie,
  deleteSousCategorie,
  getSousCategorieById,
  getSousCategories,
  reorderSousCategories,
  updateSousCategorie,
} from "../../../src/controllers/sousCategorie.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse, mockSession } from "../../helpers/express.mock.js";
import { makeCategorie, makeSousCategorie, oid } from "../../helpers/factories.js";

const SousCategorieMock = SousCategorie as unknown as Record<string, any>;
const CategorieMock = Categorie as unknown as Record<string, any>;

let session: ReturnType<typeof mockSession>;

const failValidation = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({
    isEmpty: () => false,
    array: () => messages.map((msg) => ({ msg })),
  } as any);
};

const uploadedFile = (path = "/tmp/uploads/sc.jpg") =>
  ({ path, originalname: "sc.jpg", mimetype: "image/jpeg", size: 1024 }) as Express.Multer.File;

beforeEach(() => {
  session = mockSession();
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);

  SousCategorieMock.find.mockReturnValue(mockQuery([]));
  SousCategorieMock.findOne.mockReturnValue(mockQuery(null));
  SousCategorieMock.findById.mockReturnValue(mockQuery(null));
  SousCategorieMock.create.mockImplementation(async (docs: any[]) => [makeSousCategorie(docs[0])]);
  CategorieMock.findById.mockReturnValue(mockQuery(makeCategorie()));
});

// ─────────────────────────────────────────────
describe("getSousCategories", () => {
  it("renvoie les sous-catégories triées par ordre", async () => {
    const query = mockQuery([makeSousCategorie()]);
    SousCategorieMock.find.mockReturnValue(query);
    const res = mockResponse();

    await getSousCategories(mockRequest(), res);

    expect(query.sort).toHaveBeenCalledWith({ ordre: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("filtre par catégorie parente", async () => {
    const categorieId = oid().toString();

    await getSousCategories(mockRequest({ query: { categorieId } }), mockResponse());

    expect(SousCategorieMock.find).toHaveBeenCalledWith({ categorieId });
  });

  it("filtre sur actif", async () => {
    await getSousCategories(mockRequest({ query: { actif: "false" } }), mockResponse());

    expect(SousCategorieMock.find).toHaveBeenCalledWith({ actif: false });
  });

  it("renvoie 500 en cas d'erreur", async () => {
    SousCategorieMock.find.mockImplementation(() => {
      throw new Error("panne");
    });
    const res = mockResponse();

    await getSousCategories(mockRequest(), res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
describe("getSousCategorieById", () => {
  it("renvoie la sous-catégorie demandée", async () => {
    const sc = makeSousCategorie({ nom: "Smartphones" });
    SousCategorieMock.findById.mockReturnValue(mockQuery(sc));
    const res = mockResponse();

    await getSousCategorieById(mockRequest({ params: { id: sc._id.toString() } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.nom).toBe("Smartphones");
  });

  it("renvoie 404 quand elle est introuvable", async () => {
    SousCategorieMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await getSousCategorieById(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Sous-catégorie non trouvée");
  });
});

// ─────────────────────────────────────────────
describe("createSousCategorie", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    categorieId: oid().toString(),
    nom: "Smartphones",
    ...over,
  });

  it("renvoie 422 et nettoie le fichier quand la validation échoue", async () => {
    failValidation(["Le nom est requis."]);
    const req = mockRequest({ body: {} });
    (req as any).file = uploadedFile();
    const res = mockResponse();

    await createSousCategorie(req, res);

    expect(res.statusCode).toBe(422);
    expect(cleanupUploadedFiles).toHaveBeenCalledOnce();
  });

  it("renvoie 404 quand la catégorie parente n'existe pas", async () => {
    CategorieMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await createSousCategorie(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Catégorie introuvable");
    expect(SousCategorieMock.create).not.toHaveBeenCalled();
  });

  it("renvoie 409 quand le nom existe déjà dans la catégorie", async () => {
    SousCategorieMock.findOne.mockReturnValue(mockQuery(makeSousCategorie()));
    const res = mockResponse();

    await createSousCategorie(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(
      "Une sous-catégorie avec ce nom existe déjà dans cette catégorie"
    );
  });

  it("vérifie l'unicité au sein de la catégorie uniquement", async () => {
    const categorieId = oid().toString();

    await createSousCategorie(
      mockRequest({ body: body({ categorieId, nom: "  Smartphones  " }) }),
      mockResponse()
    );

    expect(SousCategorieMock.findOne).toHaveBeenCalledWith({ categorieId, nom: "Smartphones" });
  });

  it("attribue l'ordre 10 à la première sous-catégorie", async () => {
    SousCategorieMock.findOne.mockReturnValue(mockQuery(null));

    await createSousCategorie(mockRequest({ body: body() }), mockResponse());

    expect(SousCategorieMock.create.mock.calls[0]![0][0].ordre).toBe(10);
  });

  it("incrémente l'ordre de 10 par rapport à la dernière", async () => {
    SousCategorieMock.findOne
      .mockReturnValueOnce(mockQuery(null))
      .mockReturnValueOnce(mockQuery(makeSousCategorie({ ordre: 30 })));

    await createSousCategorie(mockRequest({ body: body() }), mockResponse());

    expect(SousCategorieMock.create.mock.calls[0]![0][0].ordre).toBe(40);
  });

  it("renvoie 201 et valide la transaction", async () => {
    const res = mockResponse();

    await createSousCategorie(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(201);
    expect(session.commitTransaction).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("updateSousCategorie", () => {
  it("renvoie 404 quand elle n'existe pas", async () => {
    SousCategorieMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await updateSousCategorie(mockRequest({ params: { id: oid().toString() }, body: {} }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it("ne modifie que les champs fournis", async () => {
    const sc = makeSousCategorie({ nom: "Smartphones", ordre: 10 });
    SousCategorieMock.findById.mockReturnValue(mockQuery(sc));
    const res = mockResponse();

    await updateSousCategorie(
      mockRequest({ params: { id: sc._id.toString() }, body: { ordre: 50 } }),
      res
    );

    expect(sc.ordre).toBe(50);
    expect(sc.nom).toBe("Smartphones");
    expect(sc.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
  });

  it("renvoie 404 quand la nouvelle catégorie parente n'existe pas", async () => {
    const sc = makeSousCategorie();
    SousCategorieMock.findById.mockReturnValue(mockQuery(sc));
    CategorieMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await updateSousCategorie(
      mockRequest({
        params: { id: sc._id.toString() },
        body: { categorieId: oid().toString() },
      }),
      res
    );

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Catégorie introuvable");
  });

  it("supprime l'image sur removeImage", async () => {
    const sc = makeSousCategorie({ image: "/uploads/images/a.jpg" });
    SousCategorieMock.findById.mockReturnValue(mockQuery(sc));

    await updateSousCategorie(
      mockRequest({ params: { id: sc._id.toString() }, body: { removeImage: "true" } }),
      mockResponse()
    );

    expect(deleteFileByUrl).toHaveBeenCalledWith("/uploads/images/a.jpg");
    expect(sc.image).toBeNull();
  });
});

// ─────────────────────────────────────────────
describe("reorderSousCategories", () => {
  it("réécrit les ordres par pas de 10", async () => {
    const ids = [oid().toString(), oid().toString()];
    const res = mockResponse();

    await reorderSousCategories(mockRequest({ body: { orderedIds: ids } }), res);

    const ops = SousCategorieMock.bulkWrite.mock.calls[0]![0];
    expect(ops[0].updateOne.update.ordre).toBe(10);
    expect(ops[1].updateOne.update.ordre).toBe(20);
    expect(res.statusCode).toBe(200);
  });

  it("refuse un tableau vide", async () => {
    const res = mockResponse();

    await reorderSousCategories(mockRequest({ body: { orderedIds: [] } }), res);

    expect(res.statusCode).toBe(400);
    expect(SousCategorieMock.bulkWrite).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("deleteSousCategorie", () => {
  it("effectue une suppression logique", async () => {
    const sc = makeSousCategorie();
    SousCategorieMock.findById.mockReturnValue(mockQuery(sc));
    const res = mockResponse();

    await deleteSousCategorie(mockRequest({ params: { id: sc._id.toString() } }), res);

    expect(sc.deletedAt).toBeInstanceOf(Date);
    expect(sc.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
  });

  it("renvoie 404 quand elle est introuvable", async () => {
    SousCategorieMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await deleteSousCategorie(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
  });
});
