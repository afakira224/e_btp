import { useCallback } from "react";
import { fetchListing, type ListingQuery } from "../api/catalog.api";
import { useInfiniteProducts } from "./useInfiniteProducts";

/**
 * Liste éditoriale paginée. La clé reprend tous les critères : changer de
 * domaine repart de la première page au lieu d'empiler deux listes.
 */
export const useListing = (query: ListingQuery, pageSize: number) => {
  const { sort, familleId, discounted, boutiqueId, q } = query;

  const load = useCallback(
    (page: number, limit: number, signal: AbortSignal) =>
      fetchListing({ sort, familleId, discounted, boutiqueId, q }, page, limit, signal),
    [sort, familleId, discounted, boutiqueId, q]
  );

  return useInfiniteProducts(load, {
    pageSize,
    key: [sort, familleId ?? "", discounted ? "1" : "", boutiqueId ?? "", q ?? ""].join("|"),
  });
};
