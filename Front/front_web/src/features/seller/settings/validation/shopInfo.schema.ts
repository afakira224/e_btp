import { z } from "zod";
import type { Shop } from "../../../../entities/shop";

export const LOGO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_LOGO_SIZE = 5 * 1024 * 1024;

// Bornes d'updateShopForm côté back ; le serveur revalide tout, et refuse
// d'effacer l'adresse tant que le retrait en boutique est proposé.
export const shopInfoSchema = z.object({
  nom: z
    .string()
    .trim()
    .min(2, "Le nom doit compter entre 2 et 100 caractères.")
    .max(100, "Le nom doit compter entre 2 et 100 caractères."),
  description: z.string().trim().max(1000, "La présentation ne peut dépasser 1000 caractères."),
  email: z.string().trim().pipe(z.email("Email invalide.")),
  adresse: z.string().trim().max(255, "L'adresse ne peut dépasser 255 caractères."),
  logo: z
    .instanceof(File)
    .nullable()
    .refine((file) => file === null || LOGO_TYPES.includes(file.type), "Formats acceptés : JPEG, PNG, WebP ou GIF.")
    .refine((file) => file === null || file.size <= MAX_LOGO_SIZE, "Le logo doit peser 5 Mo au plus."),
  removeLogo: z.boolean(),
});

export type ShopInfoValues = z.infer<typeof shopInfoSchema>;

export const valuesOf = (shop: Shop): ShopInfoValues => ({
  nom: shop.nom,
  description: shop.description ?? "",
  email: shop.email ?? "",
  adresse: shop.adresse ?? "",
  logo: null,
  removeLogo: false,
});
