import { useCallback, useEffect, useRef, useState } from "react";
import type { Shop } from "../../../../entities/shop";
import { fetchShops } from "../../shared";

export const PAGE_SIZE = 12;

interface Status {
  isLoading: boolean;
  error: string | null;
  total: number;
  hasMore: boolean;
}

// ─────────────────────────────────────────────
//  useShopDirectory
//  Annuaire paginé, filtré par nom. Changer de recherche repart de la
//  première page ; la liste précédente reste affichée (atténuée) jusqu'à
//  l'arrivée de la nouvelle, pour que la grille ne clignote pas à chaque
//  lettre. Une requête dépassée est annulée.
// ─────────────────────────────────────────────
export const useShopDirectory = (search: string) => {
  const [shops, setShops] = useState<Shop[]>([]);
  const [status, setStatus] = useState<Status>({
    isLoading: true,
    error: null,
    total: 0,
    hasMore: false,
  });
  const page = useRef(1);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(
    async (target: number, reset: boolean) => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setStatus((previous) => ({ ...previous, isLoading: true, error: null }));

      try {
        const result = await fetchShops({ search, page: target, limit: PAGE_SIZE }, current.signal);
        if (current.signal.aborted) return;

        setShops((previous) => {
          if (reset) return result.items;
          const seen = new Set(previous.map((shop) => shop.id));
          return [...previous, ...result.items.filter((shop) => !seen.has(shop.id))];
        });
        page.current = target;
        setStatus({
          isLoading: false,
          error: null,
          total: result.total,
          hasMore: result.hasMore,
        });
      } catch (caught) {
        if (current.signal.aborted || (caught as Error).name === "AbortError") return;
        setStatus((previous) => ({
          ...previous,
          isLoading: false,
          error: (caught as Error).message,
        }));
      }
    },
    [search]
  );

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load(1, true);
    return () => controller.current?.abort();
  }, [load]);

  const loadMore = useCallback(() => {
    if (!status.isLoading && status.hasMore) void load(page.current + 1, false);
  }, [load, status.isLoading, status.hasMore]);

  const retry = useCallback(() => {
    void (shops.length === 0 ? load(1, true) : load(page.current + 1, false));
  }, [load, shops.length]);

  return { shops, ...status, loadMore, retry };
};
