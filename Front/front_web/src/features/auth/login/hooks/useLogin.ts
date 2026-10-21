import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../../../../shared/api";
import { useAuth } from "../../shared";
import { loginRequest } from "../api/login.api";
import type { LoginValues } from "../validation/login.schema";

interface Location {
  from?: { pathname?: string };
}

export const useLogin = () => {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);

  const submit = useCallback(
    async (values: LoginValues) => {
      setError(null);
      setNeedsVerification(false);

      try {
        const { user } = await loginRequest(values);
        setUser(user);

        // Retour à la page demandée avant la redirection vers /login.
        const target = (location.state as Location | null)?.from?.pathname ?? "/";
        navigate(target, { replace: true });
      } catch (caught) {
        if (caught instanceof ApiError) {
          // 403 = email non vérifié : ce n'est pas un mauvais mot de passe,
          // l'utilisateur doit pouvoir relancer l'email de vérification.
          if (caught.statusCode === 403) setNeedsVerification(true);
          setError(caught.message);
          return;
        }
        setError("Une erreur est survenue. Réessayez.");
      }
    },
    [location.state, navigate, setUser]
  );

  return { submit, error, needsVerification };
};
