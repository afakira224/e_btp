import type { Sponsored } from "../../../../entities/product";
import styles from "./SponsoredNote.module.css";

// ─────────────────────────────────────────────
//  « Sponsorisé » : une place payée par un boost se dit toujours, et dit
//  pourquoi elle est montrée. Le détail s'ouvre sans quitter la carte.
// ─────────────────────────────────────────────
export const SponsoredNote = ({ sponsored }: { sponsored: Sponsored }) => (
  <details className={styles.note}>
    <summary className={styles.summary}>
      Sponsorisé <span className={styles.why}>· Pourquoi je vois ceci ?</span>
    </summary>
    <p className={styles.text}>{sponsored.why}</p>
  </details>
);
