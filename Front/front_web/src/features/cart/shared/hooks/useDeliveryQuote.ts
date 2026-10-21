import { useCallback, useEffect, useRef, useState } from "react";
import type { DeliveryMode, DeliveryQuote } from "../../../../entities/delivery";
import { useAuth } from "../../../auth";
import { fetchDeliveryQuote } from "../api/cart.api";
import { useCart } from "./useCart";

// ─────────────────────────────────────────────
//  useDeliveryQuote
//
//  Le devis est relu à chaque changement du panier ou du choix du client :
//  modes proposés, frais et total viennent du serveur, jamais d'un calcul
//  local. Le front n'envoie que des modes.
//
//  Le choix vit dans le contexte du panier : le panier et la page de
//  commande lisent et modifient le même. Un mode choisi pour une boutique
//  sortie du panier est oublié : il ne doit pas resurgir si elle y revient
//  avec d'autres articles.
// ─────────────────────────────────────────────
export const useDeliveryQuote = () => {
  const { user } = useAuth();
  const userId = user?._id ?? "";
  const { cart, deliverySelection: selection, setDeliverySelection } = useCart();
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Relecture demandée par l'appelant : après un refus du serveur, par exemple.
  const [revision, setRevision] = useState(0);

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
          setDeliverySelection((previous) =>
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
  }, [userId, cartKey, selection, revision]);

  const choose = useCallback(
    (boutiqueId: string, method: DeliveryMode) => {
      setDeliverySelection((previous) => ({ ...previous, [boutiqueId]: method }));
    },
    [setDeliverySelection]
  );

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  return { quote, selection, choose, reload, isLoading, error };
};
