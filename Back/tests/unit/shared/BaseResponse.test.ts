import { describe, it, expect } from "vitest";
import BaseResponse from "../../../src/shared/BaseResponse/BaseResponse.js";

describe("BaseResponse", () => {
  describe("constructeur", () => {
    it("affecte tous les champs fournis", () => {
      const res = new BaseResponse(true, "ok", 200, { id: 1 });

      expect(res.success).toBe(true);
      expect(res.message).toBe("ok");
      expect(res.statusCode).toBe(200);
      expect(res.data).toEqual({ id: 1 });
    });

    it("met data à null par défaut", () => {
      expect(new BaseResponse(false, "ko", 400).data).toBeNull();
    });
  });

  describe("réponses de succès", () => {
    it("WithSuccess renvoie 200 avec les données", () => {
      const res = BaseResponse.WithSuccess({ total: 3 });

      expect(res).toMatchObject({
        success: true,
        statusCode: 200,
        message: "Opération réussie",
        data: { total: 3 },
      });
    });

    it("WithSuccess accepte un message personnalisé", () => {
      expect(BaseResponse.WithSuccess(null, "Panier récupéré").message).toBe("Panier récupéré");
    });

    it("Created renvoie 201", () => {
      const res = BaseResponse.Created({ id: "abc" });

      expect(res.statusCode).toBe(201);
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ id: "abc" });
    });
  });

  describe("réponses d'erreur", () => {
    // [méthode, code HTTP attendu]
    const cases = [
      ["BadRequest", 400],
      ["UnAuthorized", 401],
      ["Forbidden", 403],
      ["NotFound", 404],
      ["Conflict", 409],
      ["ServerError", 500],
    ] as const;

    it.each(cases)("%s renvoie le code %i, success=false et data=null", (method, code) => {
      const res = (BaseResponse[method] as (m?: string) => BaseResponse)();

      expect(res.statusCode).toBe(code);
      expect(res.success).toBe(false);
      expect(res.data).toBeNull();
      expect(res.message).not.toHaveLength(0);
    });

    it.each(cases)("%s accepte un message personnalisé", (method) => {
      const res = (BaseResponse[method] as (m?: string) => BaseResponse)("message métier");

      expect(res.message).toBe("message métier");
    });
  });
});
