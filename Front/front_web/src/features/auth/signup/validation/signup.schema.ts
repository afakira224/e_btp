import { z } from "zod";
import { emailSchema, passwordSchema } from "../../shared";

// ─────────────────────────────────────────────
//  Inscription publique.
//
//  Aucun champ `role` : l'inscription ne crée que des comptes « user ».
//  Les comptes boutique, société et administrateur passent par une voie
//  interne — un rôle choisi par le client serait un rôle que n'importe qui
//  peut réclamer.
//
//  Les bornes reprennent `registerForm` côté back : nom et prénom 2–50,
//  téléphone 9–12.
// ─────────────────────────────────────────────
export const signupSchema = z
  .object({
    prenom: z
      .string()
      .trim()
      .min(2, "Entre 2 et 50 caractères.")
      .max(50, "Entre 2 et 50 caractères."),
    nom: z
      .string()
      .trim()
      .min(2, "Entre 2 et 50 caractères.")
      .max(50, "Entre 2 et 50 caractères."),
    email: emailSchema,
    telephone: z
      .string()
      .trim()
      .min(9, "Entre 9 et 12 caractères.")
      .max(12, "Entre 9 et 12 caractères."),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "La confirmation est requise."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  });

export type SignupValues = z.infer<typeof signupSchema>;
