import { z } from "zod";
import { emailSchema } from "../../shared";

// À la connexion on ne réapplique pas les règles de complexité : un ancien
// mot de passe valide doit pouvoir se saisir sans être refusé côté client.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Le mot de passe est requis."),
});

export type LoginValues = z.infer<typeof loginSchema>;
