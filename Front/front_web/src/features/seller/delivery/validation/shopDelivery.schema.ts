import { z } from "zod";
import { deliveryModesSchema, refineDelivery, type DeliveryDraft } from "../../shared";

/**
 * Réglages par défaut d'une boutique. L'adresse de la boutique entre dans
 * la règle : sans elle, le retrait en boutique est refusé.
 */
export const shopDeliverySchema = (shopAddress: string | undefined) =>
  z
    .object({ modes: deliveryModesSchema, flatRateFee: z.string() })
    .superRefine((values, ctx) => refineDelivery(values, shopAddress, ctx));

export type ShopDeliveryValues = DeliveryDraft;
