import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import mongoose from "mongoose";
import multer from "multer";
import type { NextFunction } from "express";
import {
  HttpError,
  asyncHandler,
  errorHandler,
  notFoundHandler,
} from "../../../../src/shared/middlewares/error.middleware.js";
import { mockRequest, mockResponse } from "../../../helpers/express.mock.js";

let next: NextFunction;
const originalEnv = process.env.NODE_ENV;

beforeEach(() => {
  next = vi.fn();
});

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

// ─────────────────────────────────────────────
describe("HttpError", () => {
  it("porte un code HTTP et un message", () => {
    const error = new HttpError("Panier introuvable", 404);

    expect(error.statusCode).toBe(404);
    expect(error.message).toBe("Panier introuvable");
    expect(error).toBeInstanceOf(Error);
  });

  it("retombe sur 500 par défaut", () => {
    expect(new HttpError("boum").statusCode).toBe(500);
  });
});

// ─────────────────────────────────────────────
describe("notFoundHandler", () => {
  it("renvoie 404 au format BaseResponse avec la route demandée", () => {
    const req = mockRequest();
    (req as any).method = "GET";
    (req as any).originalUrl = "/api/v1/inconnu";
    const res = mockResponse();

    notFoundHandler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Route introuvable : GET /api/v1/inconnu");
  });
});

// ─────────────────────────────────────────────
describe("asyncHandler", () => {
  it("laisse passer un contrôleur qui aboutit", async () => {
    const handler = vi.fn().mockResolvedValue("ok");

    asyncHandler(handler)(mockRequest(), mockResponse(), next);
    await Promise.resolve();

    expect(handler).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });

  it("redirige une promesse rejetée vers next()", async () => {
    const boom = new Error("échec asynchrone");

    asyncHandler(async () => {
      throw boom;
    })(mockRequest(), mockResponse(), next);
    await Promise.resolve();
    await Promise.resolve();

    expect(next).toHaveBeenCalledWith(boom);
  });
});

// ─────────────────────────────────────────────
describe("errorHandler", () => {
  const handle = (error: unknown) => {
    const req = mockRequest();
    (req as any).method = "POST";
    (req as any).originalUrl = "/api/v1/orders";
    const res = mockResponse();

    errorHandler(error, req, res, next);
    return res;
  };

  it("respecte le code porté par une HttpError", () => {
    const res = handle(new HttpError("Stock insuffisant", 400));

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Stock insuffisant");
    expect(res.body.success).toBe(false);
  });

  it("traduit une violation de clé unique en 409", () => {
    const res = handle({ code: 11000, keyValue: { code: "RENTREE10" } });

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toContain("existe déjà");
    expect(res.body.message).toContain("code");
  });

  it("traduit une erreur de validation Mongoose en 400", () => {
    const error = new mongoose.Error.ValidationError();
    error.errors = {
      rating: { message: "La note doit être entre 1 et 5." } as any,
    };

    const res = handle(error);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("La note doit être entre 1 et 5.");
  });

  it("traduit un identifiant Mongo mal formé en 400", () => {
    const res = handle(new mongoose.Error.CastError("ObjectId", "abc", "_id"));

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain("Identifiant invalide");
  });

  it("traduit un dépassement de taille de fichier en 400", () => {
    const res = handle(new multer.MulterError("LIMIT_FILE_SIZE"));

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Le fichier dépasse la taille maximale autorisée.");
  });

  it("traduit les autres erreurs Multer en 400", () => {
    const res = handle(new multer.MulterError("LIMIT_UNEXPECTED_FILE"));

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain("Erreur d'envoi de fichier");
  });

  it("retombe sur 500 pour une erreur inconnue", () => {
    const res = handle(new Error("connexion perdue"));

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("connexion perdue");
  });

  it("masque le détail des erreurs internes en production", () => {
    process.env.NODE_ENV = "production";

    const res = handle(new Error("mot de passe MongoDB refusé"));

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("Erreur interne du serveur");
    expect(res.body.message).not.toContain("MongoDB");
  });

  it("n'altère pas les erreurs métier en production", () => {
    process.env.NODE_ENV = "production";

    const res = handle(new HttpError("Le panier est vide.", 400));

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Le panier est vide.");
  });
});
