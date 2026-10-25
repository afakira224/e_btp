import { useEffect, useState } from "react";

/**
 * L'heure courante, rafraîchie toutes les 30 secondes : assez pour un compte
 * à rebours exprimé en minutes, sans rendre la page à chaque seconde.
 */
export const useNow = (): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
};
