import { apiClient } from "../../../../shared/api";
import type { ProductBoutique } from "../../../../entities/product";
import type { Famille } from "../../../../entities/taxonomy";
import { fetchFamilles, type ProductListPage } from "../../../catalog";
import type { PriceRange, SearchCriteria } from "../types/search.types";

// ─────────────────────────────────────────────
//  Recherche — GET /product-boutiques/search.
//
//  Le back n'a pas de route d'autocomplétion dédiée : les suggestions de
//  produits sont une recherche ordinaire, bornée à quelques résultats.
// ─────────────────────────────────────────────

interface SearchResponse {
  items: ProductBoutique[];
  total: number;
  page: number;
  totalPages: number;
  /** Min et max du prix sur la sélection, contrainte de prix exclue. */
  priceRange?: PriceRange | undefined;
}

export interface SearchPage extends ProductListPage {
  priceRange: PriceRange | null;
}

const toQuery = (criteria: SearchCriteria, page: number, limit: number): string => {
  const params = new URLSearchParams();
  if (criteria.q) params.set("q", criteria.q);
  if (criteria.familleId) params.set("familleId", criteria.familleId);
  if (criteria.categoryId) params.set("categoryId", criteria.categoryId);
  if (criteria.sousCategoryId) params.set("sousCategoryId", criteria.sousCategoryId);
  if (criteria.minPrice !== undefined) params.set("minPrice", String(criteria.minPrice));
  if (criteria.maxPrice !== undefined) params.set("maxPrice", String(criteria.maxPrice));
  if (criteria.inStock) params.set("inStock", "true");
  if (criteria.discounted) params.set("discounted", "true");
  params.set("sort", criteria.sort);
  params.set("page", String(page));
  params.set("limit", String(limit));
  return params.toString();
};

export const searchProducts = async (
  criteria: SearchCriteria,
  page: number,
  limit: number,
  signal?: AbortSignal
): Promise<SearchPage> => {
  const response = await apiClient.get<SearchResponse>(
    `/product-boutiques/search?${toQuery(criteria, page, limit)}`,
    signal
  );
  const data = response.data;
  if (!data) return { items: [], page, total: 0, hasMore: false, priceRange: null };

  return {
    items: data.items,
    page: data.page,
    total: data.total,
    hasMore: data.page < data.totalPages,
    priceRange: data.priceRange ?? null,
  };
};

/** Quelques produits pour le menu déroulant, les plus populaires d'abord. */
export const fetchProductSuggestions = async (
  q: string,
  limit: number,
  signal?: AbortSignal
): Promise<ProductBoutique[]> => {
  const page = await searchProducts({ q, sort: "popular" }, 1, limit, signal);
  return page.items;
};

// ─────────────────────────────────────────────
//  Taxonomie, pour suggérer des rayons.
//  Lue une seule fois par session : l'arbre change rarement et chaque
//  frappe au clavier le consulte. Un échec n'est pas mis en cache, la
//  frappe suivante retentera.
// ─────────────────────────────────────────────
let taxonomy: Promise<Famille[]> | null = null;

export const loadTaxonomy = (): Promise<Famille[]> => {
  if (!taxonomy) {
    taxonomy = fetchFamilles().catch((error: unknown) => {
      taxonomy = null;
      throw error;
    });
  }
  return taxonomy;
};
