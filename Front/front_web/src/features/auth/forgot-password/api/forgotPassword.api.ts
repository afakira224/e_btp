import { apiClient } from "../../../../shared/api";
import type { ForgotPasswordPayload, ResetPasswordPayload } from "../../shared";

export interface ForgotPasswordResult {
  message: string;
  /**
   * Lien de réinitialisation, renvoyé uniquement par la couche simulée.
   * En production l'API l'envoie par email et ne l'expose jamais ici.
   */
  resetLink?: string | undefined;
}

// POST /auth/forgot-password — envoie le lien de réinitialisation.
export const forgotPasswordRequest = async (
  payload: ForgotPasswordPayload
): Promise<ForgotPasswordResult> => {
  const response = await apiClient.post<{ resetLink?: string }>(
    "/auth/forgot-password",
    payload
  );
  return { message: response.message, resetLink: response.data?.resetLink };
};

// PUT /auth/reset-password/:token — le token vient du lien reçu par email.
// Côté serveur, ce changement révoque toutes les sessions du compte.
export const resetPasswordRequest = async (
  token: string,
  payload: ResetPasswordPayload
): Promise<string> => {
  const response = await apiClient.put(
    `/auth/reset-password/${encodeURIComponent(token)}`,
    payload
  );
  return response.message;
};
