import type { Famille } from "../../../../entities/taxonomy";
import { normalize, type Suggestion } from "../../shared";

type TaxonomySuggestion = Extract<Suggestion, { kind: "taxonomy" }>;

/**
 * Rayons dont le nom contient la saisie, aux trois niveaux de l'arbre.
 * Ceux dont le nom *commence* par la saisie passent devant : « ca » doit
 * proposer « Carrelage » avant « Électricité & câblage ».
 */
export const matchTaxonomy = (
  familles: Famille[],
  query: string,
  limit: number
): TaxonomySuggestion[] => {
  const needle = normalize(query);
  if (!needle) return [];

  const found: (TaxonomySuggestion & { rank: number })[] = [];
  const consider = (entry: TaxonomySuggestion) => {
    const name = normalize(entry.label);
    const position = name.indexOf(needle);
    if (position < 0) return;
    // Début de nom > début de mot > milieu de mot.
    const rank = position === 0 ? 0 : name[position - 1] === " " ? 1 : 2;
    found.push({ ...entry, rank });
  };

  for (const famille of familles) {
    if (!famille.actif) continue;
    consider({ kind: "taxonomy", id: famille.id, label: famille.nom, level: "famille" });

    for (const categorie of famille.categories) {
      if (!categorie.actif) continue;
      consider({
        kind: "taxonomy",
        id: categorie.id,
        label: categorie.nom,
        level: "categorie",
        parent: famille.nom,
      });

      for (const sous of categorie.sousCategories ?? []) {
        if (!sous.actif) continue;
        consider({
          kind: "taxonomy",
          id: sous.id,
          label: sous.nom,
          level: "sousCategorie",
          parent: categorie.nom,
        });
      }
    }
  }

  return found
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, "fr"))
    .slice(0, limit)
    .map(({ rank: _rank, ...entry }) => entry);
};
