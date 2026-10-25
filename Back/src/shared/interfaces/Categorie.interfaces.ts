// ─────────────────────────────────────────────
//  CATEGORIE - RESPONSE DTO

import type { ICategorie } from "../../models/categorie.model.js";
import { Etape } from "../../models/projet.model.js";
import type { ISousCategorie } from "../../models/sousCategorie.model.js";
import type { SousCategorieResponseDto } from "./SousCategorie.interfaces.js";
import { toSousCategorieResponseDto } from "./SousCategorie.interfaces.js";

// ─────────────────────────────────────────────
export interface CategorieResponseDto {
  id: string;
  familleId: string;
  nom: string;
  description?: string | undefined;
  sousCategories?: SousCategorieResponseDto[] | undefined;
  image?: string | null | undefined;
  ordre: number;
  actif: boolean;
  /** Étape du chantier où l'on a besoin de cette catégorie. */
  etape: Etape;
  createdAt: Date;
  updatedAt: Date;
}

export const toCategorieResponseDto = (
  categorie: ICategorie,
  sousCategories: ISousCategorie[] = []
): CategorieResponseDto => {
  return {
    id: categorie._id.toString(),
    familleId: categorie.familleId.toString(),
    nom: categorie.nom,
    description: categorie.description,
    sousCategories: sousCategories.map(toSousCategorieResponseDto),
    image: categorie.image,
    ordre: categorie.ordre ?? 0,
    actif: categorie.actif,
    etape: categorie.etape ?? Etape.TRANSVERSE,
    createdAt: categorie.createdAt,
    updatedAt: categorie.updatedAt,
  };
};