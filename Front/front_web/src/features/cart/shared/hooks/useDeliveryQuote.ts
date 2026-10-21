import { useCallback, useEffect, useRef, useState } from "react";
import type { Cart } from "../../../../entities/cart";
import type {
  DeliveryMode,
  DeliveryQuote,
  DeliverySelection,
} from "../../../../entities/delivery";
import { fetchDeliveryQuote } from "../api/cart.api";

// ─────────────────────────────────────────────
//  useDeliveryQuote
//
//  Le devis est relu à chaque changement du panier ou du choix du client :
//  modes proposés, frais et total viennent du serveur, jamais d'un calcul
//  local. Le front n'envoie que des modes.
//
//  Un mode choisi pour une boutique sortie du panier est oublié : il ne
//  doit pas resurgir si elle y revient avec d'autres articles.
// ─────────────────────────────────────────────
export const useDeliveryQuote = (userId: string, cart: Cart) => {
  const [selection, setSelection] = useState<DeliverySelection>({});
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // La route n'accepte pas de signal d'annulation : un compteur écarte les
  // réponses arrivées après une requête plus récente.
  const generation = useRef(0);

  // Ce qui change le devis : les lignes et leurs quantités, pas l'objet panier.
  const cartKey = cart.items.map((item) => `${item.productBoutiqueId}:${item.quantity}`).join("|");

  useEffect(() => {
    if (!userId || cart.items.length === 0) {
      // oxlint-disable-next-line react/set-state-in-effect
      setQuote(null);
      return;
    }

    const current = ++generation.current;
    // oxlint-disable-next-line react/set-state-in-effect
    setIsLoading(true);

    void (async () => {
      try {
        const next = await fetchDeliveryQuote(userId, selection);
        if (current !== generation.current) return;
        setQuote(next);
        setError(null);

        const present = new Set(next.groups.map((group) => group.boutiqueId));
        if (Object.keys(selection).some((boutiqueId) => !present.has(boutiqueId))) {
          setSelection((previous) =>
            Object.fromEntries(Object.entries(previous).filter(([id]) => present.has(id)))
          );
        }
      } catch (caught) {
        if (current !== generation.current) return;
        setError((caught as Error).message);
      } finally {
        if (current === generation.current) setIsLoading(false);
      }
    })();
    // `cart.items` est lu à travers `cartKey` : l'objet change à chaque écriture
    // même quand les lignes sont identiques.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [userId, cartKey, selection]);

  const choose = useCallback((boutiqueId: string, method: DeliveryMode) => {
    setSelection((previous) => ({ ...previous, [boutiqueId]: method }));
  }, []);

  return { quote, selection, choose, isLoading, error };
};
