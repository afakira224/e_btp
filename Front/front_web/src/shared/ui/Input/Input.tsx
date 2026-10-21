import { useId, useState, type InputHTMLAttributes } from "react";
import styles from "./Input.module.css";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  /** Index affiché devant le label, ex. « 01 ». */
  index?: string;
  error?: string | undefined;
  hint?: string | undefined;
  optional?: boolean;
  /** Affiche le bouton « Afficher / Masquer » sur un champ mot de passe. */
  revealable?: boolean;
}

export const Input = ({
  label,
  index,
  error,
  hint,
  optional = false,
  revealable = false,
  type = "text",
  ...rest
}: InputProps) => {
  const id = useId();
  const [revealed, setRevealed] = useState(false);

  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const resolvedType = revealable && revealed ? "text" : type;

  return (
    <div className={styles.field}>
      <span className={styles.labelRow}>
        {index ? (
          // Purement décoratif : le label seul suffit à l'oral.
          <span className={styles.index} aria-hidden="true">
            {index}
          </span>
        ) : null}
        <label className={styles.label} htmlFor={id}>
          {label}
          {optional ? <span className={styles.optional}> — facultatif</span> : null}
        </label>
      </span>

      <div className={styles.control}>
        <input
          id={id}
          type={resolvedType}
          className={[
            styles.input,
            error ? styles.invalid : "",
            revealable ? styles.withAction : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />

        {revealable ? (
          <button
            type="button"
            className={styles.action}
            onClick={() => setRevealed((value) => !value)}
            // Le libellé annonce l'action, pas l'état : un lecteur d'écran
            // doit savoir ce que le clic va faire.
            aria-label={revealed ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {revealed ? "Masquer" : "Afficher"}
          </button>
        ) : null}
      </div>

      {error ? (
        <span id={`${id}-error`} className={styles.message} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className={styles.hint}>
          {hint}
        </span>
      ) : null}
    </div>
  );
};
