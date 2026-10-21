import { Link } from "react-router-dom";
import { Alert, Button } from "../../../../shared/ui";
import { MockLink } from "../../shared";
import styles from "./SignupSuccess.module.css";

interface SignupSuccessProps {
  email: string;
  verifyLink?: string | undefined;
}

// ─────────────────────────────────────────────
//  Écran affiché après l'inscription.
//  Le compte existe mais la connexion est refusée tant que l'email n'est
//  pas vérifié : mieux vaut le dire ici que de laisser l'utilisateur
//  buter sur un 403 au premier login.
// ─────────────────────────────────────────────
export const SignupSuccess = ({ email, verifyLink }: SignupSuccessProps) => (
  <div className={styles.wrapper}>
    <Alert tone="success">
      Votre compte est créé. Un lien de vérification vient d'être envoyé à{" "}
      <span className={styles.email}>{email}</span>.
    </Alert>

    <p className={styles.note}>
      Ouvrez ce lien pour activer votre compte. La connexion reste bloquée tant
      que l'email n'est pas vérifié. Pensez à regarder vos spams si le message
      tarde à arriver.
    </p>

    <MockLink href={verifyLink} label="Lien de vérification" />

    <Link to="/login">
      <Button fullWidth variant="secondary">
        Retour à la connexion
      </Button>
    </Link>
  </div>
);
