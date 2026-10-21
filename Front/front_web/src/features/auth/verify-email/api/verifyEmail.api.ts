import { apiClient } from "../../../../shared/api";

// GET /auth/verify-email/:token — le token vient du lien reçu à l'inscription.
export const verifyEmailRequest = async (token: string): Promise<string> => {
  const response = await apiClient.get(`/auth/verify-email/${encodeURIComponent(token)}`);
  return response.message;
};
