import { z } from "zod";

// Bornes de `updateForm` et `registerForm` côté back : nom et prénom 2–50,
// téléphone 9–12 comme à l'inscription.
export const profileSchema = z.object({
  prenom: z.string().trim().min(2, "Entre 2 et 50 caractères.").max(50, "Entre 2 et 50 caractères."),
  nom: z.string().trim().min(2, "Entre 2 et 50 caractères.").max(50, "Entre 2 et 50 caractères."),
  telephone: z
    .string()
    .trim()
    .min(9, "Entre 9 et 12 caractères.")
    .max(12, "Entre 9 et 12 caractères."),
});

export type ProfileValues = z.infer<typeof profileSchema>;
