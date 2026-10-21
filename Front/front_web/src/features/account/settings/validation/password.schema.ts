import { z } from "zod";
import { passwordSchema } from "../../../auth";

// Miroir de `changePasswordForm` côté back : mêmes règles, mêmes messages.
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Le mot de passe actuel est requis."),
    newPassword: passwordSchema,
    confirmNewPassword: z.string().min(1, "La confirmation est requise."),
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    message: "Le nouveau mot de passe doit être différent de l'ancien.",
    path: ["newPassword"],
  })
  .refine((values) => values.newPassword === values.confirmNewPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmNewPassword"],
  });

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
