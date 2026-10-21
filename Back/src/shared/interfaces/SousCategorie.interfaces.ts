// ─────────────────────────────────────────────
//  SOUS-CATEGORIE - RESPONSE DTO

import type { ISousCategorie } from "../../models/sousCategorie.model.js";

// ─────────────────────────────────────────────
export interface SousCategorieResponseDto {
  id:          string;
  nom:         string;
  description?: string | undefined;
  image?:      string | null | undefined;
  ordre:       number;
  actif:       boolean;
  createdAt:   Date;
  updatedAt:   Date;
}
 
export const toSousCategorieResponseDto = (sousCategorie: ISousCategorie): SousCategorieResponseDto => ({
  id:          sousCategorie._id.toString(), 
  nom:         sousCategorie.nom,
  description: sousCategorie.description,
  image:       sousCategorie.image,
  ordre:       sousCategorie.ordre ?? 0,
  actif:       sousCategorie.actif,
  createdAt:   sousCategorie.createdAt,
  updatedAt:   sousCategorie.updatedAt,
});