import type { Categorie, Famille, SousCategorie } from "../../../../entities/taxonomy";
import type { SearchCriteria } from "../../shared";

export interface TaxonomyPath {
  famille?: Famille | undefined;
  categorie?: Categorie | undefined;
  sousCategorie?: SousCategorie | undefined;
}

/**
 * Remonte l'arbre depuis le niveau filtré : l'URL ne porte qu'un
 * identifiant, les listes de filtres ont besoin de toute la lignée pour
 * pré-sélectionner le domaine et la catégorie parents.
 */
export const resolveTaxonomy = (
  familles: Famille[],
  criteria: Pick<SearchCriteria, "familleId" | "categoryId" | "sousCategoryId">
): TaxonomyPath => {
  for (const famille of familles) {
    if (criteria.familleId === famille.id) return { famille };

    for (const categorie of famille.categories) {
      if (criteria.categoryId === categorie.id) return { famille, categorie };

      const sousCategorie = categorie.sousCategories?.find(
        (candidate) => candidate.id === criteria.sousCategoryId
      );
      if (sousCategorie) return { famille, categorie, sousCategorie };
    }
  }
  return {};
};
