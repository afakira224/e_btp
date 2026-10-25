import { useCallback, useEffect, useState } from "react";
import { ShopRequestStatus, type ShopRequest } from "../../../../entities/shop-request";
import { EntityType } from "../../../../entities/user";
import { useAuth } from "../../../auth";
import { useResource } from "../../../catalog";
import { fetchMyShopRequests } from "../api/shopRequest.api";

/**
 * Demandes du compte connecté, la plus récente en tête.
 *
 * Une demande approuvée signifie que le compte est devenu gérant côté
 * serveur. Le profil chargé au démarrage dit encore « user » : on le relit,
 * sans quoi l'espace vendeur resterait fermé jusqu'au prochain
 * rafraîchissement de page.
 */
export const useMyShopRequests = () => {
  const { user, refresh } = useAuth();
  const [version, setVersion] = useState(0);

  const load = useCallback((signal: AbortSignal) => fetchMyShopRequests(signal), []);
  const requests = useResource<ShopRequest[] | null>(load, null, `${user?._id ?? ""}:${version}`);

  const approved = requests.data?.some((request) => request.status === ShopRequestStatus.APPROVED) ?? false;
  const stale = approved && user !== null && user.role !== EntityType.SHOP && user.role !== EntityType.ADMIN;

  useEffect(() => {
    if (stale) void refresh();
  }, [refresh, stale]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  return { ...requests, latest: requests.data?.[0] ?? null, reload };
};
