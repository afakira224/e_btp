import { body, type ValidationChain, param } from "express-validator";
import { EntityType } from "../../models/user.model.js";

// ─────────────────────────────────────────────
//  REGISTER  →  RegisterDto
//  { nom, prenom, email, telephone, password, confirmPassword, role }
// ─────────────────────────────────────────────
export const registerForm: ValidationChain[] = [
  body("nom")
    .trim()
    .notEmpty().withMessage("Le nom est requis.")
    .isLength({ min: 2, max: 50 }).withMessage("Entre 2 et 50 caractères."),

  body("prenom")
    .trim()
    .notEmpty().withMessage("Le prénom est requis.")
    .isLength({ min: 2, max: 50 }).withMessage("Entre 2 et 50 caractères."),

  body("telephone")
    .trim()
    .notEmpty().withMessage("Le numéro de téléphone est requis.")
    .isLength({min:9 , max:12}).withMessage("Entre 9 et 12 caractères."),

  body("email")
    .trim()
    .notEmpty().withMessage("L'email est requis.")
    .isEmail().withMessage("Email invalide.")
    .normalizeEmail(),

  body("password")
    .notEmpty().withMessage("Le mot de passe est requis.")
    .isLength({ min: 8 }).withMessage("Minimum 8 caractères.")
    .matches(/[A-Z]/).withMessage("Au moins une majuscule.")
    .matches(/[0-9]/).withMessage("Au moins un chiffre.")
    .matches(/[!@#$%^&*]/).withMessage("Au moins un caractère spécial (!@#$%^&*)."),

  body("role")
    .notEmpty().withMessage("Le rôle est requis.")
    .isIn(Object.values(EntityType)).withMessage(`Rôle invalide. Valeurs acceptées : ${Object.values(EntityType).join(", ")}.`),
];

// ─────────────────────────────────────────────
//  LOGIN  →  LoginDto
//  { email, password }
// ─────────────────────────────────────────────
export const loginForm: ValidationChain[] = [
  body("email")
    .trim()
    .notEmpty().withMessage("L'email est requis.")
    .isEmail().withMessage("Email invalide.")
    .normalizeEmail(),

  body("password")
    .notEmpty().withMessage("Le mot de passe est requis."),
];

// ─────────────────────────────────────────────
//  UPDATE ME  →  UpdateMeDto
//  { nom?, prenom?, telephone?, avatar? }
// ─────────────────────────────────────────────
export const updateForm: ValidationChain[] = [
  body("nom")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage("Entre 2 et 50 caractères."),

  body("prenom")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage("Entre 2 et 50 caractères."),

  body("telephone")
    .optional()
    .isMobilePhone("any").withMessage("Numéro de téléphone invalide."),

  body("avatar")
    .optional()
    .isURL().withMessage("L'avatar doit être une URL valide."),
];

// ─────────────────────────────────────────────
//  FORGOT PASSWORD  →  ForgotPasswordDto
//  { email }
// ─────────────────────────────────────────────
export const forgotPasswordForm: ValidationChain[] = [
  body("email")
    .trim()
    .notEmpty().withMessage("L'email est requis.")
    .isEmail().withMessage("Email invalide.")
    .normalizeEmail(),
];

// ─────────────────────────────────────────────
//  RESET PASSWORD  →  ResetPasswordDto
//  { password, confirmPassword }
// ─────────────────────────────────────────────
export const resetPasswordForm: ValidationChain[] = [
  body("password")
    .notEmpty().withMessage("Le nouveau mot de passe est requis.")
    .isLength({ min: 8 }).withMessage("Minimum 8 caractères.")
    .matches(/[A-Z]/).withMessage("Au moins une majuscule.")
    .matches(/[0-9]/).withMessage("Au moins un chiffre.")
    .matches(/[!@#$%^&*]/).withMessage("Au moins un caractère spécial (!@#$%^&*)."),

  body("confirmPassword")
    .notEmpty().withMessage("La confirmation est requise.")
    .custom((value, { req }) => {
      if (value !== req.body.password) throw new Error("Les mots de passe ne correspondent pas.");
      return true;
    }),
];

// ─────────────────────────────────────────────
//  CHANGE PASSWORD  →  ChangePasswordDto
//  { currentPassword, newPassword, confirmNewPassword }
// ─────────────────────────────────────────────
export const changePasswordForm: ValidationChain[] = [
  body("currentPassword")
    .notEmpty().withMessage("Le mot de passe actuel est requis."),

  body("newPassword")
    .notEmpty().withMessage("Le nouveau mot de passe est requis.")
    .isLength({ min: 8 }).withMessage("Minimum 8 caractères.")
    .matches(/[A-Z]/).withMessage("Au moins une majuscule.")
    .matches(/[0-9]/).withMessage("Au moins un chiffre.")
    .matches(/[!@#$%^&*]/).withMessage("Au moins un caractère spécial (!@#$%^&*).")
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) throw new Error("Le nouveau mot de passe doit être différent de l'ancien.");
      return true;
    }),

  body("confirmNewPassword")
    .notEmpty().withMessage("La confirmation est requise.")
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) throw new Error("Les mots de passe ne correspondent pas.");
      return true;
    }),
];
// ─────────────────────────────────────────────
//  VERIFY EMAIL  →  GET /auth/verify-email/:token
// ─────────────────────────────────────────────
export const verifyEmailParam: ValidationChain[] = [
  param("token")
    .trim()
    .notEmpty().withMessage("Le token de vérification est requis.")
    .isLength({ min: 20, max: 200 }).withMessage("Token de vérification invalide."),
];
