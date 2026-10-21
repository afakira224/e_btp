// ─────────────────────────────────────────────
//  Adresse de livraison — miroir de AddressResponseDto
//  (Back/src/shared/interfaces/Address.interfaces.ts).
//
//  Le téléphone est celui du destinataire, saisi par le client lui-même
//  pour être joint à la livraison : rien à voir avec celui d'une boutique.
// ─────────────────────────────────────────────
export interface Address {
  id: string;
  userId: string;
  /** Nom court choisi par le client : « Maison », « Chantier Kipé »… */
  label?: string | undefined;
  destinataire?: string | undefined;
  telephone: string;
  adresse: string;
  ville: string;
  commune?: string | undefined;
  pays: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Ce que le client saisit : le reste est géré par le serveur. */
export interface AddressInput {
  label?: string | undefined;
  destinataire?: string | undefined;
  telephone: string;
  adresse: string;
  ville: string;
  commune?: string | undefined;
  pays?: string | undefined;
  isDefault?: boolean | undefined;
}

/** Ligne « commune, ville » — puis le pays s'il n'est pas la Guinée. */
export const addressLocality = (
  address: Pick<Address, "commune" | "ville" | "pays">
): string =>
  [address.commune, address.ville, address.pays !== "Guinée" ? address.pays : undefined]
    .filter(Boolean)
    .join(", ");
