import { Link } from "react-router-dom";
import { AuthLayout } from "../../shared";
import { LoginForm } from "../components/LoginForm";

// Une page assemble : elle ne porte ni logique métier ni appel réseau.
export const LoginPage = () => (
  <AuthLayout
    eyebrow="Accès — 01"
    title="Connexion"
    subtitle="Accédez à votre espace BTP."
    footer={
      <>
        Pas encore de compte ? <Link to="/signup">Créer un compte</Link>
        <br />
        Vous gérez une boutique ? <Link to="/ma-boutique/connexion">Espace boutique</Link>
        <br />
        Vous êtes commerçant sans boutique ? Connectez-vous, puis ouvrez-la depuis votre profil.
      </>
    }
  >
    <LoginForm />
  </AuthLayout>
);
