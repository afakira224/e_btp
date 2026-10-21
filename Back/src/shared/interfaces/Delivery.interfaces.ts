// ─────────────────────────────────────────────
//  LIVRAISON - RESPONSE DTO
// ─────────────────────────────────────────────

import { CURRENCY, type DeliveryMode, type IOrderDelivery } from "../../models/delivery.model.js";
import type { IShop } from "../../models/boutique.model.js";
import type { IProductBoutique } from "../../models/product.model.js";
import {
  normalizeSettings,
  optionsOf,
  resolveEffectiveDelivery,
  shopDeliveryOf,
  type DeliveryOption,
} from "../helpers/delivery.helper.js";

export interface DeliverySettingsDto {
  modes: DeliveryMode[];
  /** Tarif du prix fixe ; null quand ce mode n'est pas actif. */
  flatRateFee: number | null;
  /** Modes actifs avec leurs frais, prêts à afficher. */
  options: DeliveryOption[];
  currency: typeof CURRENCY;
}

/** Livraison qui s'applique à une offre, et d'où elle vient. */
export interface EffectiveDeliveryDto extends DeliverySettingsDto {
  source: "shop" | "product";
}

/** GET / PUT /shops/:id/delivery : réglages de la boutique et leur portée. */
export interface ShopDeliveryResponseDto extends DeliverySettingsDto {
  boutiqueId: string;
  adresse?: string | undefined;
  /** Produits qui suivent ces réglages. */
  inheritingProducts: number;
  /** Produits à la livraison personnalisée, que ces réglages ne touchent pas. */
  customProducts: number;
}

export interface OrderDeliveryDto {
  boutiqueId: string;
  boutiqueNom?: string | undefined;
  method: DeliveryMode;
  fee: number;
  pickupAdresse?: string | undefined;
}

export const toShopDeliverySettingsDto = (shop: Pick<IShop, "delivery">): DeliverySettingsDto => {
  const settings = shopDeliveryOf(shop);
  const { modes, flatRateFee } = normalizeSettings(settings.modes, settings.flatRateFee);
  return { modes, flatRateFee, options: optionsOf({ modes, flatRateFee }), currency: CURRENCY };
};

export const toShopDeliveryResponseDto = (
  shop: Pick<IShop, "_id" | "delivery" | "adresse">,
  counts: { inheritingProducts: number; customProducts: number }
): ShopDeliveryResponseDto => ({
  boutiqueId: shop._id.toString(),
  adresse: shop.adresse,
  ...toShopDeliverySettingsDto(shop),
  ...counts,
});

export const toEffectiveDeliveryDto = (
  offer: Pick<IProductBoutique, "delivery">,
  shop: Pick<IShop, "delivery">
): EffectiveDeliveryDto => {
  const effective = resolveEffectiveDelivery(offer, shop);
  return { ...effective, options: optionsOf(effective), currency: CURRENCY };
};

export const toOrderDeliveryDto = (delivery: IOrderDelivery): OrderDeliveryDto => ({
  boutiqueId: delivery.boutiqueId.toString(),
  boutiqueNom: delivery.boutiqueNom,
  method: delivery.method,
  fee: delivery.fee,
  pickupAdresse: delivery.pickupAdresse,
});
