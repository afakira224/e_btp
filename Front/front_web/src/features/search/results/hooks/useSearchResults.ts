import { useCallback, useState } from "react";
import { useInfiniteProducts } from "../../../catalog";
import {
  criteriaKey,
  searchProducts,
  type PriceRange,
  type SearchCriteria,
} from "../../shared";

export const PAGE_SIZE = 12;

/**
 * Résultats paginés d'une recherche, plus la facette de prix que le back
 * renvoie avec la première page. La liste repart de zéro dès qu'un critère
 * change : la clé est l'URL sérialisée.
 */
export const useSearchResults = (criteria: SearchCriteria) => {
  const [priceRange, setPriceRange] = useState<PriceRange | null>(null);

  const load = useCallback(
    async (page: number, limit: number, signal: AbortSignal) => {
      const result = await searchProducts(criteria, page, limit, signal);
      // La facette ne dépend pas de la page : la première suffit.
      if (page === 1 && !signal.aborted) setPriceRange(result.priceRange);
      return result;
    },
    [criteria]
  );

  const products = useInfiniteProducts(load, {
    pageSize: PAGE_SIZE,
    key: criteriaKey(criteria),
  });

  return { ...products, priceRange };
};
