// Point d'entrée unique de la feature auth.
// Les sub-features ne s'importent jamais entre elles : elles passent
// par `./shared` pour ce qui est commun.
export { AuthProvider, AuthGuard, GuestGuard, AuthLayout, useAuth } from "./shared";
// Règles et appels réutilisés par l'espace compte (mot de passe, sessions).
export {
  logoutAllRequest,
  PASSWORD_HINT,
  PasswordChecklist,
  passwordSchema,
  resendVerificationRequest,
} from "./shared";
export { LoginForm, LoginPage } from "./login";
export { SignupPage } from "./signup";
export { ForgotPasswordPage, ResetPasswordPage } from "./forgot-password";
export { VerifyEmailPage } from "./verify-email";
