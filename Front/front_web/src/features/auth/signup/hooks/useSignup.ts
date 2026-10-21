import { useCallback, useState } from "react";
import { ApiError } from "../../../../shared/api";
import { EntityType } from "../../../../entities/user";
import { signupRequest } from "../api/signup.api";
import type { SignupValues } from "../validation/signup.schema";

export interface SignupOutcome {
  email: string;
  verifyLink?: string | undefined;
}

export const useSignup = () => {
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SignupOutcome | null>(null);

  const submit = useCallback(async (values: SignupValues) => {
    setError(null);

    try {
      const email = values.email.trim();

      // confirmPassword ne sert qu'au contrôle local : l'API ne l'attend pas.
      // Le rôle est imposé ici, jamais choisi dans le formulaire : une
      // inscription publique ne crée que des comptes « user ».
      const result = await signupRequest({
        nom: values.nom.trim(),
        prenom: values.prenom.trim(),
        email,
        telephone: values.telephone.trim(),
        password: values.password,
        role: EntityType.USER,
      });

      setOutcome({ email, verifyLink: result.verifyLink });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        return;
      }
      setError("Une erreur est survenue. Réessayez.");
    }
  }, []);

  return { submit, error, outcome };
};
