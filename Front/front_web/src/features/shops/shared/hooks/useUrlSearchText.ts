import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

// ─────────────────────────────────────────────
//  useUrlSearchText
//
//  Champ texte dont la valeur validée vit dans l'URL (`?q=`), écrite après
//  une courte pause de frappe. Deux pièges évités :
//   • l'URL ne réécrit jamais le champ pendant que l'on tape — sinon une
//     écriture différée pourrait effacer les lettres tapées entre-temps ;
//   • un changement d'URL venu d'ailleurs (bouton Précédent) met le champ
//     à jour sans être aussitôt écrasé par une écriture en attente.
//  Le drapeau `dirty` distingue les deux origines.
// ─────────────────────────────────────────────
export const useUrlSearchText = (param = "q", delay = 300) => {
  const [params, setParams] = useSearchParams();
  const committed = (params.get(param) ?? "").trim();

  const [value, setValue] = useState(committed);
  const [dirty, setDirty] = useState(false);

  // Suivre l'URL sans effet, et seulement hors saisie. La comparaison se
  // fait sur la valeur nettoyée : une espace finale en cours de frappe ne
  // doit pas disparaître quand l'écriture différée revient par l'URL.
  const [seen, setSeen] = useState(committed);
  if (committed !== seen) {
    setSeen(committed);
    if (!dirty && committed !== value.trim()) setValue(committed);
  }

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => {
      setDirty(false);
      const next = value.trim();
      // Remplacement plutôt qu'ajout : une entrée d'historique par pause de
      // frappe rendrait le bouton Précédent inutilisable.
      setParams(
        (previous) => {
          const updated = new URLSearchParams(previous);
          if (next) updated.set(param, next);
          else updated.delete(param);
          return updated;
        },
        { replace: true }
      );
    }, delay);
    return () => window.clearTimeout(timer);
  }, [value, dirty, delay, param, setParams]);

  return {
    /** Texte affiché dans le champ. */
    value,
    /** Texte validé, celui qui pilote les requêtes. */
    query: committed,
    onChange: (next: string) => {
      setValue(next);
      setDirty(true);
    },
  };
};
