import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

vi.mock("../../../src/models/address.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Address: mockModel() };
});

vi.mock("../../../src/models/user.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { User: mockModel() };
});

vi.mock("express-validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("express-validator")>();
  return {
    ...actual,
    validationResult: vi.fn(() => ({ isEmpty: () => true, array: () => [] })),
  };
});

import { validationResult } from "express-validator";
import { Address } from "../../../src/models/address.model.js";
import { User } from "../../../src/models/user.model.js";
import {
  createAddress,
  deleteAddress,
  getAddressById,
  getAddresses,
  setDefaultAddress,
  updateAddress,
} from "../../../src/controllers/address.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse, mockSession } from "../../helpers/express.mock.js";
import { makeAddress, makeUser, oid } from "../../helpers/factories.js";

const AddressMock = Address as unknown as Record<string, any>;
const UserMock = User as unknown as Record<string, any>;

let session: ReturnType<typeof mockSession>;

const failValidation = (messages: string[]) => {
  vi.mocked(validationResult).mockReturnValueOnce({
    isEmpty: () => false,
    array: () => messages.map((msg) => ({ msg })),
  } as any);
};

const validBody = {
  telephone: "620123456",
  adresse: "Rue KA-020",
  ville: "Conakry",
};

beforeEach(() => {
  session = mockSession();
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);

  vi.mocked(validationResult).mockReturnValue({ isEmpty: () => true, array: () => [] } as any);

  UserMock.findById.mockReturnValue(mockQuery(makeUser()));
  AddressMock.find.mockReturnValue(mockQuery([]));
  AddressMock.findOne.mockReturnValue(mockQuery(null));
  AddressMock.findById.mockReturnValue(mockQuery(null));
  AddressMock.countDocuments.mockReturnValue(mockQuery(0));
  AddressMock.updateMany.mockReturnValue(mockQuery({ acknowledged: true }));
  AddressMock.create.mockImplementation(async (docs: any[]) => [makeAddress(docs[0])]);
});

// ─────────────────────────────────────────────
describe("createAddress", () => {
  it("renvoie 422 et annule la transaction quand la validation échoue", async () => {
    failValidation(["La ville est requise."]);
    const res = mockResponse();

    await createAddress(mockRequest(), res);

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toBe("La ville est requise.");
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(AddressMock.create).not.toHaveBeenCalled();
  });

  it("renvoie 404 quand l'utilisateur n'existe pas", async () => {
    UserMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await createAddress(mockRequest({ body: { userId: oid().toString(), ...validBody } }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Utilisateur introuvable");
  });

  it("renvoie 201 avec l'adresse créée", async () => {
    const res = mockResponse();

    await createAddress(mockRequest({ body: { userId: oid().toString(), ...validBody } }), res);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ville).toBe("Conakry");
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it("force la première adresse d'un utilisateur en adresse par défaut", async () => {
    AddressMock.countDocuments.mockReturnValue(mockQuery(0));

    await createAddress(
      mockRequest({ body: { userId: oid().toString(), ...validBody, isDefault: false } }),
      mockResponse()
    );

    expect(AddressMock.create.mock.calls[0]![0][0].isDefault).toBe(true);
  });

  it("ne force pas le défaut quand l'utilisateur a déjà des adresses", async () => {
    AddressMock.countDocuments.mockReturnValue(mockQuery(3));

    await createAddress(
      mockRequest({ body: { userId: oid().toString(), ...validBody } }),
      mockResponse()
    );

    expect(AddressMock.create.mock.calls[0]![0][0].isDefault).toBe(false);
    expect(AddressMock.updateMany).not.toHaveBeenCalled();
  });

  it("retire le drapeau par défaut des autres adresses quand isDefault est demandé", async () => {
    const userId = oid().toString();
    AddressMock.countDocuments.mockReturnValue(mockQuery(2));

    await createAddress(
      mockRequest({ body: { userId, ...validBody, isDefault: true } }),
      mockResponse()
    );

    expect(AddressMock.updateMany).toHaveBeenCalledWith(
      { userId, isDefault: true },
      { isDefault: false },
      { session }
    );
  });

  it("renvoie 500 et annule la transaction en cas d'erreur", async () => {
    AddressMock.create.mockRejectedValue(new Error("index en double"));
    const res = mockResponse();

    await createAddress(mockRequest({ body: { userId: oid().toString(), ...validBody } }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("index en double");
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("getAddresses", () => {
  it("trie les adresses avec la valeur par défaut en tête", async () => {
    const query = mockQuery([makeAddress({ isDefault: true }), makeAddress()]);
    AddressMock.find.mockReturnValue(query);
    const userId = oid().toString();
    const res = mockResponse();

    await getAddresses(mockRequest({ query: { userId } }), res);

    expect(AddressMock.find).toHaveBeenCalledWith({ userId });
    expect(query.sort).toHaveBeenCalledWith({ isDefault: -1, createdAt: -1 });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it("renvoie une liste vide quand l'utilisateur n'a aucune adresse", async () => {
    AddressMock.find.mockReturnValue(mockQuery([]));
    const res = mockResponse();

    await getAddresses(mockRequest({ query: { userId: oid().toString() } }), res);

    expect(res.body.data).toEqual([]);
  });

  it("renvoie 422 quand userId est absent", async () => {
    failValidation(["Le paramètre userId est requis."]);
    const res = mockResponse();

    await getAddresses(mockRequest(), res);

    expect(res.statusCode).toBe(422);
  });
});

// ─────────────────────────────────────────────
describe("getAddressById", () => {
  it("renvoie l'adresse demandée", async () => {
    const address = makeAddress({ ville: "Kindia" });
    AddressMock.findById.mockReturnValue(mockQuery(address));
    const res = mockResponse();

    await getAddressById(mockRequest({ params: { id: address._id.toString() } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.ville).toBe("Kindia");
    expect(res.body.data.id).toBe(address._id.toString());
  });

  it("renvoie 404 quand l'adresse est introuvable", async () => {
    AddressMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await getAddressById(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Adresse non trouvée");
  });
});

// ─────────────────────────────────────────────
describe("updateAddress", () => {
  it("renvoie 404 quand l'adresse n'existe pas", async () => {
    AddressMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await updateAddress(mockRequest({ params: { id: oid().toString() }, body: {} }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it("ne modifie que les champs fournis", async () => {
    const address = makeAddress({ ville: "Conakry", label: "Maison" });
    AddressMock.findById.mockReturnValue(mockQuery(address));
    const res = mockResponse();

    await updateAddress(
      mockRequest({ params: { id: address._id.toString() }, body: { ville: "Kindia" } }),
      res
    );

    expect(address.ville).toBe("Kindia");
    expect(address.label).toBe("Maison"); // inchangé
    expect(address.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
  });

  it("accepte une chaîne vide comme valeur explicite", async () => {
    const address = makeAddress({ commune: "Ratoma" });
    AddressMock.findById.mockReturnValue(mockQuery(address));

    await updateAddress(
      mockRequest({ params: { id: address._id.toString() }, body: { commune: "" } }),
      mockResponse()
    );

    expect(address.commune).toBe("");
  });

  it("promeut l'adresse en défaut et démarque les autres", async () => {
    const address = makeAddress({ isDefault: false });
    AddressMock.findById.mockReturnValue(mockQuery(address));
    const id = address._id.toString();

    await updateAddress(mockRequest({ params: { id }, body: { isDefault: true } }), mockResponse());

    expect(AddressMock.updateMany).toHaveBeenCalledWith(
      { userId: address.userId, isDefault: true, _id: { $ne: id } },
      { isDefault: false },
      { session }
    );
    expect(address.isDefault).toBe(true);
  });

  it("ne redéclenche pas la promotion si l'adresse est déjà par défaut", async () => {
    const address = makeAddress({ isDefault: true });
    AddressMock.findById.mockReturnValue(mockQuery(address));

    await updateAddress(
      mockRequest({ params: { id: address._id.toString() }, body: { isDefault: true } }),
      mockResponse()
    );

    expect(AddressMock.updateMany).not.toHaveBeenCalled();
  });

});

// ─────────────────────────────────────────────
describe("setDefaultAddress", () => {
  it("marque l'adresse par défaut et démarque les autres", async () => {
    const address = makeAddress({ isDefault: false });
    AddressMock.findById.mockReturnValue(mockQuery(address));
    const id = address._id.toString();
    const res = mockResponse();

    await setDefaultAddress(mockRequest({ params: { id } }), res);

    expect(AddressMock.updateMany).toHaveBeenCalledWith(
      { userId: address.userId, isDefault: true, _id: { $ne: id } },
      { isDefault: false },
      { session }
    );
    expect(address.isDefault).toBe(true);
    expect(address.save).toHaveBeenCalledWith({ session });
    expect(res.body.data.isDefault).toBe(true);
  });

  it("renvoie 404 quand l'adresse est introuvable", async () => {
    AddressMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await setDefaultAddress(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(AddressMock.updateMany).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
describe("deleteAddress", () => {
  it("effectue une suppression logique", async () => {
    const address = makeAddress({ isDefault: false });
    AddressMock.findById.mockReturnValue(mockQuery(address));
    const res = mockResponse();

    await deleteAddress(mockRequest({ params: { id: address._id.toString() } }), res);

    expect(address.deletedAt).toBeInstanceOf(Date);
    expect(address.isDefault).toBe(false);
    expect(address.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it("promeut l'adresse restante la plus récente quand la supprimée était par défaut", async () => {
    const address = makeAddress({ isDefault: true });
    const next = makeAddress({ userId: address.userId, isDefault: false });
    const nextQuery = mockQuery(next);
    AddressMock.findById.mockReturnValue(mockQuery(address));
    AddressMock.findOne.mockReturnValue(nextQuery);

    await deleteAddress(mockRequest({ params: { id: address._id.toString() } }), mockResponse());

    expect(AddressMock.findOne).toHaveBeenCalledWith({ userId: address.userId });
    expect(nextQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(next.isDefault).toBe(true);
    expect(next.save).toHaveBeenCalledWith({ session });
  });

  it("ne promeut personne quand l'adresse supprimée n'était pas par défaut", async () => {
    const address = makeAddress({ isDefault: false });
    AddressMock.findById.mockReturnValue(mockQuery(address));

    await deleteAddress(mockRequest({ params: { id: address._id.toString() } }), mockResponse());

    expect(AddressMock.findOne).not.toHaveBeenCalled();
  });

  it("tolère l'absence d'adresse restante à promouvoir", async () => {
    const address = makeAddress({ isDefault: true });
    AddressMock.findById.mockReturnValue(mockQuery(address));
    AddressMock.findOne.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await deleteAddress(mockRequest({ params: { id: address._id.toString() } }), res);

    expect(res.statusCode).toBe(200);
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it("renvoie 404 quand l'adresse est introuvable", async () => {
    AddressMock.findById.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await deleteAddress(mockRequest({ params: { id: oid().toString() } }), res);

    expect(res.statusCode).toBe(404);
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
//  Retrait du drapeau « par défaut »
// ─────────────────────────────────────────────
describe("updateAddress — retrait du défaut", () => {
  it("promeut l'adresse la plus récente quand on retire le défaut", async () => {
    const address = makeAddress({ isDefault: true });
    const suivante = makeAddress({ userId: address.userId, isDefault: false });
    const suivanteQuery = mockQuery(suivante);
    AddressMock.findById.mockReturnValue(mockQuery(address));
    AddressMock.findOne.mockReturnValue(suivanteQuery);
    const id = address._id.toString();
    const res = mockResponse();

    await updateAddress(mockRequest({ params: { id }, body: { isDefault: false } }), res);

    expect(AddressMock.findOne).toHaveBeenCalledWith({
      userId: address.userId,
      _id: { $ne: id },
    });
    expect(suivanteQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(address.isDefault).toBe(false);
    expect(suivante.isDefault).toBe(true);
    expect(suivante.save).toHaveBeenCalledWith({ session });
    expect(res.statusCode).toBe(200);
  });

  it("refuse de retirer le défaut de la seule adresse de l'utilisateur", async () => {
    const address = makeAddress({ isDefault: true });
    AddressMock.findById.mockReturnValue(mockQuery(address));
    AddressMock.findOne.mockReturnValue(mockQuery(null));
    const res = mockResponse();

    await updateAddress(
      mockRequest({ params: { id: address._id.toString() }, body: { isDefault: false } }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(
      "Impossible de retirer l'adresse par défaut : c'est votre seule adresse."
    );
    expect(address.isDefault).toBe(true);
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(address.save).not.toHaveBeenCalled();
  });

  it("ignore isDefault: false sur une adresse qui n'est pas par défaut", async () => {
    const address = makeAddress({ isDefault: false });
    AddressMock.findById.mockReturnValue(mockQuery(address));

    await updateAddress(
      mockRequest({ params: { id: address._id.toString() }, body: { isDefault: false } }),
      mockResponse()
    );

    expect(AddressMock.findOne).not.toHaveBeenCalled();
    expect(address.isDefault).toBe(false);
  });
});
