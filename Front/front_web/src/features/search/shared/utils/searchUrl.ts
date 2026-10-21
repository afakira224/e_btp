import {
  DEFAULT_SORT,
  SEARCH_SORTS,
  type SearchCriteria,
  type SearchSort,
} from "../types/search.types";

// ─────────────────────────────────────────────
//  Aller-retour entre l'URL et les critères de recherche.
//
//  L'URL est la seule source de vérité de la page de résultats : pas d'état
//  local qui pourrait diverger de ce que l'on partage ou met en favori.
//  On n'écrit que les paramètres utiles, pour garder des liens lisibles.
// ─────────────────────────────────────────────

export const SEARCH_PATH = "/recherche";

const isSort = (value: string | null): value is SearchSort =>
  SEARCH_SORTS.some((sort) => sort.value === value);

const toNumber = (value: string | null): number | undefined => {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

export const parseCriteria = (params: URLSearchParams): SearchCriteria => {
  const sort = params.get("tri");

  // Un seul niveau de taxonomie : le plus précis l'emporte si l'URL a été
  // bricolée à la main avec plusieurs.
  const sousCategoryId = params.get("sousCategorie") ?? undefined;
  const categoryId = sousCategoryId ? undefined : (params.get("categorie") ?? undefined);
  const familleId =
    sousCategoryId || categoryId ? undefined : (params.get("famille") ?? undefined);

  return {
    q: (params.get("q") ?? "").trim(),
    familleId,
    categoryId,
    sousCategoryId,
    minPrice: toNumber(params.get("prixMin")),
    maxPrice: toNumber(params.get("prixMax")),
    inStock: params.get("enStock") === "1" || undefined,
    discounted: params.get("promo") === "1" || undefined,
    sort: isSort(sort) ? sort : DEFAULT_SORT,
  };
};

export const serializeCriteria = (criteria: SearchCriteria): URLSearchParams => {
  const params = new URLSearchParams();
  if (criteria.q) params.set("q", criteria.q);
  if (criteria.familleId) params.set("famille", criteria.familleId);
  if (criteria.categoryId) params.set("categorie", criteria.categoryId);
  if (criteria.sousCategoryId) params.set("sousCategorie", criteria.sousCategoryId);
  if (criteria.minPrice !== undefined) params.set("prixMin", String(criteria.minPrice));
  if (criteria.maxPrice !== undefined) params.set("prixMax", String(criteria.maxPrice));
  if (criteria.inStock) params.set("enStock", "1");
  if (criteria.discounted) params.set("promo", "1");
  if (criteria.sort !== DEFAULT_SORT) params.set("tri", criteria.sort);
  return params;
};

/** Lien vers la page de résultats pour un texte libre, sans autre filtre. */
export const searchUrl = (q: string): string => {
  const params = new URLSearchParams();
  const trimmed = q.trim();
  if (trimmed) params.set("q", trimmed);
  const query = params.toString();
  return query ? `${SEARCH_PATH}?${query}` : SEARCH_PATH;
};

/** Clé stable d'une recherche : elle relance la liste quand un critère change. */
export const criteriaKey = (criteria: SearchCriteria): string =>
  serializeCriteria(criteria).toString();
