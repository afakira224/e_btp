import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { RouteFallback } from "./RouteFallback";

// ─────────────────────────────────────────────
//  GuestGuard
//  Réserve les écrans d'auth aux visiteurs : un utilisateur déjà connecté
//  qui ouvre /login est renvoyé vers l'accueil plutôt que de voir un
//  formulaire sans objet.
// ─────────────────────────────────────────────
export const GuestGuard = () => {
  const { status } = useAuth();

  if (status === "pending") return <RouteFallback />;
  if (status === "authenticated") return <Navigate to="/" replace />;

  return <Outlet />;
};
