import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// ─────────────────────────────────────────────
//  Retour en haut de page à chaque nouvelle page.
//
//  Sans lui, une page ouverte depuis le bas d'une autre (« Modifier » sur la
//  dernière adresse, une fiche produit en bas de grille) s'affichait déjà
//  défilée. Deux exceptions volontaires :
//   • Précédent / Suivant (POP) : le navigateur restaure la position
//     d'origine, on ne la lui vole pas ;
//   • un changement de paramètres seuls (filtres, tri, recherche) : on reste
//     où l'on est, seul le chemin compte.
// ─────────────────────────────────────────────
export const ScrollToTop = () => {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType !== "POP") window.scrollTo(0, 0);
  }, [pathname, navigationType]);

  return null;
};
