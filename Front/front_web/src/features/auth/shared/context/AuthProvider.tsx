import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "../../../../entities/user";
import { ApiError } from "../../../../shared/api";
import { fetchCurrentUser, logoutRequest } from "../api/auth.api";
import type { AuthStatus } from "../types/auth.types";
import { AuthContext } from "./AuthContext";

// ─────────────────────────────────────────────
//  AuthProvider
//  Source de vérité de l'identité côté front.
//
//  Avec une authentification par session, le front ne détient aucun jeton :
//  il ne peut pas savoir s'il est connecté en lisant le stockage local.
//  La seule réponse fiable vient du serveur, d'où l'appel à /auth/me au
//  montage. Tant qu'il n'a pas répondu, le statut reste "pending" et les
//  gardes attendent — sans quoi un rafraîchissement de page renverrait
//  brièvement l'utilisateur connecté vers l'écran de connexion.
// ─────────────────────────────────────────────
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUserState] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("pending");
  const [signedOut, setSignedOut] = useState(false);

  const loadCurrentUser = useCallback(async (signal?: AbortSignal) => {
    try {
      const profile = await fetchCurrentUser(signal);
      setUserState(profile);
      setStatus("authenticated");
    } catch (error) {
      if ((error as Error).name === "AbortError") return;

      // 401 est la réponse normale d'un visiteur sans session : ce n'est
      // pas une panne, on bascule simplement en anonyme.
      if (error instanceof ApiError && error.isUnauthorized) {
        setUserState(null);
        setStatus("anonymous");
        return;
      }

      // Back injoignable : on n'a aucune raison de prétendre l'utilisateur
      // connecté, les routes protégées refuseront de toute façon.
      setUserState(null);
      setStatus("anonymous");
    }
  }, []);

  // L'état de session n'existe que côté serveur : seul un appel réseau peut
  // le connaître. C'est exactement le cas d'usage d'un effet, et la mise à
  // jour d'état qui suit est asynchrone, pas une cascade de rendus.
  useEffect(() => {
    const controller = new AbortController();
    // oxlint-disable-next-line react/set-state-in-effect
    void loadCurrentUser(controller.signal);
    return () => controller.abort();
  }, [loadCurrentUser]);

  const setUser = useCallback((profile: User) => {
    setUserState(profile);
    setStatus("authenticated");
    setSignedOut(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      // Même si l'appel échoue, on cesse de considérer l'utilisateur comme
      // connecté : le cookie a peut-être déjà expiré côté serveur.
      setUserState(null);
      setStatus("anonymous");
      setSignedOut(true);
    }
  }, []);

  const refresh = useCallback(() => loadCurrentUser(), [loadCurrentUser]);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === "authenticated",
      signedOut,
      setUser,
      logout,
      refresh,
    }),
    [logout, refresh, setUser, signedOut, status, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
