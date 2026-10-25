import { useCallback, useState } from "react";
import type { ShopOrder } from "../../../../entities/order";
import { useResource } from "../../../catalog";
import { fetchShopOrder } from "../api/orders.api";

/**
 * Une sous-commande et sa dernière version connue. Après une action, la
 * réponse du serveur fait foi : on l'affiche sans relire.
 */
export const useShopOrder = (id: string) => {
  const load = useCallback((signal: AbortSignal) => fetchShopOrder(id, signal), [id]);
  const resource = useResource<ShopOrder | null>(load, null, id);
  const [updated, setUpdated] = useState<ShopOrder | null>(null);

  const part = updated?.id === id ? updated : resource.data?.id === id ? resource.data : null;
  return { part, isLoading: resource.isLoading, error: resource.error, replace: setUpdated };
};
