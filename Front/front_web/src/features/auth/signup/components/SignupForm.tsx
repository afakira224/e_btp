import { useEffect } from "react";
import { Alert, Button, Input } from "../../../../shared/ui";
import { useForm } from "../../../../shared/hooks/useForm";
import { useSignup, type SignupOutcome } from "../hooks/useSignup";
import { signupSchema, type SignupValues } from "../validation/signup.schema";
import { PasswordChecklist } from "../../shared";
import styles from "./SignupForm.module.css";

const INITIAL_VALUES: SignupValues = {
  prenom: "",
  nom: "",
  email: "",
  telephone: "",
  password: "",
  confirmPassword: "",
};

interface SignupFormProps {
  onRegistered: (outcome: SignupOutcome) => void;
}

export const SignupForm = ({ onRegistered }: SignupFormProps) => {
  const { submit, error, outcome } = useSignup();
  const { values, errorOf, isSubmitting, setValue, handleBlur, handleSubmit } = useForm({
    initialValues: INITIAL_VALUES,
    schema: signupSchema,
    onSubmit: async (formValues) => {
      await submit(formValues);
    },
  });

  // Le hook remonte le résultat une fois le compte créé : la page bascule
  // alors sur son écran de confirmation. Prévenir le parent est un effet de
  // bord, il ne peut pas se produire pendant le rendu.
  useEffect(() => {
    if (outcome) onRegistered(outcome);
  }, [onRegistered, outcome]);

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className={styles.grid}>
        <Input
          label="Prénom"
          index="01"
          name="prenom"
          autoComplete="given-name"
          placeholder="Mamadou"
          value={values.prenom}
          error={errorOf("prenom")}
          onChange={(event) => setValue("prenom", event.target.value)}
          onBlur={() => handleBlur("prenom")}
        />

        <Input
          label="Nom"
          index="02"
          name="nom"
          autoComplete="family-name"
          placeholder="Diallo"
          value={values.nom}
          error={errorOf("nom")}
          onChange={(event) => setValue("nom", event.target.value)}
          onBlur={() => handleBlur("nom")}
        />
      </div>

      <Input
        label="Email"
        index="03"
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
        label="Téléphone"
        index="04"
        type="tel"
        name="telephone"
        autoComplete="tel"
        placeholder="620000000"
        hint="Entre 9 et 12 caractères."
        value={values.telephone}
        error={errorOf("telephone")}
        onChange={(event) => setValue("telephone", event.target.value)}
        onBlur={() => handleBlur("telephone")}
      />

      <div className={styles.passwordGroup}>
        <Input
          label="Mot de passe"
          index="05"
          type="password"
          name="password"
          autoComplete="new-password"
          placeholder="••••••••"
          revealable
          value={values.password}
          error={errorOf("password")}
          onChange={(event) => setValue("password", event.target.value)}
          onBlur={() => handleBlur("password")}
        />
        <PasswordChecklist value={values.password} />
      </div>

      <Input
        label="Confirmer le mot de passe"
        index="06"
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
        Créer mon compte
      </Button>
    </form>
  );
};
