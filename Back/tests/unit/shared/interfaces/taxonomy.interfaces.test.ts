import { describe, it, expect } from "vitest";
import { toFamilleResponseDto } from "../../../../src/shared/interfaces/Famille.interfaces.js";
import { toCategorieResponseDto } from "../../../../src/shared/interfaces/Categorie.interfaces.js";
import { toSousCategorieResponseDto } from "../../../../src/shared/interfaces/SousCategorie.interfaces.js";
import {
  CREATED_AT,
  UPDATED_AT,
  makeCategorie,
  makeFamille,
  makeSousCategorie,
} from "../../../helpers/factories.js";

describe("toSousCategorieResponseDto", () => {
  it("mappe la sous-catégorie", () => {
    const sc = makeSousCategorie({ ordre: 3, actif: false });

    expect(toSousCategorieResponseDto(sc)).toEqual({
      id: sc._id.toString(),
      nom: "Smartphones",
      description: "Téléphones intelligents",
      image: null,
      ordre: 3,
      actif: false,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    });
  });

  it("remplace un ordre absent par 0", () => {
    expect(toSousCategorieResponseDto(makeSousCategorie({ ordre: undefined })).ordre).toBe(0);
  });

  it("conserve un ordre à 0 explicite", () => {
    expect(toSousCategorieResponseDto(makeSousCategorie({ ordre: 0 })).ordre).toBe(0);
  });
});

describe("toCategorieResponseDto", () => {
  it("imbrique les sous-catégories fournies", () => {
    const categorie = makeCategorie();
    const sc1 = makeSousCategorie({ categorieId: categorie._id, nom: "Smartphones" });
    const sc2 = makeSousCategorie({ categorieId: categorie._id, nom: "Tablettes" });

    const dto = toCategorieResponseDto(categorie, [sc1, sc2]);

    expect(dto.id).toBe(categorie._id.toString());
    expect(dto.sousCategories?.map((s) => s.nom)).toEqual(["Smartphones", "Tablettes"]);
  });

  it("renvoie une liste de sous-catégories vide par défaut", () => {
    expect(toCategorieResponseDto(makeCategorie()).sousCategories).toEqual([]);
  });

  it("remplace un ordre absent par 0", () => {
    expect(toCategorieResponseDto(makeCategorie({ ordre: undefined })).ordre).toBe(0);
  });

  it("renseigne familleId sous forme de chaîne", () => {
    const categorie = makeCategorie();

    expect(toCategorieResponseDto(categorie).familleId).toBe(categorie.familleId.toString());
  });
});

describe("toFamilleResponseDto", () => {
  it("mappe la famille sans catégorie par défaut", () => {
    const famille = makeFamille();

    const dto = toFamilleResponseDto(famille);

    expect(dto).toMatchObject({
      id: famille._id.toString(),
      nom: "Électronique",
      categories: [],
      ordre: 1,
      actif: true,
    });
  });

  it("rattache chaque sous-catégorie à sa catégorie parente", () => {
    const famille = makeFamille();
    const catA = makeCategorie({ familleId: famille._id, nom: "Téléphonie" });
    const catB = makeCategorie({ familleId: famille._id, nom: "Informatique" });
    const scA = makeSousCategorie({ categorieId: catA._id, nom: "Smartphones" });
    const scB = makeSousCategorie({ categorieId: catB._id, nom: "Ordinateurs portables" });

    const dto = toFamilleResponseDto(famille, [catA, catB], [scA, scB]);

    expect(dto.categories).toHaveLength(2);
    expect(dto.categories[0]!.sousCategories?.map((s) => s.nom)).toEqual(["Smartphones"]);
    expect(dto.categories[1]!.sousCategories?.map((s) => s.nom)).toEqual(["Ordinateurs portables"]);
  });

  it("n'affecte aucune sous-catégorie orpheline", () => {
    const famille = makeFamille();
    const cat = makeCategorie({ familleId: famille._id });
    const orpheline = makeSousCategorie(); // rattachée à une autre catégorie

    const dto = toFamilleResponseDto(famille, [cat], [orpheline]);

    expect(dto.categories[0]!.sousCategories).toEqual([]);
  });

  it("remplace un ordre absent par 0", () => {
    expect(toFamilleResponseDto(makeFamille({ ordre: undefined })).ordre).toBe(0);
  });
});
