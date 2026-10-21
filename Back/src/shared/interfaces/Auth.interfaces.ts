import type { EntityType } from "../../models/user.model.js";

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