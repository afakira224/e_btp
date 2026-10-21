import { useEffect, useRef, useState } from "react";

interface Resource<T> {
  data: T;
  isLoading: boolean;
  error: string | null;
}

/**
 * Chargement d'une lecture simple.
 *
 * Volontairement minimal : pas de cache, pas de revalidation. Le jour où il
 * faudra du cache partagé, c'est ce hook qu'on remplacera par TanStack Query
 * — les composants, eux, ne changeront pas.
 *
 * `key` identifie ce qui est lu : sur une page pilotée par un paramètre
 * d'URL, passer cet identifiant relance la lecture quand il change. Sans
 * lui, naviguer d'une catégorie à l'autre laisserait la précédente à
 * l'écran, puisque le composant n'est pas démonté entre les deux.
 */
export const useResource = <T>(
  load: (signal: AbortSignal) => Promise<T>,
  fallback: T,
  key = ""
): Resource<T> => {
  const [data, setData] = useState<T>(fallback);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `load` est recréé à chaque rendu chez l'appelant : le placer dans les
  // dépendances relancerait la requête en boucle. On garde la dernière
  // version dans une ref et on ne se fie qu'à `key`.
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });

  useEffect(() => {
    const controller = new AbortController();

    // Repasser en chargement est indispensable quand `key` change : sinon
    // la donnée précédente reste à l'écran, sans rien pour signaler qu'elle
    // ne correspond plus à ce que l'utilisateur vient de demander.
    // oxlint-disable-next-line react/set-state-in-effect
    setIsLoading(true);

    // oxlint-disable-next-line react/set-state-in-effect
    void (async () => {
      try {
        const result = await loader.current(controller.signal);
        if (controller.signal.aborted) return;
        setData(result);
        setError(null);
      } catch (caught) {
        if (controller.signal.aborted || (caught as Error).name === "AbortError") return;
        setError((caught as Error).message);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [key]);

  return { data, isLoading, error };
};
