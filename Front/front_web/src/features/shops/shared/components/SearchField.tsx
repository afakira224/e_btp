import { useId } from "react";
import styles from "./SearchField.module.css";

interface SearchFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

/** Champ de filtre textuel, avec son libellé caché et une croix d'effacement. */
export const SearchField = ({ label, placeholder, value, onChange }: SearchFieldProps) => {
  const id = useId();

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.visuallyHidden}>
        {label}
      </label>
      <span className={styles.icon} aria-hidden="true">
        ⌕
      </span>
      <input
        id={id}
        className={styles.input}
        type="search"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            onChange("");
          }
        }}
      />
      {value ? (
        <button
          type="button"
          className={styles.clear}
          aria-label="Effacer"
          onClick={() => onChange("")}
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </div>
  );
};
