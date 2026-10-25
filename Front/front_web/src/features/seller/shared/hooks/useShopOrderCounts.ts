import { useCallback, useEffect, useRef, useState } from "react";
import type { ShopOrderCounts } from "../../../../entities/order";
import { fetchShopOrders } from "../../../orders";

/** Les compteurs se relisent seuls toutes les 2 minutes : une commande arrive sans prévenir. */
const REFRESH_MS = 2 * 60 * 1000;

/**
 * Nombre de commandes de chaque onglet, pour le menu et le tableau de bord.
 * `refresh` relit après une action ; une erreur garde les derniers chiffres
 * connus plutôt que d'effacer le menu.
 */
export const useShopOrderCounts = (shopId: string) => {
  const [counts, setCounts] = useState<ShopOrderCounts | null>(null);
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      const page = await fetchShopOrders({ boutiqueId: shopId, page: 1, limit: 1 }, current.signal);
      if (!current.signal.aborted) setCounts(page.counts);
    } catch {
      // Compteurs indicatifs : la page des commandes affiche l'erreur elle-même.
    }
  }, [shopId]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setCounts(null);
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      window.clearInterval(timer);
      controller.current?.abort();
    };
  }, [refresh]);

  return { counts, refresh };
};
