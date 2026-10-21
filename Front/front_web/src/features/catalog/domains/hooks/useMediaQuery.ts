import { useSyncExternalStore } from "react";

/** Vrai tant que la requête média correspond (suit le redimensionnement). */
export const useMediaQuery = (query: string): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
