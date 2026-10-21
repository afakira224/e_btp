import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";
import {
  requireAuth,
  requireRole,
  requireSelf,
} from "../../../../src/shared/middlewares/auth.middleware.js";
import { EntityType } from "../../../../src/models/user.model.js";
import {
  mockExpressSession,
  mockRequest,
  mockResponse,
} from "../../../helpers/express.mock.js";
import { oid } from "../../../helpers/factories.js";

/** Requête portant une session déjà authentifiée. */
const authenticated = (user: { id: string; entityType: EntityType }) =>
  mockRequest({ session: mockExpressSession(user) });

let next: NextFunction;

beforeEach(() => {
  next = vi.fn();
});

// ─────────────────────────────────────────────
describe("requireAuth", () => {
  it("laisse passer une session authentifiée et renseigne req.user", () => {
    const id = oid().toString();
    const req = authenticated({ id, entityType: EntityType.USER });
    const res = mockResponse();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({ id, entityType: EntityType.USER });
    expect(res.status).not.toHaveBeenCalled();
  });

  it("renvoie 401 quand la session ne porte aucun utilisateur", () => {
    const res = mockResponse();

    requireAuth(mockRequest(), res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Session absente ou expirée, veuillez vous connecter.");
    expect(next).not.toHaveBeenCalled();
  });

  it("renvoie 401 quand aucune session n'existe sur la requête", () => {
    const req = mockRequest();
    (req as any).session = undefined;
    const res = mockResponse();

    requireAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("renvoie 401 quand l'identité en session est incomplète", () => {
    const res = mockResponse();

    requireAuth(
      mockRequest({ session: mockExpressSession({ entityType: EntityType.USER }) }),
      res,
      next
    );

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("ignore un en-tête Authorization : seule la session fait foi", () => {
    const res = mockResponse();

    requireAuth(
      mockRequest({ headers: { authorization: "Bearer un-token-forge" } }),
      res,
      next
    );

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("normalise l'identifiant en chaîne", () => {
    const id = oid();
    const req = authenticated({ id: id as any, entityType: EntityType.ADMIN });

    requireAuth(req, mockResponse(), next);

    expect(req.user).toEqual({ id: id.toString(), entityType: EntityType.ADMIN });
  });
});

// ─────────────────────────────────────────────
describe("requireRole", () => {
  const withUser = (entityType: EntityType) => {
    const req = mockRequest();
    req.user = { id: oid().toString(), entityType };
    return req;
  };

  it("laisse passer un rôle autorisé", () => {
    requireRole(EntityType.ADMIN)(withUser(EntityType.ADMIN), mockResponse(), next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("accepte l'un quelconque des rôles listés", () => {
    const middleware = requireRole(EntityType.ADMIN, EntityType.SHOP);

    middleware(withUser(EntityType.SHOP), mockResponse(), next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("renvoie 403 pour un rôle non autorisé", () => {
    const res = mockResponse();

    requireRole(EntityType.ADMIN)(withUser(EntityType.USER), res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("renvoie 401 quand aucun utilisateur n'est authentifié", () => {
    const res = mockResponse();

    requireRole(EntityType.ADMIN)(mockRequest(), res, next);

    expect(res.statusCode).toBe(401);
  });

  it("ne donne aucun privilège implicite au rôle admin sur une liste qui l'exclut", () => {
    const res = mockResponse();

    requireRole(EntityType.SHOP)(withUser(EntityType.ADMIN), res, next);

    expect(res.statusCode).toBe(403);
  });
});

// ─────────────────────────────────────────────
describe("requireSelf", () => {
  const userId = oid().toString();
  const autreId = oid().toString();

  const asUser = (
    entityType: EntityType,
    init: Parameters<typeof mockRequest>[0] = {}
  ) => {
    const req = mockRequest(init);
    req.user = { id: userId, entityType };
    return req;
  };

  it("laisse passer quand l'utilisateur agit sur ses propres données", () => {
    requireSelf()(asUser(EntityType.USER, { params: { userId } }), mockResponse(), next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("renvoie 403 quand il vise les données d'un autre", () => {
    const res = mockResponse();

    requireSelf()(asUser(EntityType.USER, { params: { userId: autreId } }), res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Vous ne pouvez accéder qu'à vos propres données.");
    expect(next).not.toHaveBeenCalled();
  });

  it("autorise un administrateur à agir pour autrui", () => {
    requireSelf()(asUser(EntityType.ADMIN, { params: { userId: autreId } }), mockResponse(), next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("lit l'identifiant dans le corps de la requête", () => {
    const res = mockResponse();

    requireSelf("body", "userId")(
      asUser(EntityType.USER, { body: { userId: autreId } }),
      res,
      next
    );

    expect(res.statusCode).toBe(403);
  });

  it("lit l'identifiant dans la query string", () => {
    requireSelf("query", "userId")(
      asUser(EntityType.USER, { query: { userId } }),
      mockResponse(),
      next
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it("renvoie 401 sans utilisateur authentifié", () => {
    const res = mockResponse();

    requireSelf()(mockRequest({ params: { userId } }), res, next);

    expect(res.statusCode).toBe(401);
  });

  it("laisse passer quand la requête ne cible aucun utilisateur en particulier", () => {
    // Ex. GET /orders sans filtre : le contrôleur applique sa propre restriction.
    requireSelf("query", "userId")(asUser(EntityType.USER), mockResponse(), next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("compare les identifiants sous forme de chaîne", () => {
    const req = mockRequest({ params: { userId } });
    req.user = { id: userId, entityType: EntityType.USER };

    requireSelf()(req, mockResponse(), next);

    expect(next).toHaveBeenCalledOnce();
  });
});
