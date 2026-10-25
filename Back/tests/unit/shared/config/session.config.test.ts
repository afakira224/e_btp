import { describe, it, expect, vi } from "vitest";
import mongoose from "mongoose";
import { SESSIONS_COLLECTION, updateUserSessionsRole } from "../../../../src/shared/config/session.config.js";
import { EntityType } from "../../../../src/models/user.model.js";

// ─────────────────────────────────────────────
//  updateUserSessionsRole : un compte qui change de type (boutique approuvée)
//  doit le voir dans ses sessions déjà ouvertes, sinon requireRole lui
//  refuse l'espace vendeur jusqu'à sa prochaine connexion.
// ─────────────────────────────────────────────
describe("updateUserSessionsRole", () => {
  const spyCollection = (result: { modifiedCount?: number }) => {
    const updateMany = vi.fn().mockResolvedValue(result);
    const collection = vi
      .spyOn(mongoose.connection, "collection")
      .mockReturnValue({ updateMany } as unknown as ReturnType<typeof mongoose.connection.collection>);
    return { updateMany, collection };
  };

  it("réécrit le type de compte dans toutes les sessions de l'utilisateur", async () => {
    const { updateMany, collection } = spyCollection({ modifiedCount: 2 });

    const modified = await updateUserSessionsRole("665f1a2b3c4d5e6f7a8b9c0d", EntityType.SHOP);

    expect(collection).toHaveBeenCalledWith(SESSIONS_COLLECTION);
    expect(updateMany).toHaveBeenCalledWith(
      { "session.user.id": "665f1a2b3c4d5e6f7a8b9c0d" },
      { $set: { "session.user.entityType": "shop" } }
    );
    expect(modified).toBe(2);
  });

  it("renvoie 0 quand le pilote ne donne pas de décompte", async () => {
    spyCollection({});

    await expect(updateUserSessionsRole("665f1a2b3c4d5e6f7a8b9c0d", EntityType.SHOP)).resolves.toBe(0);
  });
});
