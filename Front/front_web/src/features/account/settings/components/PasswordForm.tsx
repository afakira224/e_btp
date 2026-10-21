import { useState } from "react";
import { Alert, Button, Input } from "../../../../shared/ui";
import { useForm } from "../../../../shared/hooks/useForm";
import { PasswordChecklist } from "../../../auth";
import { changePassword } from "../../shared";
import {
  changePasswordSchema,
  type ChangePasswordValues,
} from "../validation/password.schema";
import styles from "./PasswordForm.module.css";

const EMPTY: ChangePasswordValues = {
  currentPassword: "",
  newPassword: "",
  confirmNewPassword: "",
};

type Feedback = { tone: "success" | "danger"; text: string } | null;

export const PasswordForm = () => {
  const [feedback, setFeedback] = useState<Feedback>(null);

  const { values, errorOf, isSubmitting, setValue, handleBlur, handleSubmit, reset } =
    useForm<ChangePasswordValues>({
      initialValues: EMPTY,
      schema: changePasswordSchema,
      onSubmit: async (submitted) => {
        setFeedback(null);
        try {
          await changePassword(submitted);
          // Les champs sont vidés : un mot de passe ne reste pas affiché,
          // même masqué, une fois son travail fait.
          reset();
          setFeedback({
            tone: "success",
            text: "Mot de passe modifié. Vos autres appareils ont été déconnectés ; vous restez connecté ici.",
          });
        } catch (caught) {
          setFeedback({ tone: "danger", text: (caught as Error).message });
        }
      },
    });

  const field = <K extends keyof ChangePasswordValues>(name: K) => ({
    name,
    value: values[name],
    error: errorOf(name),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValue(name, event.target.value),
    onBlur: () => handleBlur(name),
  });

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {feedback ? <Alert tone={feedback.tone}>{feedback.text}</Alert> : null}

      <Input
        label="Mot de passe actuel"
        type="password"
        revealable
        autoComplete="current-password"
        {...field("currentPassword")}
      />
      <div>
        <Input
          label="Nouveau mot de passe"
          type="password"
          revealable
          autoComplete="new-password"
          {...field("newPassword")}
        />
        <PasswordChecklist value={values.newPassword} />
      </div>
      <Input
        label="Confirmer le nouveau mot de passe"
        type="password"
        revealable
        autoComplete="new-password"
        {...field("confirmNewPassword")}
      />

      <div>
        <Button type="submit" isLoading={isSubmitting}>
          Modifier le mot de passe
        </Button>
      </div>
    </form>
  );
};
