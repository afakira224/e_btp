// ─────────────────────────────────────────────
//  FAMILLE - RESPONSE DTO

import type { ICategorie } from "../../models/categorie.model.js";
import type { IFamille } from "../../models/famille.model.js";
import type { ISousCategorie } from "../../models/sousCategorie.model.js";
import { toCategorieResponseDto, type CategorieResponseDto } from "./Categorie.interfaces.js";

// ─────────────────────────────────────────────
export interface FamilleResponseDto {
  id: string;
  nom: string;
  description?: string | undefined;
  categories: CategorieResponseDto[];
  image?: string | null | undefined;
  ordre: number;
  actif: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Regroupe une liste par clé, en une passe : évite les filtres imbriqués. */
export const groupBy = <T>(list: T[], key: (item: T) => string): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  for (const item of list) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
};

// Seules les catégories de la famille sont reprises, chacune avec ses
// propres sous-catégories. Le regroupement se fait une fois par appel :
// le coût reste linéaire, même avec des milliers de sous-catégories.
export const toFamilleResponseDto = (
  famille: IFamille,
  cat: ICategorie[] = [],
  sous: ISousCategorie[] = []
): FamilleResponseDto => {
  const id = famille._id.toString();
  const sousByCategorie = groupBy(sous, (s) => s.categorieId.toString());
  return {
    id,
    nom: famille.nom,
    description: famille.description,
    categories: cat
      .filter((c) => c.familleId.toString() === id)
      .map((c) => toCategorieResponseDto(c, sousByCategorie.get(c._id.toString()) ?? [])),
    image: famille.image,
    ordre: famille.ordre ?? 0,
    actif: famille.actif,
    createdAt: famille.createdAt,
    updatedAt: famille.updatedAt,
  };
};
