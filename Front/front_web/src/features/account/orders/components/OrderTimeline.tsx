import {
  ORDER_FLOW,
  ORDER_STATUS_LABELS,
  OrderStatus,
  type Order,
} from "../../../../entities/order";
import { formatDateTime } from "../../shared";
import styles from "./OrderTimeline.module.css";

type StepState = "done" | "current" | "upcoming" | "cancelled";

interface Step {
  status: OrderStatus;
  state: StepState;
  at?: string | undefined;
  note?: string | undefined;
}

const HINTS: Partial<Record<OrderStatus, string>> = {
  pending: "Le dépôt doit confirmer la disponibilité des articles.",
  confirmed: "Le dépôt prépare votre commande.",
  shipped: "Votre commande est en route.",
  delivered: "Commande remise.",
};

/**
 * Étapes à afficher. Parcours normal : les quatre étapes, franchies ou à
 * venir. Commande annulée : seulement les étapes réellement franchies, puis
 * l'annulation — montrer « Livrée » à venir serait mentir.
 */
const stepsOf = (order: Order): Step[] => {
  const reached = new Map(order.statusHistory.map((step) => [step.status, step]));

  if (order.status === OrderStatus.CANCELLED) {
    const cancelled = reached.get(OrderStatus.CANCELLED);
    return [
      ...ORDER_FLOW.filter((status) => reached.has(status)).map((status) => ({
        status,
        state: "done" as const,
        at: reached.get(status)?.changedAt,
        note: reached.get(status)?.note,
      })),
      {
        status: OrderStatus.CANCELLED,
        state: "cancelled",
        at: cancelled?.changedAt,
        note: cancelled?.note,
      },
    ];
  }

  const currentIndex = ORDER_FLOW.indexOf(order.status);
  return ORDER_FLOW.map((status, index) => ({
    status,
    state: index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming",
    at: reached.get(status)?.changedAt,
    note: reached.get(status)?.note,
  }));
};

export const OrderTimeline = ({ order }: { order: Order }) => (
  <ol className={styles.timeline}>
    {stepsOf(order).map((step) => (
      <li
        key={step.status}
        className={[styles.step, styles[step.state]].join(" ")}
        aria-current={step.state === "current" ? "step" : undefined}
      >
        <span className={styles.marker} aria-hidden="true">
          {step.state === "done" ? "✓" : step.state === "cancelled" ? "×" : ""}
        </span>
        <div className={styles.body}>
          <span className={styles.label}>{ORDER_STATUS_LABELS[step.status]}</span>
          {step.at ? (
            <time className={styles.at} dateTime={step.at}>
              {formatDateTime(step.at)}
            </time>
          ) : (
            <span className={styles.at}>À venir</span>
          )}
          {step.note ? (
            <p className={styles.note}>{step.note}</p>
          ) : step.state === "current" && HINTS[step.status] ? (
            <p className={styles.note}>{HINTS[step.status]}</p>
          ) : null}
        </div>
      </li>
    ))}
  </ol>
);
