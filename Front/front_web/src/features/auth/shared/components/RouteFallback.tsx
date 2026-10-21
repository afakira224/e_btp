import { Spinner } from "../../../../shared/ui";
import styles from "./RouteFallback.module.css";

/** Écran d'attente pendant que /auth/me détermine l'état de la session. */
export const RouteFallback = () => (
  <div className={styles.fallback} role="status">
    <Spinner />
    Vérification de la session…
  </div>
);
