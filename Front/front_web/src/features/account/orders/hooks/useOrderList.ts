import { useCallback, useEffect, useRef, useState } from "react";
import type { Order, OrderStatus } from "../../../../entities/order";
import { fetchOrders } from "../../shared";

export const PAGE_SIZE = 10;

interface Status {
  isLoading: boolean;
  error: string | null;
  total: number;
  hasMore: boolean;
}

/**
 * Historique paginé des commandes, filtré par statut. Changer de filtre
 * repart de la première page et annule la requête en cours.
 */
export const useOrderList = (userId: string, status: OrderStatus | undefined) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [state, setState] = useState<Status>({
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
      setState((previous) => ({ ...previous, isLoading: true, error: null }));

      try {
        const result = await fetchOrders(
          { userId, status, page: target, limit: PAGE_SIZE },
          current.signal
        );
        if (current.signal.aborted) return;
        setOrders((previous) => {
          if (reset) return result.items;
          const seen = new Set(previous.map((order) => order.id));
          return [...previous, ...result.items.filter((order) => !seen.has(order.id))];
        });
        page.current = target;
        setState({ isLoading: false, error: null, total: result.total, hasMore: result.hasMore });
      } catch (caught) {
        if (current.signal.aborted || (caught as Error).name === "AbortError") return;
        setState((previous) => ({ ...previous, isLoading: false, error: (caught as Error).message }));
      }
    },
    [userId, status]
  );

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setOrders([]);
    // oxlint-disable-next-line react/set-state-in-effect
    void load(1, true);
    return () => controller.current?.abort();
  }, [load]);

  const loadMore = useCallback(() => {
    if (!state.isLoading && state.hasMore) void load(page.current + 1, false);
  }, [load, state.isLoading, state.hasMore]);

  const retry = useCallback(() => {
    void (orders.length === 0 ? load(1, true) : load(page.current + 1, false));
  }, [load, orders.length]);

  return { orders, ...state, loadMore, retry };
};
