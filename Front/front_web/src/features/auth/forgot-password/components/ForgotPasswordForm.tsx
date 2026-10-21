import { Link } from "react-router-dom";
import { Alert, Button, Input } from "../../../../shared/ui";
import { useForm } from "../../../../shared/hooks/useForm";
import { MockLink } from "../../shared";
import { useForgotPassword } from "../hooks/useForgotPassword";
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from "../validation/forgotPassword.schema";
import styles from "./Form.module.css";

const INITIAL_VALUES: ForgotPasswordValues = { email: "" };

export const ForgotPasswordForm = () => {
  const { submit, error, sentTo, resetLink } = useForgotPassword();
  const { values, errorOf, isSubmitting, setValue, handleBlur, handleSubmit } = useForm({
    initialValues: INITIAL_VALUES,
    schema: forgotPasswordSchema,
    onSubmit: submit,
  });

  if (sentTo) {
    return (
      <div className={styles.stack}>
        <Alert tone="success">
          Si un compte existe pour <strong>{sentTo}</strong>, un lien de
          réinitialisation vient d'être envoyé.
        </Alert>
        <p className={styles.note}>
          Le lien reste valable une heure. Sans email d'ici quelques minutes,
          vérifiez vos spams.
        </p>
        <MockLink href={resetLink} label="Lien de réinitialisation" />
        <Link to="/login">
          <Button fullWidth variant="secondary">
            Retour à la connexion
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <p className={styles.note}>
        Saisissez l'adresse de votre compte : nous vous enverrons un lien pour
        définir un nouveau mot de passe.
      </p>

      <Input
        label="Email"
        index="01"
        type="email"
        name="email"
        autoComplete="email"
        placeholder="mamadou@btp.com"
        value={values.email}
        error={errorOf("email")}
        onChange={(event) => setValue("email", event.target.value)}
        onBlur={() => handleBlur("email")}
      />

      <Button type="submit" fullWidth isLoading={isSubmitting}>
        Envoyer le lien
      </Button>
    </form>
  );
};
