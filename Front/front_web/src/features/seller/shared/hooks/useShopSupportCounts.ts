import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSupportTickets } from "../../../support";

const REFRESH_MS = 2 * 60 * 1000;

/**
 * Demandes de support de la boutique par onglet, pour le menu et le tableau
 * de bord. Comme les commandes : relues toutes les 2 minutes et après une
 * navigation ; une erreur garde les derniers chiffres connus.
 */
export const useShopSupportCounts = (shopId: string) => {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      const page = await fetchSupportTickets({ scope: "shop", boutiqueId: shopId, tab: "todo", page: 1, limit: 1 }, current.signal);
      if (!current.signal.aborted) setCounts(page.counts);
    } catch {
      // Indicatif : la page Support affiche l'erreur elle-même.
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
