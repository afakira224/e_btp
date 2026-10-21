// ─────────────────────────────────────────────
//  Types de la recherche.
//
//  `SearchCriteria` est le miroir des paramètres acceptés par
//  GET /product-boutiques/search (Back/src/controllers/productBoutique.controller.ts).
//  L'URL de la page de résultats en est la sérialisation directe : une
//  recherche filtrée reste partageable et revient avec le bouton Précédent.
// ─────────────────────────────────────────────

/** Tris acceptés par le back. */
export type SearchSort = "newest" | "price_asc" | "price_desc" | "rating" | "popular";

export const SEARCH_SORTS: readonly { value: SearchSort; label: string }[] = [
  { value: "popular", label: "Popularité" },
  { value: "newest", label: "Nouveautés" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
  { value: "rating", label: "Mieux notés" },
];

export const DEFAULT_SORT: SearchSort = "popular";

export interface SearchCriteria {
  q: string;
  /** Un seul niveau de taxonomie à la fois, comme sur les pages catalogue. */
  familleId?: string | undefined;
  categoryId?: string | undefined;
  sousCategoryId?: string | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  inStock?: boolean | undefined;
  discounted?: boolean | undefined;
  sort: SearchSort;
}

export interface PriceRange {
  min: number;
  max: number;
}

// ─────────────────────────────────────────────
//  Suggestions d'autocomplétion.
//  Trois origines, une seule liste navigable au clavier : le type
//  discriminant dit au rendu comment afficher chaque entrée et à la
//  sélection où elle mène.
// ─────────────────────────────────────────────

export type TaxonomyLevel = "famille" | "categorie" | "sousCategorie";

export type Suggestion =
  | { kind: "recent"; id: string; label: string }
  | {
      kind: "taxonomy";
      id: string;
      label: string;
      level: TaxonomyLevel;
      /** Parent affiché en second plan : « Carrelage · Revêtements ». */
      parent?: string | undefined;
    }
  | {
      kind: "product";
      id: string;
      label: string;
      shop: string;
      price: number;
      wasPrice?: number | undefined;
      image?: string | undefined;
    }
  | { kind: "all"; id: string; label: string };
