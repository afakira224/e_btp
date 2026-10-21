import { apiClient } from "../../../../shared/api";
import type { LoginPayload, LoginResult } from "../../shared";

// ─────────────────────────────────────────────
//  POST /auth/login
//  Le serveur pose le cookie de session ; la réponse ne porte que le profil.
// ─────────────────────────────────────────────
export const loginRequest = async (payload: LoginPayload): Promise<LoginResult> => {
  const response = await apiClient.post<LoginResult>("/auth/login", payload);
  if (!response.data?.user) throw new Error("Réponse de connexion inattendue.");
  return response.data;
};
