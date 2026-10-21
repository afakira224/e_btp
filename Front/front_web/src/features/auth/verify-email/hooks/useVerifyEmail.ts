import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../../../shared/api";
import { verifyEmailRequest } from "../api/verifyEmail.api";

type VerifyStatus = "pending" | "success" | "error";

export const useVerifyEmail = (token: string | undefined) => {
  // Un lien sans token est déjà invalide au premier rendu : inutile de
  // passer par un effet pour le constater.
  const [status, setStatus] = useState<VerifyStatus>(token ? "pending" : "error");
  const [message, setMessage] = useState(token ? "" : "Lien de vérification invalide.");

  // En mode strict, React monte deux fois : sans ce garde le token partirait
  // deux fois et la seconde tentative échouerait (il est consommé à l'usage).
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    void (async () => {
      try {
        const result = await verifyEmailRequest(token);
        setStatus("success");
        setMessage(result);
      } catch (caught) {
        setStatus("error");
        setMessage(
          caught instanceof ApiError
            ? caught.message
            : "Une erreur est survenue. Réessayez."
        );
      }
    })();
  }, [token]);

  return { status, message };
};
