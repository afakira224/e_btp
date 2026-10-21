// ─────────────────────────────────────────────
//  Taxonomie du catalogue — Famille > Catégorie > Sous-catégorie.
//
//  Miroir strict des DTO de retour du back
//  (Back/src/shared/interfaces/{Famille,Categorie,SousCategorie}.interfaces.ts) :
//  `id` et non `_id`, imbrication descendante, et les horodatages que les
//  DTO exposent.
//
//  Les DTO déclarent `createdAt: Date` ; sérialisés en JSON, ils arrivent
//  ici en chaînes. C'est ce que le front reçoit réellement.
// ─────────────────────────────────────────────

export interface SousCategorie {
  id: string;
  nom: string;
  description?: string | undefined;
  image?: string | null | undefined;
  ordre: number;
  actif: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Categorie {
  id: string;
  familleId: string;
  nom: string;
  description?: string | undefined;
  sousCategories?: SousCategorie[] | undefined;
  image?: string | null | undefined;
  ordre: number;
  actif: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Famille {
  id: string;
  nom: string;
  description?: string | undefined;
  categories: Categorie[];
  image?: string | null | undefined;
  ordre: number;
  actif: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Tri d'affichage : `ordre` fait foi, le nom départage les égalités. */
export const byOrdre = <T extends { ordre: number; nom: string }>(a: T, b: T): number =>
  a.ordre === b.ordre ? a.nom.localeCompare(b.nom, "fr") : a.ordre - b.ordre;
