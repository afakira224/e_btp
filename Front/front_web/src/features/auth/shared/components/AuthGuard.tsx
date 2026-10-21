import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { RouteFallback } from "./RouteFallback";

// ─────────────────────────────────────────────
//  AuthGuard
//  Protège les routes privées. Rien n'est décidé tant que /auth/me n'a pas
//  répondu : rediriger pendant "pending" éjecterait l'utilisateur à chaque
//  rafraîchissement de page.
// ─────────────────────────────────────────────
export const AuthGuard = () => {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "pending") return <RouteFallback />;

  if (status === "anonymous") {
    // `state.from` permet de renvoyer l'utilisateur là où il allait,
    // une fois connecté.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
};
