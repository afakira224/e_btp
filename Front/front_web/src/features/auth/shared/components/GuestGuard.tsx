import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { afterLoginPath } from "../utils/redirect";
import { RouteFallback } from "./RouteFallback";

// ─────────────────────────────────────────────
//  GuestGuard
//  Réserve les écrans d'auth aux visiteurs : un utilisateur déjà connecté
//  qui ouvre /login est renvoyé vers son accueil plutôt que de voir un
//  formulaire sans objet.
//
//  Au moment de la connexion, cette garde se rend avec le nouvel état avant
//  que la navigation de useLogin n'aboutisse : elle doit donc viser la même
//  destination (`destination` = celle donnée au formulaire), sinon sa
//  redirection écrase la page demandée.
// ─────────────────────────────────────────────
export const GuestGuard = ({ destination }: { destination?: string | undefined }) => {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "pending") return <RouteFallback />;
  if (status === "authenticated" && user) {
    return <Navigate to={afterLoginPath(location.state, user, destination)} replace />;
  }

  return <Outlet />;
};
