import { apiClient } from "../../../../shared/api";
import type { User } from "../../../../entities/user";

// ─────────────────────────────────────────────
//  Appels communs à toutes les sub-features d'auth.
//  Les appels propres à une sub-feature vivent dans son propre dossier api/.
// ─────────────────────────────────────────────

/** Profil du titulaire de la session courante. Lève une ApiError 401 si absente. */
export const fetchCurrentUser = async (signal?: AbortSignal): Promise<User> => {
  const response = await apiClient.get<User>("/auth/me", signal);
  if (!response.data) throw new Error("Profil introuvable.");
  return response.data;
};

/** Ferme la session courante côté serveur et efface le cookie. */
export const logoutRequest = async (): Promise<void> => {
  await apiClient.post("/auth/logout");
};

/** Ferme les sessions de tous les appareils. */
export const logoutAllRequest = async (): Promise<number> => {
  const response = await apiClient.post<{ revoked: number }>("/auth/logout-all");
  return response.data?.revoked ?? 0;
};

/** Renvoie l'email de vérification au titulaire de la session. */
export const resendVerificationRequest = async (): Promise<string> => {
  const response = await apiClient.post("/auth/resend-verification");
  return response.message;
};
