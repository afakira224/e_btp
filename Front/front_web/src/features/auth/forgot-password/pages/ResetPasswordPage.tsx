import { Link, useParams } from "react-router-dom";
import { AuthLayout } from "../../shared";
import { ResetPasswordForm } from "../components/ResetPasswordForm";

export const ResetPasswordPage = () => {
  const { token } = useParams<{ token: string }>();

  return (
    <AuthLayout
      eyebrow="Récupération — 02"
      title="Nouveau mot de passe"
      subtitle="Choisissez un mot de passe solide."
      footer={
        <>
          Lien expiré ? <Link to="/forgot-password">En demander un nouveau</Link>
        </>
      }
    >
      <ResetPasswordForm token={token} />
    </AuthLayout>
  );
};
