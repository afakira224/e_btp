import { Alert, Button, Input } from "../../../../shared/ui";
import { useForm } from "../../../../shared/hooks/useForm";
import { PASSWORD_HINT } from "../../shared";
import { useResetPassword } from "../hooks/useResetPassword";
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from "../validation/forgotPassword.schema";
import styles from "./Form.module.css";

const INITIAL_VALUES: ResetPasswordValues = { password: "", confirmPassword: "" };

interface ResetPasswordFormProps {
  token: string | undefined;
}

export const ResetPasswordForm = ({ token }: ResetPasswordFormProps) => {
  const { submit, error, isDone } = useResetPassword(token);
  const { values, errorOf, isSubmitting, setValue, handleBlur, handleSubmit } = useForm({
    initialValues: INITIAL_VALUES,
    schema: resetPasswordSchema,
    onSubmit: submit,
  });

  if (isDone) {
    return (
      <Alert tone="success">
        Mot de passe mis à jour. Toutes vos sessions ont été fermées ; vous allez
        être redirigé vers la connexion.
      </Alert>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <p className={styles.note}>
        Ce changement ferme vos sessions ouvertes sur tous vos appareils.
      </p>

      <Input
        label="Nouveau mot de passe"
        index="01"
        type="password"
        name="password"
        autoComplete="new-password"
        placeholder="••••••••"
        revealable
        hint={PASSWORD_HINT}
        value={values.password}
        error={errorOf("password")}
        onChange={(event) => setValue("password", event.target.value)}
        onBlur={() => handleBlur("password")}
      />

      <Input
        label="Confirmer le mot de passe"
        index="02"
        type="password"
        name="confirmPassword"
        autoComplete="new-password"
        placeholder="••••••••"
        revealable
        value={values.confirmPassword}
        error={errorOf("confirmPassword")}
        onChange={(event) => setValue("confirmPassword", event.target.value)}
        onBlur={() => handleBlur("confirmPassword")}
      />

      <Button type="submit" fullWidth isLoading={isSubmitting}>
        Définir le mot de passe
      </Button>
    </form>
  );
};
