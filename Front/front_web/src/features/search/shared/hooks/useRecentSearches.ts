import { useCallback, useSyncExternalStore } from "react";
import { normalize } from "../utils/text";

// ─────────────────────────────────────────────
//  Recherches récentes.
//
//  Une commodité propre au navigateur, pas une donnée de compte : le back
//  n'a pas d'historique de recherche, on ne l'invente pas côté serveur.
//  Le stockage peut être indisponible (navigation privée, stockage
//  bloqué) : chaque accès est protégé et la liste retombe à vide.
//
//  Un magasin unique, partagé par `useSyncExternalStore` : la barre de
//  l'en-tête et la page de résultats voient la même liste sans se passer
//  de props.
// ─────────────────────────────────────────────

const STORAGE_KEY = "btp.recentSearches";
const MAX_RECENT = 6;

const read = (): string[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string").slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
};

let snapshot: string[] = read();
const listeners = new Set<() => void>();

const commit = (next: string[]) => {
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Stockage refusé : la liste vit au moins le temps de la session.
  }
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => snapshot;

export const useRecentSearches = () => {
  const recent = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  /** Place `term` en tête, sans doublon insensible aux accents et à la casse. */
  const remember = useCallback((term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) return;
    const key = normalize(trimmed);
    commit(
      [trimmed, ...snapshot.filter((entry) => normalize(entry) !== key)].slice(0, MAX_RECENT)
    );
  }, []);

  const forget = useCallback((term: string) => {
    commit(snapshot.filter((entry) => entry !== term));
  }, []);

  const clear = useCallback(() => commit([]), []);

  return { recent, remember, forget, clear };
};
