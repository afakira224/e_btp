import type { Famille } from "../../../../entities/taxonomy";

/** Minuscules, sans accents ni espaces superflus : « Électricité » → « electricite ». */
export const fold = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Familles dont le nom, une catégorie ou un rayon contient la saisie.
 * Une famille trouvée par son propre nom passe devant celles trouvées
 * par une catégorie ou un rayon.
 */
export const filterFamilles = (familles: Famille[], query: string): Famille[] => {
  const needle = fold(query);
  if (!needle) return familles;

  const byName: Famille[] = [];
  const byContent: Famille[] = [];
  for (const famille of familles) {
    if (fold(famille.nom).includes(needle)) {
      byName.push(famille);
      continue;
    }
    const inside = famille.categories.some(
      (c) => fold(c.nom).includes(needle) || (c.sousCategories ?? []).some((s) => fold(s.nom).includes(needle))
    );
    if (inside) byContent.push(famille);
  }
  return [...byName, ...byContent];
};
