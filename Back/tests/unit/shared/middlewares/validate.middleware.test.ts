import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction } from "express";

vi.mock("express-validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("express-validator")>();
  return {
    ...actual,
    validationResult: vi.fn(() => ({ isEmpty: () => true, array: () => [] })),
  };
});

import { validationResult } from "express-validator";
import { validate } from "../../../../src/shared/middlewares/validate.middleware.js";
import { mockRequest, mockResponse } from "../../../helpers/express.mock.js";

let next: NextFunction;

beforeEach(() => {
  next = vi.fn();
  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);
});

const failWith = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({
    isEmpty: () => false,
    array: () => messages.map((msg) => ({ msg })),
  } as any);
};

describe("validate", () => {
  it("appelle next() quand aucune règle n'a échoué", () => {
    const res = mockResponse();

    validate(mockRequest(), res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("renvoie 422 quand une règle échoue", () => {
    failWith(["Le refresh token est requis."]);
    const res = mockResponse();

    validate(mockRequest(), res, next);

    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("Le refresh token est requis.");
    expect(next).not.toHaveBeenCalled();
  });

  it("concatène plusieurs messages avec un séparateur lisible", () => {
    failWith(["Email invalide.", "Mot de passe trop court."]);
    const res = mockResponse();

    validate(mockRequest(), res, next);

    expect(res.body.message).toBe("Email invalide. | Mot de passe trop court.");
  });
});
