import { apiClient } from "../../../../shared/api";
import type { RegisterPayload } from "../../shared";

export interface SignupResult {
  message: string;
  /**
   * Lien de vérification, renvoyé uniquement par la couche simulée.
   * En production l'API l'envoie par email et ne l'expose jamais ici.
   */
  verifyLink?: string | undefined;
}

// ─────────────────────────────────────────────
//  POST /auth/register
//  Aucune session n'est ouverte : le compte doit d'abord être vérifié
//  par email.
// ─────────────────────────────────────────────
export const signupRequest = async (payload: RegisterPayload): Promise<SignupResult> => {
  const response = await apiClient.post<{ verifyLink?: string }>(
    "/auth/register",
    payload
  );
  return { message: response.message, verifyLink: response.data?.verifyLink };
};
