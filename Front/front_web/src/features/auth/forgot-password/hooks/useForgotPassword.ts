import { useCallback, useState } from "react";
import { ApiError } from "../../../../shared/api";
import { forgotPasswordRequest } from "../api/forgotPassword.api";
import type { ForgotPasswordValues } from "../validation/forgotPassword.schema";

export const useForgotPassword = () => {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | undefined>(undefined);

  const submit = useCallback(async (values: ForgotPasswordValues) => {
    setError(null);
    const email = values.email.trim();

    try {
      const result = await forgotPasswordRequest({ email });
      setResetLink(result.resetLink);
      setSentTo(email);
    } catch (caught) {
      if (caught instanceof ApiError) {
        // L'API répond 404 sur un email inconnu, ce qui permet d'énumérer
        // les comptes. On affiche le même écran de confirmation dans les
        // deux cas : rien ne filtre côté interface.
        if (caught.statusCode === 404) {
          setSentTo(email);
          return;
        }
        setError(caught.message);
        return;
      }
      setError("Une erreur est survenue. Réessayez.");
    }
  }, []);

  return { submit, error, sentTo, resetLink };
};
