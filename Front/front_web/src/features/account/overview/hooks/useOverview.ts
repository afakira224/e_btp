import { useCallback } from "react";
import type { Address } from "../../../../entities/address";
import { OrderStatus } from "../../../../entities/order";
import { useResource } from "../../../catalog";
import { fetchAddresses, fetchOrders } from "../../shared";

interface Overview {
  totalOrders: number;
  inProgress: number;
  addresses: Address[];
}

/**
 * Aperçus affichés sur les cartes de « Mon compte », en une passe.
 * Les décomptes de commandes sont lus côté serveur avec `limit=1` — seul
 * le total compte : justes quel que soit le nombre de commandes, sans tout
 * rapatrier pour compter. « En cours » compte aussi les commandes qui
 * attendent leur paiement en ligne : il reste quelque chose à faire.
 */
export const useOverview = (userId: string) => {
  const load = useCallback(
    async (signal: AbortSignal): Promise<Overview> => {
      const count = (status?: OrderStatus) =>
        fetchOrders({ userId, status, page: 1, limit: 1 }, signal).then((page) => page.total);

      const [total, inProgress, awaitingPayment, addresses] = await Promise.all([
        count(),
        count(OrderStatus.IN_PROGRESS),
        count(OrderStatus.AWAITING_PAYMENT),
        fetchAddresses(userId, signal),
      ]);

      return {
        totalOrders: total,
        inProgress: inProgress + awaitingPayment,
        addresses,
      };
    },
    [userId]
  );

  return useResource<Overview | null>(load, null, userId);
};
