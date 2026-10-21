import { Link } from "react-router-dom";
import { AuthLayout } from "../../shared";
import { ForgotPasswordForm } from "../components/ForgotPasswordForm";

export const ForgotPasswordPage = () => (
  <AuthLayout
    eyebrow="Récupération — 01"
    title="Mot de passe oublié"
    subtitle="Récupérez l'accès à votre compte."
    footer={
      <>
        Vous vous en souvenez ? <Link to="/login">Se connecter</Link>
      </>
    }
  >
    <ForgotPasswordForm />
  </AuthLayout>
);
