import { useEffect } from "react";

const SITE = "BTP Platform";

/**
 * Titre de l'onglet, rendu au précédent quand la page est quittée : sans
 * cela, revenir à l'accueil en navigation interne garderait le titre de la
 * dernière page visitée.
 */
export const useDocumentTitle = (title: string) => {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · ${SITE}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
};
