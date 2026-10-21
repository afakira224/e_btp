import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductBoutique } from "../../../../entities/product";
import { fetchShopOffers } from "../../shared";

const PAGE_SIZE = 20;

// ─────────────────────────────────────────────
//  Produits d'une boutique, page par page.
//  Relus à chaque arrivée sur la liste : un produit tout juste modifié y
//  apparaît avec sa nouvelle livraison, sans cache à invalider.
// ─────────────────────────────────────────────
export const useShopOffers = (shopId: string) => {
  const [items, setItems] = useState<ProductBoutique[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(
    async (next: number) => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setIsLoading(true);
      try {
        const result = await fetchShopOffers(shopId, next, PAGE_SIZE, current.signal);
        if (current.signal.aborted) return;
        setItems((previous) => (next === 1 ? result.items : [...previous, ...result.items]));
        setTotal(result.total);
        setPage(result.page);
        setHasMore(result.hasMore);
        setError(null);
      } catch (caught) {
        if (current.signal.aborted || (caught as Error).name === "AbortError") return;
        setError((caught as Error).message);
      } finally {
        if (!current.signal.aborted) setIsLoading(false);
      }
    },
    [shopId]
  );

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load(1);
    return () => controller.current?.abort();
  }, [load]);

  const loadMore = useCallback(() => void load(page + 1), [load, page]);

  return { items, total, hasMore, isLoading, error, loadMore };
};
