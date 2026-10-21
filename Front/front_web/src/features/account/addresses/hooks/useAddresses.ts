import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "../../../../entities/address";
import { deleteAddress, fetchAddresses, setDefaultAddress } from "../../shared";

// ─────────────────────────────────────────────
//  useAddresses
//  Après chaque modification, la liste est relue plutôt que corrigée sur
//  place : c'est le serveur qui décide quelle adresse devient « par
//  défaut » quand on en retire ou supprime une. Deviner côté client, c'est
//  risquer d'afficher un état qu'il n'a pas.
// ─────────────────────────────────────────────
export const useAddresses = (userId: string) => {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      const list = await fetchAddresses(userId, current.signal);
      if (current.signal.aborted) return;
      setAddresses(list);
      setError(null);
    } catch (caught) {
      if (current.signal.aborted || (caught as Error).name === "AbortError") return;
      setError((caught as Error).message);
    } finally {
      if (!current.signal.aborted) setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void reload();
    return () => controller.current?.abort();
  }, [reload]);

  // Ajout et modification vivent sur leur propre page (AddressFormPage) ;
  // restent ici les actions d'un clic faites depuis la liste. Chacune lève
  // en cas d'échec : la page affiche l'erreur.
  const makeDefault = useCallback(
    async (id: string) => {
      await setDefaultAddress(id);
      await reload();
    },
    [reload]
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteAddress(id);
      await reload();
    },
    [reload]
  );

  return { addresses, isLoading, error, makeDefault, remove, reload };
};
