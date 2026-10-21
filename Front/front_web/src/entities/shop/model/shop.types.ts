// ─────────────────────────────────────────────
//  Boutique — miroir de ShopResponseDto
//  (Back/src/shared/interfaces/Shop.interfaces.ts), à une exception près.
//
//  Le téléphone de la boutique ne doit JAMAIS être affiché, en aucun cas.
//  Le back l'envoie pourtant (dans GET /shops, GET /shops/:id et dans la
//  boutique imbriquée de chaque offre) : il est volontairement absent de ce
//  type, pour qu'aucun composant ne puisse le lire sans que la compilation
//  échoue. Ne pas l'ajouter ici.
// ─────────────────────────────────────────────
export interface Shop {
  id: string;
  ownerId: string;
  nom: string;
  description?: string | undefined;
  logo?: string | null | undefined;
  email?: string | undefined;
  adresse?: string | undefined;
  /** Le DTO déclare `Date` ; sérialisé en JSON, le front reçoit une chaîne. */
  createdAt: string;
  updatedAt: string;
}
