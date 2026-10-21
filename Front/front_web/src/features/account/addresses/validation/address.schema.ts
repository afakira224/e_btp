import { z } from "zod";

// ─────────────────────────────────────────────
//  Adresse de livraison — bornes reprises de address.form.ts côté back :
//  un écart produirait un 422 incompréhensible pour l'utilisateur.
// ─────────────────────────────────────────────
export const addressSchema = z.object({
  label: z.string().trim().max(50, "Maximum 50 caractères."),
  destinataire: z.string().trim().max(100, "Maximum 100 caractères."),
  telephone: z
    .string()
    .trim()
    .min(9, "Entre 9 et 12 caractères.")
    .max(12, "Entre 9 et 12 caractères."),
  adresse: z
    .string()
    .trim()
    .min(1, "L'adresse est requise.")
    .max(255, "Maximum 255 caractères."),
  commune: z.string().trim().max(100, "Maximum 100 caractères."),
  ville: z.string().trim().min(1, "La ville est requise.").max(100, "Maximum 100 caractères."),
  pays: z.string().trim().max(100, "Maximum 100 caractères."),
  isDefault: z.boolean(),
});

export type AddressValues = z.infer<typeof addressSchema>;
