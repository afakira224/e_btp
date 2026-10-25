import { describe, it, expect } from "vitest";
import { toShopRequestResponseDto } from "../../../../src/shared/interfaces/ShopRequest.interfaces.js";
import {
  ACCEPTED_TERMS_AT,
  CREATED_AT,
  UPDATED_AT,
  makeFamille,
  makeShopRequest,
  makeUser,
  oid,
} from "../../../helpers/factories.js";

describe("toShopRequestResponseDto", () => {
  it("mappe tous les champs d'une demande non chargée", () => {
    const familleId = oid();
    const request = makeShopRequest({ familleIds: [familleId] });

    expect(toShopRequestResponseDto(request)).toEqual({
      id: request._id.toString(),
      userId: request.userId.toString(),
      applicant: undefined,
      nom: "Quincaillerie Kipé",
      description: "Quincaillerie générale : visserie, outillage à main, serrurerie.",
      familles: [{ id: familleId.toString() }],
      sellerType: "particulier",
      rccm: null,
      experience: "1_3_ans",
      catalogSize: "moins_50",
      hasPhysicalStore: true,
      adresse: "Kipé, Ratoma, Conakry",
      email: null,
      message: null,
      acceptedTermsAt: ACCEPTED_TERMS_AT,
      status: "pending",
      rejectionReason: null,
      reviewedAt: null,
      shopId: null,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    });
  });

  it("renvoie les identifiants en chaînes et aucun demandeur quand rien n'est chargé", () => {
    const request = makeShopRequest({ familleIds: [oid(), oid()] });

    const dto = toShopRequestResponseDto(request);

    expect(typeof dto.id).toBe("string");
    expect(typeof dto.userId).toBe("string");
    expect(dto.applicant).toBeUndefined();
    expect(dto.familles).toEqual([
      { id: request.familleIds[0]!.toString() },
      { id: request.familleIds[1]!.toString() },
    ]);
    expect(dto.familles.every((f) => f.nom === undefined)).toBe(true);
  });

  it("expose le demandeur chargé par populate", () => {
    const user = makeUser({
      nom: "Bah",
      prenom: "Aïssatou",
      email: "aissatou.bah@example.com",
      telephone: "621000000",
    });
    const request = makeShopRequest({ userId: user });

    const dto = toShopRequestResponseDto(request);

    expect(dto.userId).toBe(user._id.toString());
    expect(dto.applicant).toEqual({
      id: user._id.toString(),
      nom: "Bah",
      prenom: "Aïssatou",
      email: "aissatou.bah@example.com",
      telephone: "621000000",
    });
  });

  it("laisse le téléphone du demandeur indéfini quand il n'en a pas", () => {
    const user = makeUser({ telephone: undefined });

    const dto = toShopRequestResponseDto(makeShopRequest({ userId: user }));

    expect(dto.applicant).toBeDefined();
    expect(dto.applicant!.telephone).toBeUndefined();
  });

  it("renvoie userId vide et aucun demandeur quand le compte a disparu (populate nul)", () => {
    const dto = toShopRequestResponseDto(makeShopRequest({ userId: null }));

    expect(dto.userId).toBe("");
    expect(dto.applicant).toBeUndefined();
  });

  it("expose le nom des domaines chargés par populate", () => {
    const electricite = makeFamille({ nom: "Électricité" });
    const plomberie = makeFamille({ nom: "Plomberie" });

    const dto = toShopRequestResponseDto(makeShopRequest({ familleIds: [electricite, plomberie] }));

    expect(dto.familles).toEqual([
      { id: electricite._id.toString(), nom: "Électricité" },
      { id: plomberie._id.toString(), nom: "Plomberie" },
    ]);
  });

  it("mélange domaines chargés et identifiants bruts", () => {
    const electricite = makeFamille({ nom: "Électricité" });
    const brut = oid();

    const dto = toShopRequestResponseDto(makeShopRequest({ familleIds: [electricite, brut] }));

    expect(dto.familles).toEqual([
      { id: electricite._id.toString(), nom: "Électricité" },
      { id: brut.toString() },
    ]);
  });

  it("renvoie une liste de domaines vide quand familleIds est absent", () => {
    const dto = toShopRequestResponseDto(makeShopRequest({ familleIds: undefined }));

    expect(dto.familles).toEqual([]);
  });

  it("ramène à null les champs facultatifs absents", () => {
    const request = makeShopRequest({
      rccm: undefined,
      email: undefined,
      message: undefined,
      rejectionReason: undefined,
      reviewedAt: undefined,
      shopId: undefined,
    });

    const dto = toShopRequestResponseDto(request);

    expect(dto.rccm).toBeNull();
    expect(dto.email).toBeNull();
    expect(dto.message).toBeNull();
    expect(dto.rejectionReason).toBeNull();
    expect(dto.reviewedAt).toBeNull();
    expect(dto.shopId).toBeNull();
  });

  it("restitue une demande examinée : boutique ouverte, date d'examen", () => {
    const shopId = oid();
    const reviewedAt = new Date("2026-01-03T08:00:00.000Z");
    const request = makeShopRequest({
      sellerType: "entreprise",
      rccm: "GN.TCC.2024.B.01234",
      email: "contact@kipe.gn",
      message: "Livraison sur chantier possible.",
      status: "approved",
      reviewedBy: oid(),
      reviewedAt,
      shopId,
    });

    const dto = toShopRequestResponseDto(request);

    expect(dto).toMatchObject({
      sellerType: "entreprise",
      rccm: "GN.TCC.2024.B.01234",
      email: "contact@kipe.gn",
      message: "Livraison sur chantier possible.",
      status: "approved",
      reviewedAt,
      shopId: shopId.toString(),
    });
    // L'examinateur reste interne : il n'est pas exposé.
    expect(dto).not.toHaveProperty("reviewedBy");
  });

  it("restitue le motif d'un refus", () => {
    const dto = toShopRequestResponseDto(
      makeShopRequest({ status: "rejected", rejectionReason: "Nom de boutique trompeur." })
    );

    expect(dto.status).toBe("rejected");
    expect(dto.rejectionReason).toBe("Nom de boutique trompeur.");
  });
});
