import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DEFAULT_SORT,
  parseCriteria,
  serializeCriteria,
  type SearchCriteria,
} from "../../shared";

/** Critères qui restreignent la sélection — le texte et le tri n'en sont pas. */
export const countFilters = (criteria: SearchCriteria): number =>
  [
    criteria.familleId ?? criteria.categoryId ?? criteria.sousCategoryId,
    criteria.minPrice,
    criteria.maxPrice,
    criteria.inStock,
    criteria.discounted,
  ].filter((value) => value !== undefined).length;

// ─────────────────────────────────────────────
//  useSearchQuery
//  Lit et écrit les critères dans l'URL. Chaque changement de filtre crée
//  une entrée d'historique : le bouton Précédent annule le dernier filtre,
//  ce que l'on attend d'une page de résultats.
// ─────────────────────────────────────────────
export const useSearchQuery = () => {
  const [params, setParams] = useSearchParams();
  const criteria = useMemo(() => parseCriteria(params), [params]);

  const update = useCallback(
    (patch: Partial<SearchCriteria>) => {
      setParams(serializeCriteria({ ...criteria, ...patch }));
    },
    [criteria, setParams]
  );

  /** Garde le texte recherché, retire tout le reste. */
  const reset = useCallback(() => {
    setParams(serializeCriteria({ q: criteria.q, sort: DEFAULT_SORT }));
  }, [criteria.q, setParams]);

  return { criteria, update, reset, filterCount: countFilters(criteria) };
};
