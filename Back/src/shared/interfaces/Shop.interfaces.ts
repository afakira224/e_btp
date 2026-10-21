// ─────────────────────────────────────────────
//  SHOP - RESPONSE DTO
// ─────────────────────────────────────────────

import type { IShop } from "../../models/boutique.model.js";
import { toShopDeliverySettingsDto, type DeliverySettingsDto } from "./Delivery.interfaces.js";

export interface ShopResponseDto {
  id: string;
  ownerId: string;
  nom: string;
  description?: string | undefined;
  logo?: string | null | undefined;
  telephone?: string | undefined;
  email?: string | undefined;
  adresse?: string | undefined;
  /** Modes de livraison proposés par défaut aux produits de la boutique. */
  delivery: DeliverySettingsDto;
  createdAt: Date;
  updatedAt: Date;
}

export const toShopResponseDto = (shop: IShop): ShopResponseDto => ({
  id: shop._id.toString(),
  ownerId: shop.ownerId.toString(),
  nom: shop.nom,
  description: shop.description,
  logo: shop.logo,
  telephone: shop.telephone,
  email: shop.email,
  adresse: shop.adresse,
  delivery: toShopDeliverySettingsDto(shop),
  createdAt: shop.createdAt,
  updatedAt: shop.updatedAt,
});