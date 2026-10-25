import { Navigate, Outlet } from "react-router-dom";
import { EntityType } from "../../../../entities/user";
import { useAuth } from "../../../auth";

// ─────────────────────────────────────────────
//  AdminGuard
//  Placée sous AuthGuard : la session est déjà connue. Seule
//  l'administration entre ; les autres retrouvent leur compte. Le back
//  refuse de toute façon ces routes à tout autre type de compte.
// ─────────────────────────────────────────────
export const AdminGuard = () => {
  const { user } = useAuth();
  return user?.role === EntityType.ADMIN ? <Outlet /> : <Navigate to="/compte" replace />;
};
