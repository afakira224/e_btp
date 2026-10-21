import { useTheme } from "../../../app/providers/useTheme";
import styles from "./ThemeToggle.module.css";

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const goingDark = theme === "light";

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggleTheme}
      aria-label={goingDark ? "Activer le mode sombre" : "Activer le mode clair"}
    >
      <span aria-hidden="true">{goingDark ? "◐" : "◑"}</span>
      {goingDark ? "Sombre" : "Clair"}
    </button>
  );
};
