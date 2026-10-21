import { Navigate, Outlet } from "react-router-dom";
import { EntityType } from "../../../../entities/user";
import { useAuth } from "../../../auth";

// ─────────────────────────────────────────────
//  SellerGuard
//  Placée sous AuthGuard : la session est déjà connue. Seuls les comptes
//  boutique et l'administration entrent ; les autres retrouvent leur compte.
//  Ce n'est qu'un confort d'affichage : le back refuse de lui-même toute
//  écriture hors rôle (requireRole) ou hors de ses boutiques (canManageShop).
// ─────────────────────────────────────────────
export const SellerGuard = () => {
  const { user } = useAuth();
  const allowed = user?.role === EntityType.SHOP || user?.role === EntityType.ADMIN;
  return allowed ? <Outlet /> : <Navigate to="/compte" replace />;
};
