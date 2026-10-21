// ─────────────────────────────────────────────
//  ADDRESS - RESPONSE DTO
// ─────────────────────────────────────────────

import type { IAddress } from "../../models/address.model.js";

export interface AddressResponseDto {
  id: string;
  userId: string;
  label?: string | undefined;
  destinataire?: string | undefined;
  telephone: string;
  adresse: string;
  ville: string;
  commune?: string | undefined;
  pays: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const toAddressResponseDto = (address: IAddress): AddressResponseDto => ({
  id: address._id.toString(),
  userId: address.userId.toString(),
  label: address.label,
  destinataire: address.destinataire,
  telephone: address.telephone,
  adresse: address.adresse,
  ville: address.ville,
  commune: address.commune,
  pays: address.pays,
  isDefault: address.isDefault,
  createdAt: address.createdAt,
  updatedAt: address.updatedAt,
});
