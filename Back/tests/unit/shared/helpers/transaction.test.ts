import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import { runInTransaction } from "../../../../src/shared/helpers/transaction.js";
import { mockSession } from "../../../helpers/express.mock.js";

let session: ReturnType<typeof mockSession>;

beforeEach(() => {
  session = mockSession();
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
});

describe("runInTransaction", () => {
  it("valide la transaction et renvoie le résultat du travail", async () => {
    const work = vi.fn(async () => 42);

    await expect(runInTransaction(work)).resolves.toBe(42);

    expect(work).toHaveBeenCalledWith(session);
    expect(session.startTransaction).toHaveBeenCalled();
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(session.abortTransaction).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it("annule la transaction et relance l'erreur du travail", async () => {
    const failure = new Error("conflit d'écriture");

    await expect(runInTransaction(async () => Promise.reject(failure))).rejects.toBe(failure);

    expect(session.commitTransaction).not.toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it("annule quand la validation échoue, et ferme toujours la session", async () => {
    session.commitTransaction.mockRejectedValueOnce(new Error("validation impossible"));

    await expect(runInTransaction(async () => "ok")).rejects.toThrow("validation impossible");

    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });
});
