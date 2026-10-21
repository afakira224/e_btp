import type { EntityType, User } from "../../../../entities/user";

// ─────────────────────────────────────────────
//  Contrats d'échange avec /api/v1/auth
//  Ils reflètent exactement les DTO du back (src/shared/interfaces/Auth.interfaces.ts).
// ─────────────────────────────────────────────

export interface LoginPayload {
  email: string;
  password: string;
}

/** Le back renvoie uniquement le profil : la session vit dans le cookie. */
export interface LoginResult {
  user: User;
}

export interface RegisterPayload {
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  password: string;
  role: EntityType;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  password: string;
  confirmPassword: string;
}

/** Statut d'amorçage : tant qu'il vaut "pending", on ne sait rien. */
export type AuthStatus = "pending" | "authenticated" | "anonymous";

export interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  /** Enregistre le profil renvoyé par /auth/login dans le contexte. */
  setUser: (user: User) => void;
  /** Ferme la session côté serveur puis vide le contexte. */
  logout: () => Promise<void>;
  /** Relit /auth/me, par exemple après une vérification d'email. */
  refresh: () => Promise<void>;
}
