import { useId } from "react";
import styles from "./Choices.module.css";

export interface ChoiceOption {
  value: string;
  label: string;
  hint?: string | undefined;
}

interface ChoicesBaseProps {
  legend: string;
  /** Index affiché devant la légende, ex. « 03 ». */
  index?: string;
  options: readonly ChoiceOption[];
  error?: string | undefined;
  hint?: string | undefined;
  disabled?: boolean;
  /** Appelé quand le focus quitte le groupe, pas d'une option à l'autre. */
  onBlur?: () => void;
  /** Options côte à côte plutôt qu'empilées (choix courts). */
  inline?: boolean;
}

type ChoicesProps = ChoicesBaseProps &
  (
    | { multiple?: false; value: string; onChange: (value: string) => void }
    | { multiple: true; value: string[]; onChange: (value: string[]) => void }
  );

// ─────────────────────────────────────────────
//  Groupe de choix — boutons radio ou cases à cocher, présentés en liste
//  filetée comme l'éditeur des modes de livraison. Un vrai <fieldset> avec
//  sa <legend> : le lecteur d'écran annonce la question avec chaque option.
// ─────────────────────────────────────────────
export const Choices = (props: ChoicesProps) => {
  const { legend, index, options, error, hint, disabled = false, onBlur, inline = false } = props;
  const name = useId();
  const messageId = useId();

  const isChecked = (value: string) =>
    props.multiple ? props.value.includes(value) : props.value === value;

  const toggle = (value: string, checked: boolean) => {
    if (props.multiple) {
      // L'ordre des options est conservé, quel que soit l'ordre des clics.
      const next = options
        .map((option) => option.value)
        .filter((candidate) => (candidate === value ? checked : props.value.includes(candidate)));
      props.onChange(next);
    } else if (checked) {
      props.onChange(value);
    }
  };

  return (
    <fieldset
      className={styles.group}
      aria-describedby={error || hint ? messageId : undefined}
      aria-invalid={error ? true : undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur?.();
      }}
    >
      <legend className={styles.legend}>
        {index ? (
          <span className={styles.index} aria-hidden="true">
            {index}
          </span>
        ) : null}
        {legend}
      </legend>

      <ul className={[styles.options, inline ? styles.inline : "", error ? styles.invalid : ""].filter(Boolean).join(" ")}>
        {options.map((option) => {
          const checked = isChecked(option.value);
          return (
            <li key={option.value} className={[styles.option, checked ? styles.on : ""].filter(Boolean).join(" ")}>
              <label className={styles.toggle}>
                <input
                  type={props.multiple ? "checkbox" : "radio"}
                  name={name}
                  value={option.value}
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => toggle(option.value, event.target.checked)}
                />
                <span className={styles.text}>
                  <span className={styles.label}>{option.label}</span>
                  {option.hint ? <span className={styles.hint}>{option.hint}</span> : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p id={messageId} className={styles.message} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
};
