import { useId, type SelectHTMLAttributes } from "react";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  /** Index affiché devant le label, ex. « 05 ». */
  index?: string;
  options: readonly SelectOption[];
  error?: string | undefined;
  hint?: string | undefined;
}

export const Select = ({ label, index, options, error, hint, ...rest }: SelectProps) => {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

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
        </label>
      </span>

      <select
        id={id}
        className={[styles.select, error ? styles.invalid : ""].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

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
