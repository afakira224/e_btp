import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductBoutique } from "../../../../entities/product";

import type { ProductPage } from "../api/catalog.api";

export type { ProductPage };

export type PageLoader = (
  page: number,
  limit: number,
  signal: AbortSignal
) => Promise<ProductPage>;

interface Status {
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  total: number;
}

const INITIAL: Status = {
  isLoading: true,
  error: null,
  hasMore: true,
  total: 0,
};

// ─────────────────────────────────────────────
//  useInfiniteProducts
//
//  Charge une liste de produits page par page. `key` identifie ce qui est
//  lu : quand elle change — on passe d'une catégorie à l'autre — la liste
//  repart de zéro au lieu d'empiler les résultats de deux listes
//  différentes.
//
//  Les garde-fous ne sont pas décoratifs :
//   • `inFlight` empêche deux requêtes simultanées — l'observateur peut se
//     déclencher deux fois avant que la première réponse n'arrive ;
//   • `done` fige la liste quand le serveur annonce la fin, sinon on
//     redemanderait une page vide indéfiniment ;
//   • `generation` invalide une requête périmée *et* libère `inFlight` —
//     sans quoi le double montage du mode strict fige la liste sur ses
//     blocs d'attente.
// ─────────────────────────────────────────────
export const useInfiniteProducts = (
  load: PageLoader,
  { pageSize = 12, key = "" }: { pageSize?: number; key?: string } = {}
) => {
  const [items, setItems] = useState<ProductBoutique[]>([]);
  const [status, setStatus] = useState<Status>(INITIAL);

  const nextPage = useRef(1);
  const inFlight = useRef(false);
  const done = useRef(false);
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);

  // `load` est recréé à chaque rendu chez l'appelant : on garde la dernière
  // version dans une ref plutôt que de la mettre en dépendance.
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });

  const loadMore = useCallback(async () => {
    if (inFlight.current || done.current) return;

    inFlight.current = true;
    const gen = generation.current;
    const target = nextPage.current;
    setStatus((current) => ({ ...current, isLoading: true, error: null }));

    const controller = new AbortController();
    abort.current = controller;

    try {
      const page = await loader.current(target, pageSize, controller.signal);
      if (gen !== generation.current) return;

      setItems((previous) => {
        const seen = new Set(previous.map((item) => item.id));
        return [...previous, ...page.items.filter((item) => !seen.has(item.id))];
      });

      nextPage.current = target + 1;
      if (!page.hasMore) done.current = true;

      setStatus({
        isLoading: false,
        error: null,
        hasMore: page.hasMore,
        total: page.total,
      });
    } catch (caught) {
      if (gen !== generation.current) return;
      if ((caught as Error).name === "AbortError") return;
      setStatus((current) => ({
        ...current,
        isLoading: false,
        error: (caught as Error).message,
      }));
    } finally {
      // Une requête périmée ne libère pas le garde de celle qui l'a remplacée.
      if (gen === generation.current) inFlight.current = false;
    }
  }, [pageSize]);

  const retry = useCallback(() => {
    setStatus((current) => ({ ...current, error: null }));
    void loadMore();
  }, [loadMore]);

  useEffect(() => {
    // Remise à zéro complète : `key` a changé, ce qui était chargé ne
    // concerne plus la liste demandée.
    generation.current += 1;
    inFlight.current = false;
    done.current = false;
    nextPage.current = 1;

    // oxlint-disable-next-line react/set-state-in-effect
    setItems([]);
    // oxlint-disable-next-line react/set-state-in-effect
    setStatus(INITIAL);
    // oxlint-disable-next-line react/set-state-in-effect
    void loadMore();

    return () => {
      generation.current += 1;
      inFlight.current = false;
      abort.current?.abort();
    };
  }, [key, loadMore]);

  return { items, ...status, loadMore, retry };
};

// ─────────────────────────────────────────────
//  useSentinel
//  Déclenche `onReach` quand la balise entre dans le champ, avec une marge
//  d'anticipation : la page suivante arrive avant que l'utilisateur ne
//  touche le bas, il ne voit jamais de vide.
//
//  L'observateur est recréé à chaque changement de `dependency` : sans cela,
//  une balise restée visible après un chargement ne redéclencherait rien —
//  `isIntersecting` ne repasse pas à vrai s'il ne cesse jamais de l'être.
// ─────────────────────────────────────────────
export const useSentinel = (
  onReach: () => void,
  { enabled, dependency }: { enabled: boolean; dependency: unknown }
) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const callback = useRef(onReach);

  useEffect(() => {
    callback.current = onReach;
  });

  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) callback.current();
      },
      { rootMargin: "500px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, dependency]);

  return ref;
};
