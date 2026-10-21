import {
  DELIVERY_MODE_LABELS,
  DELIVERY_MODES,
  formatFee,
  type DeliveryOption,
} from "../../../../entities/delivery";
import styles from "./DeliverySummary.module.css";

interface DeliverySummaryProps {
  /** Modes actifs et frais, tels que le serveur les a renvoyés. */
  options: readonly DeliveryOption[];
}

/** Lecture seule : les trois modes, actifs ou non, avec leurs frais. */
export const DeliverySummary = ({ options }: DeliverySummaryProps) => (
  <ul className={styles.summary}>
    {DELIVERY_MODES.map((mode) => {
      const option = options.find((candidate) => candidate.method === mode);
      return (
        <li key={mode} className={[styles.row, option ? "" : styles.off].filter(Boolean).join(" ")}>
          <span className={styles.mark} aria-hidden="true">
            {option ? "✓" : "—"}
          </span>
          <span className={styles.name}>{DELIVERY_MODE_LABELS[mode]}</span>
          <span className={styles.fee}>{option ? formatFee(option.fee) : "Non proposé"}</span>
        </li>
      );
    })}
  </ul>
);
