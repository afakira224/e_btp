import { Link, useParams } from "react-router-dom";
import { Alert, Button, Spinner } from "../../../../shared/ui";
import { AuthLayout } from "../../shared";
import { useVerifyEmail } from "../hooks/useVerifyEmail";
import styles from "./VerifyEmailPage.module.css";

export const VerifyEmailPage = () => {
  const { token } = useParams<{ token: string }>();
  const { status, message } = useVerifyEmail(token);

  return (
    <AuthLayout
      eyebrow="Vérification"
      title="Vérification de l'email"
      subtitle="Activation de votre compte."
    >
      <div className={styles.stack}>
        {status === "pending" ? (
          <p className={styles.pending} role="status">
            <Spinner />
            Vérification en cours…
          </p>
        ) : (
          <Alert tone={status === "success" ? "success" : "danger"}>{message}</Alert>
        )}

        {status === "success" ? (
          <Link to="/login">
            <Button fullWidth>Se connecter</Button>
          </Link>
        ) : null}

        {status === "error" ? (
          <Link to="/login">
            <Button fullWidth variant="secondary">
              Retour à la connexion
            </Button>
          </Link>
        ) : null}
      </div>
    </AuthLayout>
  );
};
