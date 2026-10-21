export {
  DEFAULT_SORT,
  SEARCH_SORTS,
  type PriceRange,
  type SearchCriteria,
  type SearchSort,
  type Suggestion,
  type TaxonomyLevel,
} from "./types/search.types";
export {
  fetchProductSuggestions,
  loadTaxonomy,
  searchProducts,
  type SearchPage,
} from "./api/search.api";
export {
  SEARCH_PATH,
  criteriaKey,
  parseCriteria,
  searchUrl,
  serializeCriteria,
} from "./utils/searchUrl";
export { normalize } from "./utils/text";
export { useDebouncedValue } from "./hooks/useDebouncedValue";
export { useRecentSearches } from "./hooks/useRecentSearches";
export { Highlight } from "./components/Highlight";
