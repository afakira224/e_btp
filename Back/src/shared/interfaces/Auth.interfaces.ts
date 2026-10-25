import type { EntityType } from "../../models/user.model.js";
import type { ProjetDto } from "../helpers/projet.helper.js";

// ─────────────────────────────────────────────
//  REGISTER
// ─────────────────────────────────────────────
export interface RegisterDto {
  nom:             string;
  prenom:          string;
  email:           string;
  telephone:       string;
  password:        string;
  role:            EntityType;
  /** Facultatif : le client peut passer la question à l'inscription. */
  projet?:         ProjetDto | null | undefined;
}

// ─────────────────────────────────────────────
//  LOGIN
// ─────────────────────────────────────────────
export interface LoginDto {
  email:    string;
  password: string;
}

// ─────────────────────────────────────────────
//  FORGOT PASSWORD
// ─────────────────────────────────────────────
export interface ForgotPasswordDto {
  email: string;
}

// ─────────────────────────────────────────────
//  RESET PASSWORD
// ─────────────────────────────────────────────
export interface ResetPasswordDto {
  password:        string;
  confirmPassword: string;
}

// ─────────────────────────────────────────────
//  CHANGE PASSWORD
// ─────────────────────────────────────────────
export interface ChangePasswordDto {
  // Pas d'id : l'utilisateur est identifié par sa session.
  currentPassword:    string;
  newPassword:        string;
  confirmNewPassword: string;
}

// ─────────────────────────────────────────────
//  UPDATE ME
// ─────────────────────────────────────────────
export interface UpdateMeDto {
  // Pas d'id : l'utilisateur est identifié par sa session.
  nom?:       string | undefined;
  prenom?:    string | undefined;
  telephone?: string | undefined;
  avatar?:    string | undefined;
}