import { Link } from "react-router-dom";
import { Alert, Button, Input } from "../../../../shared/ui";
import { useForm } from "../../../../shared/hooks/useForm";
import { MockCredentials } from "../../shared";
import { useLogin } from "../hooks/useLogin";
import { loginSchema, type LoginValues } from "../validation/login.schema";
import styles from "./LoginForm.module.css";

const INITIAL_VALUES: LoginValues = { email: "", password: "" };

export const LoginForm = () => {
  const { submit, error, needsVerification } = useLogin();
  const { values, errorOf, isSubmitting, setValue, handleBlur, handleSubmit } = useForm({
    initialValues: INITIAL_VALUES,
    schema: loginSchema,
    onSubmit: submit,
  });

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <MockCredentials />

      {error ? (
        <Alert tone={needsVerification ? "warning" : "danger"}>
          {error}
          {needsVerification ? (
            <>
              {" "}
              Le lien vous a été envoyé lors de l'inscription — pensez à vérifier
              vos spams.
            </>
          ) : null}
        </Alert>
      ) : null}

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

      <Input
        label="Mot de passe"
        index="02"
        type="password"
        name="password"
        autoComplete="current-password"
        placeholder="••••••••"
        revealable
        value={values.password}
        error={errorOf("password")}
        onChange={(event) => setValue("password", event.target.value)}
        onBlur={() => handleBlur("password")}
      />

      <div className={styles.row}>
        <Link className={styles.link} to="/forgot-password">
          Mot de passe oublié ?
        </Link>
      </div>

      <Button type="submit" fullWidth isLoading={isSubmitting}>
        Se connecter
      </Button>
    </form>
  );
};
