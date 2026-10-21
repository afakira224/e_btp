import { checkPassword } from "../validation/password.rules";
import styles from "./PasswordChecklist.module.css";

interface PasswordChecklistProps {
  value: string;
}

/** Règles de mot de passe validées en direct pendant la saisie. */
export const PasswordChecklist = ({ value }: PasswordChecklistProps) => {
  const checks = checkPassword(value);

  return (
    <ul className={styles.list}>
      {checks.map((check) => (
        <li
          key={check.label}
          className={[styles.item, check.met ? styles.met : ""].filter(Boolean).join(" ")}
        >
          <span className={styles.mark} aria-hidden="true">
            {check.met ? "✓" : "○"}
          </span>
          {check.label}
        </li>
      ))}
    </ul>
  );
};
