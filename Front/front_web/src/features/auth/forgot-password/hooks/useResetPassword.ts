import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../../../shared/api";
import { resetPasswordRequest } from "../api/forgotPassword.api";
import type { ResetPasswordValues } from "../validation/forgotPassword.schema";

export const useResetPassword = (token: string | undefined) => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  const submit = useCallback(
    async (values: ResetPasswordValues) => {
      setError(null);

      if (!token) {
        setError("Lien de réinitialisation invalide.");
        return;
      }

      try {
        await resetPasswordRequest(token, {
          password: values.password,
          confirmPassword: values.confirmPassword,
        });
        setIsDone(true);

        // Toutes les sessions du compte viennent d'être révoquées : la
        // reconnexion est obligatoire, on y emmène l'utilisateur.
        setTimeout(() => navigate("/login", { replace: true }), 2500);
      } catch (caught) {
        if (caught instanceof ApiError) {
          setError(caught.message);
          return;
        }
        setError("Une erreur est survenue. Réessayez.");
      }
    },
    [navigate, token]
  );

  return { submit, error, isDone };
};
