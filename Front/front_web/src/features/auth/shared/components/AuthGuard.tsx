import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { RouteFallback } from "./RouteFallback";

// ─────────────────────────────────────────────
//  AuthGuard
//  Protège les routes privées. Rien n'est décidé tant que /auth/me n'a pas
//  répondu : rediriger pendant "pending" éjecterait l'utilisateur à chaque
//  rafraîchissement de page. `loginPath` : l'espace boutique a sa propre
//  page de connexion.
// ─────────────────────────────────────────────
export const AuthGuard = ({ loginPath = "/login" }: { loginPath?: string }) => {
  const { status, signedOut } = useAuth();
  const location = useLocation();

  if (status === "pending") return <RouteFallback />;

  if (status === "anonymous") {
    // `state.from` permet de renvoyer l'utilisateur là où il allait,
    // une fois connecté — sauf après « Se déconnecter » : le prochain compte
    // n'a rien à faire sur la page que le précédent vient de quitter.
    return <Navigate to={loginPath} replace state={signedOut ? null : { from: location }} />;
  }

  return <Outlet />;
};
