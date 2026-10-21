import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

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

// Aucun accès disque : les helpers de fichiers sont simulés.
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
import { Famille } from "../../../src/models/famille.model.js";
import { Categorie } from "../../../src/models/categorie.model.js";
import { SousCategorie } from "../../../src/models/sousCategorie.model.js";
import {
  cleanupUploadedFiles,
  deleteFileByUrl,
  getFileUrl,
} from "../../../src/shared/helpers/fileUpload.js";
import {
  createFamille,
  deleteFamille,
  getFamilleById,
  getFamilles,
  reorderFamilles,
  updateFamille,
} from "../../../src/controllers/familleController.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse, mockSession } from "../../helpers/express.mock.js";
import { makeCategorie, makeFamille, makeSousCategorie, oid } from "../../helpers/factories.js";

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

/** Faux fichier Multer déposé sur le champ "image". */
const uploadedFile = (path = "/tmp/uploads/image-1.jpg") =>
  ({ path, originalname: "image.jpg", mimetype: "image/jpeg", size: 1024 }) as Express.Multer.File;

beforeEach(() => {
  session = mockSession();
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);

  FamilleMock.find.mockReturnValue(mockQuery([]));
  FamilleMock.findOne.mockReturnValue(mockQuery(null));
  FamilleMock.findById.mockReturnValue(mockQuery(null));
  FamilleMock.create.mockImplementation(async (docs: any[]) => [makeFamille(docs[0])]);
  CategorieMock.find.mockReturnValue(mockQuery([]));
  SousCategorieMock.find.mockReturnValue(mockQuery([]));
});

// ─────────────────────────────────────────────
describe("getFamilles", () => {
  it("renvoie les familles triées par ordre", async () => {
    const query = mockQuery([makeFamille({ nom: "Électronique" })]);
    FamilleMock.find.mockReturnValue(query);
    const res = mockResponse();

    await getFamilles(mockRequest(), res);

    expect(FamilleMock.find).toHaveBeenCalledWith({});
    expect(query.sort).toHaveBeenCalledWith({ ordre: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("filtre sur actif=true", async () => {
    await getFamilles(mockRequest({ query: { actif: "true" } }), mockResponse());

    expect(FamilleMock.find).toHaveBeenCalledWith({ actif: true });
  });

  it("filtre sur actif=false", async () => {
    await getFamilles(mockRequest({ query: { actif: "false" } }), mockResponse());

    expect(FamilleMock.find).toHaveBeenCalledWith({ actif: false });
  });

  it("imbrique catégories et sous-catégories dans chaque famille", async () => {
    const famille = makeFamille();
    const categorie = makeCategorie({ familleId: famille._id, nom: "Téléphonie" });
    const sousCategorie = makeSousCategorie({ categorieId: categorie._id, nom: "Smartphones" });

    FamilleMock.find.mockReturnValue(mockQuery([famille]));
    CategorieMock.find.mockReturnValue(mockQuery([categorie]));
    SousCategorieMock.find.mockReturnValue(mockQuery([sousCategorie]));
    const res = mockResponse();

    await getFamilles(mockRequest(), res);

    expect(res.body.data[0].categories).toHaveLength(1);
    expect(res.body.data[0].categories[0].nom).toBe("Téléphonie");
    expect(res.body.data[0].categories[0].sousCategories[0].nom).toBe("Smartphones");
  });

  it("renvoie 500 en cas d'erreur", async () => {
    FamilleMock.find.mockImplementation(() => {
      throw new Error("connexion perdue");
    });
    const res = mockResponse();

    await getFamilles(mockRequest(), res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
describe("getFamilleById", () => {
  it("renvoie la famille avec sa taxonomie", async () => {
    const famille = makeFamille({ nom: "Électronique" });
    const categorie = makeCategorie({ familleId: famille._id });
    FamilleMock.findById.mockReturnValue(mockQuery(famille));
    CategorieMock.find.mockReturnValue(mockQuery([categorie]));
    SousCategorieMock.find.mockReturnValue(mockQuery([]));
    const res = mockResponse();

    await getFamilleById(mockRequest({ params: { id: famille._id.toString() } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.nom).toBe("Électronique");
    expect(res.body.data.categories).toHaveLength(1);
  });

  it("ne cherche pas de sous-catégorie quand la famille n'a aucune catégorie", async () => {
    FamilleMock.findById.mockReturnValue(mockQuery(makeFamille()));
    CategorieMock.find.mockReturnValue(mockQuery([]));

    await getFamilleById(mockRequest({ params: { id: oid().toString() } }), mockResponse());

    expect(SousCategorieMock.find).not.toHaveBeenCalled();
  });

  it("renvoie 404 quand la famille est introuvable", async () => {
    FamilleMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await getFamilleById(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Famille non trouvée");
  });
});

// ─────────────────────────────────────────────
describe("createFamille", () => {
  it("renvoie 422 et nettoie le fichier quand la validation échoue", async () => {
    failValidation(["Le nom est requis."]);
    const req = mockRequest({ body: {} });
    (req as any).file = uploadedFile();
    const res = mockResponse();

    await createFamille(req, res);

    expect(res.statusCode).toBe(422);
    expect(cleanupUploadedFiles).toHaveBeenCalledOnce();
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it("renvoie 409 quand le nom existe déjà", async () => {
    FamilleMock.findOne.mockReturnValue(mockQuery(makeFamille({ nom: "Électronique" })));
    const res = mockResponse();

    await createFamille(mockRequest({ body: { nom: "Électronique" } }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe("Une famille avec ce nom existe déjà");
    expect(FamilleMock.create).not.toHaveBeenCalled();
  });

  it("compare les noms sans espaces superflus", async () => {
    await createFamille(mockRequest({ body: { nom: "  Maison  " } }), mockResponse());

    expect(FamilleMock.findOne).toHaveBeenCalledWith({ nom: "Maison" });
  });

  it("attribue le premier ordre à 10 quand aucune famille n'existe", async () => {
    FamilleMock.findOne.mockReturnValue(mockQuery(null));

    await createFamille(mockRequest({ body: { nom: "Maison" } }), mockResponse());

    expect(FamilleMock.create.mock.calls[0]![0][0].ordre).toBe(10);
  });

  it("incrémente l'ordre de 10 par rapport à la dernière famille", async () => {
    FamilleMock.findOne
      .mockReturnValueOnce(mockQuery(null)) // contrôle d'unicité du nom
      .mockReturnValueOnce(mockQuery(makeFamille({ ordre: 40 }))); // dernière famille

    await createFamille(mockRequest({ body: { nom: "Maison" } }), mockResponse());

    expect(FamilleMock.create.mock.calls[0]![0][0].ordre).toBe(50);
  });

  it("respecte un ordre fourni explicitement", async () => {
    await createFamille(mockRequest({ body: { nom: "Maison", ordre: 5 } }), mockResponse());

    expect(FamilleMock.create.mock.calls[0]![0][0].ordre).toBe(5);
  });

  it("enregistre l'URL publique du fichier envoyé", async () => {
    const req = mockRequest({ body: { nom: "Maison" } });
    (req as any).file = uploadedFile("/tmp/uploads/photo.jpg");

    await createFamille(req, mockResponse());

    expect(getFileUrl).toHaveBeenCalledWith("/tmp/uploads/photo.jpg");
    expect(FamilleMock.create.mock.calls[0]![0][0].image).toBe("/uploads/images/photo.jpg");
  });

  it("retombe sur l'URL du corps quand aucun fichier n'est envoyé", async () => {
    await createFamille(
      mockRequest({ body: { nom: "Maison", image: "https://cdn.example.com/a.jpg" } }),
      mockResponse()
    );

    expect(FamilleMock.create.mock.calls[0]![0][0].image).toBe("https://cdn.example.com/a.jpg");
  });

  it("met l'image à null sans fichier ni URL", async () => {
    await createFamille(mockRequest({ body: { nom: "Maison" } }), mockResponse());

    expect(FamilleMock.create.mock.calls[0]![0][0].image).toBeNull();
  });

  it("renvoie 201 et valide la transaction", async () => {
    const res = mockResponse();

    await createFamille(mockRequest({ body: { nom: "Maison" } }), res);

    expect(res.statusCode).toBe(201);
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it("nettoie le fichier et annule la transaction en cas d'erreur", async () => {
    FamilleMock.create.mockRejectedValue(new Error("écriture refusée"));
    const req = mockRequest({ body: { nom: "Maison" } });
    (req as any).file = uploadedFile();
    const res = mockResponse();

    await createFamille(req, res);

    expect(res.statusCode).toBe(500);
    expect(cleanupUploadedFiles).toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("updateFamille", () => {
  it("renvoie 404 quand la famille n'existe pas", async () => {
    FamilleMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await updateFamille(mockRequest({ params: { id: oid().toString() }, body: {} }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it("ne modifie que les champs fournis", async () => {
    const famille = makeFamille({ nom: "Électronique", ordre: 10, actif: true });
    FamilleMock.findById.mockReturnValue(mockQuery(famille));
    const res = mockResponse();

    await updateFamille(
      mockRequest({ params: { id: famille._id.toString() }, body: { ordre: 30 } }),
      res
    );

    expect(famille.ordre).toBe(30);
    expect(famille.nom).toBe("Électronique");
    expect(famille.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
  });

  it("renvoie 409 quand le nouveau nom est déjà pris", async () => {
    const famille = makeFamille({ nom: "Électronique" });
    FamilleMock.findById.mockReturnValue(mockQuery(famille));
    FamilleMock.findOne.mockReturnValue(mockQuery(makeFamille({ nom: "Maison" })));
    const id = famille._id.toString();
    const res = mockResponse();

    await updateFamille(mockRequest({ params: { id }, body: { nom: "Maison" } }), res);

    expect(FamilleMock.findOne).toHaveBeenCalledWith({ nom: "Maison", _id: { $ne: id } });
    expect(res.statusCode).toBe(409);
    expect(famille.save).not.toHaveBeenCalled();
  });

  it("ne vérifie pas l'unicité quand le nom est inchangé", async () => {
    const famille = makeFamille({ nom: "Électronique" });
    FamilleMock.findById.mockReturnValue(mockQuery(famille));

    await updateFamille(
      mockRequest({ params: { id: famille._id.toString() }, body: { nom: "Électronique" } }),
      mockResponse()
    );

    expect(FamilleMock.findOne).not.toHaveBeenCalled();
  });

  it("remplace l'image et supprime l'ancienne", async () => {
    const famille = makeFamille({ image: "/uploads/images/ancienne.jpg" });
    FamilleMock.findById.mockReturnValue(mockQuery(famille));
    const req = mockRequest({ params: { id: famille._id.toString() }, body: {} });
    (req as any).file = uploadedFile("/tmp/uploads/nouvelle.jpg");

    await updateFamille(req, mockResponse());

    expect(deleteFileByUrl).toHaveBeenCalledWith("/uploads/images/ancienne.jpg");
    expect(famille.image).toBe("/uploads/images/nouvelle.jpg");
  });

  it("supprime l'image sur removeImage", async () => {
    const famille = makeFamille({ image: "/uploads/images/ancienne.jpg" });
    FamilleMock.findById.mockReturnValue(mockQuery(famille));

    await updateFamille(
      mockRequest({ params: { id: famille._id.toString() }, body: { removeImage: "true" } }),
      mockResponse()
    );

    expect(deleteFileByUrl).toHaveBeenCalledWith("/uploads/images/ancienne.jpg");
    expect(famille.image).toBeNull();
  });

  it("accepte removeImage sous forme de booléen", async () => {
    const famille = makeFamille({ image: "/uploads/images/a.jpg" });
    FamilleMock.findById.mockReturnValue(mockQuery(famille));

    await updateFamille(
      mockRequest({ params: { id: famille._id.toString() }, body: { removeImage: true } }),
      mockResponse()
    );

    expect(famille.image).toBeNull();
  });
});

// ─────────────────────────────────────────────
describe("reorderFamilles", () => {
  it("réécrit les ordres par pas de 10", async () => {
    const ids = [oid().toString(), oid().toString(), oid().toString()];
    const res = mockResponse();

    await reorderFamilles(mockRequest({ body: { orderedIds: ids } }), res);

    const ops = FamilleMock.bulkWrite.mock.calls[0]![0];
    expect(ops).toHaveLength(3);
    expect(ops[0].updateOne).toEqual({ filter: { _id: ids[0] }, update: { ordre: 10 } });
    expect(ops[2].updateOne.update.ordre).toBe(30);
    expect(res.statusCode).toBe(200);
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it("refuse un tableau vide", async () => {
    const res = mockResponse();

    await reorderFamilles(mockRequest({ body: { orderedIds: [] } }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("orderedIds doit être un tableau non vide");
    expect(FamilleMock.bulkWrite).not.toHaveBeenCalled();
  });

  it("refuse une valeur qui n'est pas un tableau", async () => {
    const res = mockResponse();

    await reorderFamilles(mockRequest({ body: { orderedIds: "abc" } }), res);

    expect(res.statusCode).toBe(400);
  });
});

// ─────────────────────────────────────────────
describe("deleteFamille", () => {
  it("effectue une suppression logique", async () => {
    const famille = makeFamille();
    FamilleMock.findById.mockReturnValue(mockQuery(famille));
    const res = mockResponse();

    await deleteFamille(mockRequest({ params: { id: famille._id.toString() } }), res);

    expect(famille.deletedAt).toBeInstanceOf(Date);
    expect(famille.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it("renvoie 404 quand la famille est introuvable", async () => {
    FamilleMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await deleteFamille(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});
