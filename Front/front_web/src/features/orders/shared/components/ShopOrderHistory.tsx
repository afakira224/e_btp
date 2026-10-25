import {
  SHOP_ORDER_ACTOR_LABELS,
  SHOP_ORDER_STATUS_LABELS,
  type ShopOrder,
} from "../../../../entities/order";
import { formatStep } from "../utils/format";
import styles from "./ShopOrderHistory.module.css";

/**
 * Historique d'une sous-commande, de la plus ancienne étape à la plus
 * récente : qui a fait quoi, quand, et pourquoi. Le motif et la note sont
 * ceux que le client et la boutique ont lus dans leurs emails.
 */
export const ShopOrderHistory = ({ part }: { part: Pick<ShopOrder, "statusHistory"> }) => (
  <ol className={styles.history}>
    {part.statusHistory.map((step, index) => {
      const last = index === part.statusHistory.length - 1;
      return (
        <li key={`${step.status}-${step.changedAt}-${index}`} className={[styles.step, last ? styles.current : ""].join(" ")}>
          <span className={styles.marker} aria-hidden="true" />
          <div className={styles.body}>
            <span className={styles.label}>{SHOP_ORDER_STATUS_LABELS[step.status]}</span>
            <span className={styles.meta}>
              <time dateTime={step.changedAt}>{formatStep(step.changedAt)}</time>
              {" · "}
              {SHOP_ORDER_ACTOR_LABELS[step.actor]}
            </span>
            {step.reasonLabel ? <span className={styles.reason}>{step.reasonLabel}</span> : null}
            {step.note ? <p className={styles.note}>{step.note}</p> : null}
          </div>
        </li>
      );
    })}
  </ol>
);
