import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

vi.mock("../../../src/models/boutique.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Shop: mockModel() };
});

vi.mock("../../../src/models/user.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { User: mockModel() };
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
import { Shop } from "../../../src/models/boutique.model.js";
import { User } from "../../../src/models/user.model.js";
import { cleanupUploadedFiles, deleteFileByUrl } from "../../../src/shared/helpers/fileUpload.js";
import {
  createShop,
  deleteShop,
  getShopById,
  getShops,
  updateShop,
} from "../../../src/controllers/shop.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse, mockSession } from "../../helpers/express.mock.js";
import { makeShop, makeUser, oid } from "../../helpers/factories.js";

const ShopMock = Shop as unknown as Record<string, any>;
const UserMock = User as unknown as Record<string, any>;

let session: ReturnType<typeof mockSession>;

const failValidation = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({
    isEmpty: () => false,
    array: () => messages.map((msg) => ({ msg })),
  } as any);
};

const uploadedFile = (path = "/tmp/uploads/logo.png") =>
  ({ path, originalname: "logo.png", mimetype: "image/png", size: 2048 }) as Express.Multer.File;

beforeEach(() => {
  session = mockSession();
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);

  ShopMock.find.mockReturnValue(mockQuery([]));
  ShopMock.findOne.mockReturnValue(mockQuery(null));
  ShopMock.findById.mockReturnValue(mockQuery(null));
  ShopMock.findByIdAndUpdate.mockReturnValue(mockQuery(null));
  ShopMock.countDocuments.mockReturnValue(mockQuery(0));
  ShopMock.create.mockImplementation(async (docs: any[]) => [makeShop(docs[0])]);
  UserMock.findById.mockReturnValue(mockQuery(makeUser()));
});

// ─────────────────────────────────────────────
describe("createShop", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    ownerId: oid().toString(),
    nom: "Boutique Kaloum",
    ...over,
  });

  it("renvoie 422 et nettoie le fichier quand la validation échoue", async () => {
    failValidation(["Le nom est requis."]);
    const req = mockRequest({ body: {} });
    (req as any).file = uploadedFile();
    const res = mockResponse();

    await createShop(req, res);

    expect(res.statusCode).toBe(422);
    expect(cleanupUploadedFiles).toHaveBeenCalledOnce();
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it("renvoie 409 quand le propriétaire a déjà une boutique de ce nom", async () => {
    ShopMock.findOne.mockReturnValue(mockQuery(makeShop()));
    const res = mockResponse();

    await createShop(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe("Une boutique avec ce nom existe déjà.");
    expect(ShopMock.create).not.toHaveBeenCalled();
  });

  it("renvoie 404 quand le propriétaire n'existe pas", async () => {
    UserMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await createShop(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toContain("n'existe pas");
  });

  it("renvoie 201 avec la boutique créée", async () => {
    const res = mockResponse();

    await createShop(mockRequest({ body: body() }), res);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it("enregistre l'URL du logo envoyé", async () => {
    const req = mockRequest({ body: body() });
    (req as any).file = uploadedFile("/tmp/uploads/kaloum.png");

    await createShop(req, mockResponse());

    expect(ShopMock.create.mock.calls[0]![0][0].logo).toBe("/uploads/images/kaloum.png");
  });

  it("retombe sur l'URL du corps quand aucun fichier n'est envoyé", async () => {
    await createShop(
      mockRequest({ body: body({ logo: "https://cdn.example.com/l.png" }) }),
      mockResponse()
    );

    expect(ShopMock.create.mock.calls[0]![0][0].logo).toBe("https://cdn.example.com/l.png");
  });

  it("met le logo à null sans fichier ni URL", async () => {
    await createShop(mockRequest({ body: body() }), mockResponse());

    expect(ShopMock.create.mock.calls[0]![0][0].logo).toBeNull();
  });

  it("nettoie le fichier et annule la transaction en cas d'erreur", async () => {
    ShopMock.create.mockRejectedValue(new Error("écriture refusée"));
    const req = mockRequest({ body: body() });
    (req as any).file = uploadedFile();
    const res = mockResponse();

    await createShop(req, res);

    expect(res.statusCode).toBe(500);
    expect(cleanupUploadedFiles).toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("getShops", () => {
  it("pagine avec les valeurs par défaut", async () => {
    const query = mockQuery([]);
    ShopMock.find.mockReturnValue(query);
    const res = mockResponse();

    await getShops(mockRequest(), res);

    expect(query.skip).toHaveBeenCalledWith(0);
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(res.body.data.page).toBe(1);
  });

  it("filtre par propriétaire", async () => {
    const ownerId = oid().toString();

    await getShops(mockRequest({ query: { ownerId } }), mockResponse());

    expect(ShopMock.find).toHaveBeenCalledWith({ ownerId });
  });

  it("recherche par nom, insensible à la casse", async () => {
    await getShops(mockRequest({ query: { search: "kaloum" } }), mockResponse());

    expect(ShopMock.find).toHaveBeenCalledWith({
      nom: { $regex: "kaloum", $options: "i" },
    });
  });

  it("plafonne la taille de page à 100", async () => {
    const query = mockQuery([]);
    ShopMock.find.mockReturnValue(query);

    await getShops(mockRequest({ query: { limit: "500" } }), mockResponse());

    expect(query.limit).toHaveBeenCalledWith(100);
  });

  it("calcule le nombre de pages", async () => {
    ShopMock.countDocuments.mockReturnValue(mockQuery(23));
    const res = mockResponse();

    await getShops(mockRequest({ query: { limit: "10" } }), res);

    expect(res.body.data.total).toBe(23);
    expect(res.body.data.totalPages).toBe(3);
  });

  it("renvoie 500 en cas d'erreur", async () => {
    ShopMock.find.mockImplementation(() => {
      throw new Error("panne");
    });
    const res = mockResponse();

    await getShops(mockRequest(), res);

    expect(res.statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
describe("getShopById", () => {
  it("renvoie la boutique demandée", async () => {
    const shop = makeShop({ nom: "Boutique Madina" });
    ShopMock.findById.mockReturnValue(mockQuery(shop));
    const res = mockResponse();

    await getShopById(mockRequest({ params: { id: shop._id.toString() } }), res);

    expect(res.body.data.nom).toBe("Boutique Madina");
  });

  it("renvoie 404 quand la boutique est introuvable", async () => {
    ShopMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await getShopById(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Boutique introuvable.");
  });
});

// ─────────────────────────────────────────────
describe("updateShop", () => {
  it("renvoie 404 quand la boutique n'existe pas", async () => {
    ShopMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await updateShop(mockRequest({ params: { id: oid().toString() }, body: {} }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it("ne modifie que les champs fournis", async () => {
    const shop = makeShop({ nom: "Kaloum", telephone: "622000000" });
    ShopMock.findById.mockReturnValue(mockQuery(shop));
    const res = mockResponse();

    await updateShop(
      mockRequest({ params: { id: shop._id.toString() }, body: { nom: "Kaloum Plus" } }),
      res
    );

    expect(shop.nom).toBe("Kaloum Plus");
    expect(shop.telephone).toBe("622000000");
    expect(shop.save).toHaveBeenCalledWith({ session });
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it("remplace le logo et supprime l'ancien", async () => {
    const shop = makeShop({ logo: "/uploads/images/ancien.png" });
    ShopMock.findById.mockReturnValue(mockQuery(shop));
    const req = mockRequest({ params: { id: shop._id.toString() }, body: {} });
    (req as any).file = uploadedFile("/tmp/uploads/nouveau.png");

    await updateShop(req, mockResponse());

    expect(deleteFileByUrl).toHaveBeenCalledWith("/uploads/images/ancien.png");
    expect(shop.logo).toBe("/uploads/images/nouveau.png");
  });

  it("supprime le logo sur removeLogo", async () => {
    const shop = makeShop({ logo: "/uploads/images/ancien.png" });
    ShopMock.findById.mockReturnValue(mockQuery(shop));

    await updateShop(
      mockRequest({ params: { id: shop._id.toString() }, body: { removeLogo: "true" } }),
      mockResponse()
    );

    expect(deleteFileByUrl).toHaveBeenCalledWith("/uploads/images/ancien.png");
    expect(shop.logo).toBeNull();
  });

  it("ne touche pas au logo quand rien ne le concerne", async () => {
    const shop = makeShop({ logo: "/uploads/images/inchange.png" });
    ShopMock.findById.mockReturnValue(mockQuery(shop));

    await updateShop(
      mockRequest({ params: { id: shop._id.toString() }, body: { nom: "Autre" } }),
      mockResponse()
    );

    expect(deleteFileByUrl).not.toHaveBeenCalled();
    expect(shop.logo).toBe("/uploads/images/inchange.png");
  });
});

// ─────────────────────────────────────────────
describe("deleteShop", () => {
  it("effectue une suppression logique", async () => {
    const shop = makeShop();
    ShopMock.findByIdAndUpdate.mockReturnValue(mockQuery(shop));
    const id = shop._id.toString();
    const res = mockResponse();

    await deleteShop(mockRequest({ params: { id } }), res);

    expect(ShopMock.findByIdAndUpdate).toHaveBeenCalledWith(
      id,
      { deletedAt: expect.any(Date) },
      { new: true, session }
    );
    expect(res.body.data).toBeNull();
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it("renvoie 404 quand la boutique est introuvable", async () => {
    ShopMock.findByIdAndUpdate.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await deleteShop(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});
