import { useEffect, useMemo, useState } from "react";
import {
  effectivePrice,
  hasDiscount,
  productImage,
  productName,
  shopName,
  type ProductBoutique,
} from "../../../../entities/product";
import {
  fetchProductSuggestions,
  loadTaxonomy,
  useDebouncedValue,
  useRecentSearches,
  type Suggestion,
} from "../../shared";
import { matchTaxonomy } from "../utils/matchTaxonomy";

export const MIN_CHARS = 2;
const DEBOUNCE_MS = 200;
const MAX_PRODUCTS = 5;
const MAX_RAYONS = 4;

interface Results {
  /** Saisie à laquelle ces résultats répondent. */
  query: string;
  products: ProductBoutique[];
  rayons: Extract<Suggestion, { kind: "taxonomy" }>[];
  error: string | null;
}

const EMPTY: Results = { query: "", products: [], rayons: [], error: null };

const toSuggestion = (item: ProductBoutique): Suggestion => ({
  kind: "product",
  id: item.id,
  label: productName(item),
  shop: shopName(item),
  price: effectivePrice(item),
  wasPrice: hasDiscount(item) ? item.price : undefined,
  image: productImage(item),
});

// ─────────────────────────────────────────────
//  useAutocomplete
//
//  Sous deux caractères : les recherches récentes.
//  Au-delà : les rayons correspondants (lus dans l'arbre, côté client) et
//  quelques produits (lus au serveur), puis l'entrée « voir tous les
//  résultats ».
//
//  Les résultats précédents restent affichés pendant qu'une nouvelle
//  saisie se charge : la liste ne clignote pas à chaque frappe. Une
//  requête dépassée est annulée, elle ne peut pas écraser une plus récente.
// ─────────────────────────────────────────────
export const useAutocomplete = (input: string, enabled: boolean) => {
  const query = input.trim();
  const debounced = useDebouncedValue(query, DEBOUNCE_MS);
  const { recent } = useRecentSearches();
  const [results, setResults] = useState<Results>(EMPTY);

  useEffect(() => {
    if (!enabled || debounced.length < MIN_CHARS) return;
    const controller = new AbortController();

    void (async () => {
      const [products, familles] = await Promise.allSettled([
        fetchProductSuggestions(debounced, MAX_PRODUCTS, controller.signal),
        loadTaxonomy(),
      ]);
      if (controller.signal.aborted) return;

      setResults({
        query: debounced,
        products: products.status === "fulfilled" ? products.value : [],
        // L'arbre indisponible n'empêche pas de proposer des produits.
        rayons:
          familles.status === "fulfilled"
            ? matchTaxonomy(familles.value, debounced, MAX_RAYONS)
            : [],
        error:
          products.status === "rejected"
            ? "Suggestions indisponibles pour le moment."
            : null,
      });
    })();

    return () => controller.abort();
  }, [debounced, enabled]);

  const isTyping = query.length >= MIN_CHARS;
  const isLoading = isTyping && results.query !== query;
  // Rien de pertinent à montrer tant que la toute première réponse n'est
  // pas arrivée : des résultats d'une saisie effacée seraient trompeurs.
  const hasResults = isTyping && results.query.length >= MIN_CHARS;

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!isTyping) {
      return recent.map((term) => ({ kind: "recent", id: `recent-${term}`, label: term }));
    }
    if (!hasResults) return [];

    const list: Suggestion[] = [...results.rayons, ...results.products.map(toSuggestion)];
    if (results.products.length > 0) {
      list.push({ kind: "all", id: "all", label: query });
    }
    return list;
  }, [isTyping, hasResults, recent, results, query]);

  return {
    query,
    suggestions,
    isTyping,
    isLoading,
    error: isTyping ? results.error : null,
    /** Réponse reçue et vide : on peut dire « aucun résultat ». */
    isEmpty: hasResults && !isLoading && suggestions.length === 0 && !results.error,
  };
};
