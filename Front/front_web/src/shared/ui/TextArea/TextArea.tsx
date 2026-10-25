import { useId, type TextareaHTMLAttributes } from "react";
import styles from "./TextArea.module.css";

interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  label: string;
  /** Index affiché devant le label, ex. « 02 ». */
  index?: string;
  error?: string | undefined;
  hint?: string | undefined;
  optional?: boolean;
}

/**
 * Pendant multiligne d'`Input` : même label, même index, mêmes messages.
 * Avec `maxLength`, un compteur dit ce qu'il reste — une limite que l'on
 * découvre au moment d'envoyer est une limite mal annoncée.
 */
export const TextArea = ({
  label,
  index,
  error,
  hint,
  optional = false,
  maxLength,
  value,
  rows = 4,
  ...rest
}: TextAreaProps) => {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const length = typeof value === "string" ? value.length : 0;

  return (
    <div className={styles.field}>
      <span className={styles.labelRow}>
        {index ? (
          <span className={styles.index} aria-hidden="true">
            {index}
          </span>
        ) : null}
        <label className={styles.label} htmlFor={id}>
          {label}
          {optional ? <span className={styles.optional}> — facultatif</span> : null}
        </label>
        {maxLength ? (
          <span className={styles.counter} aria-hidden="true">
            {length} / {maxLength}
          </span>
        ) : null}
      </span>

      <textarea
        id={id}
        rows={rows}
        maxLength={maxLength}
        value={value}
        className={[styles.textarea, error ? styles.invalid : ""].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />

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
