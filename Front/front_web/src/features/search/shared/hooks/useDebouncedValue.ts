import { useEffect, useState } from "react";

/**
 * Renvoie `value` une fois qu'elle a cessé de changer pendant `delay` ms.
 * Sans cela, chaque frappe dans la barre de recherche partirait au serveur.
 */
export const useDebouncedValue = <T>(value: T, delay: number): T => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
};
