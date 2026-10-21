import { z } from "zod";

// ─────────────────────────────────────────────
//  Règles de mot de passe — copie fidèle de auth.form.ts côté back.
//  Toute divergence produirait un 422 que l'utilisateur ne comprendrait pas.
// ─────────────────────────────────────────────
export const SPECIAL_CHARACTERS = "!@#$%^&*";

export const passwordSchema = z
  .string()
  .min(8, "Minimum 8 caractères.")
  .regex(/[A-Z]/, "Au moins une majuscule.")
  .regex(/[0-9]/, "Au moins un chiffre.")
  .regex(/[!@#$%^&*]/, `Au moins un caractère spécial (${SPECIAL_CHARACTERS}).`);

export const emailSchema = z
  .string()
  .min(1, "L'email est requis.")
  .email("Email invalide.");

export const PASSWORD_HINT = `8 caractères minimum, avec majuscule, chiffre et caractère spécial (${SPECIAL_CHARACTERS}).`;

export interface PasswordCheck {
  label: string;
  met: boolean;
}

/** Détail des règles, pour l'indicateur affiché sous le champ à l'inscription. */
export const checkPassword = (value: string): PasswordCheck[] => [
  { label: "8 caractères", met: value.length >= 8 },
  { label: "Une majuscule", met: /[A-Z]/.test(value) },
  { label: "Un chiffre", met: /[0-9]/.test(value) },
  { label: `Un caractère spécial ${SPECIAL_CHARACTERS}`, met: /[!@#$%^&*]/.test(value) },
];
