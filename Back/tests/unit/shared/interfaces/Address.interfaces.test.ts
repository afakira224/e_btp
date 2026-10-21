import { describe, it, expect } from "vitest";
import { toAddressResponseDto } from "../../../../src/shared/interfaces/Address.interfaces.js";
import { CREATED_AT, UPDATED_AT, makeAddress } from "../../../helpers/factories.js";

describe("toAddressResponseDto", () => {
  it("mappe tous les champs de l'adresse", () => {
    const address = makeAddress({ isDefault: true });

    expect(toAddressResponseDto(address)).toEqual({
      id: address._id.toString(),
      userId: address.userId.toString(),
      label: "Maison",
      destinataire: "Mamadou Diallo",
      telephone: "620000000",
      adresse: "Rue KA-020",
      ville: "Conakry",
      commune: "Ratoma",
      pays: "Guinée",
      isDefault: true,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    });
  });

  it("sérialise _id et userId en chaînes", () => {
    const address = makeAddress();
    const dto = toAddressResponseDto(address);

    expect(typeof dto.id).toBe("string");
    expect(typeof dto.userId).toBe("string");
    expect(dto.id).toBe(address._id.toString());
  });

  it("laisse les champs facultatifs non définis quand ils sont absents", () => {
    const address = makeAddress({ label: undefined, destinataire: undefined, commune: undefined });
    const dto = toAddressResponseDto(address);

    expect(dto.label).toBeUndefined();
    expect(dto.destinataire).toBeUndefined();
    expect(dto.commune).toBeUndefined();
    // Les champs requis restent présents.
    expect(dto.ville).toBe("Conakry");
  });
});
