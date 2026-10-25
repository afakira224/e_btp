import { Link } from "react-router-dom";
import { ShopOrderStatus, type ShopOrder } from "../../../../entities/order";
import { formatPrice } from "../../../../entities/product";
import { formatDeadline, ShopOrderStatusBadge, timeLeft } from "../../../orders";
import styles from "./OrderQueue.module.css";

/** Échéance proche : moins de 12 heures pour agir. */
const URGENT_MS = 12 * 60 * 60 * 1000;

const DEADLINE_LABELS: Partial<Record<ShopOrderStatus, string>> = {
  pending: "Expire",
  return_requested: "Répondre avant",
  ready_for_pickup: "Retrait avant",
};

interface OrderQueueProps {
  orders: ShopOrder[];
  now: number;
  empty: string;
  detailPath: (part: ShopOrder) => string;
  /** Afficher le statut (utile quand la file mélange plusieurs statuts). */
  showStatus?: boolean;
}

/** File de commandes du tableau de bord : qui, combien, et pour quand. */
export const OrderQueue = ({ orders, now, empty, detailPath, showStatus = false }: OrderQueueProps) => {
  if (orders.length === 0) return <p className={styles.empty}>{empty}</p>;

  return (
    <ul className={styles.queue}>
      {orders.map((part) => {
        const label = DEADLINE_LABELS[part.status];
        const urgent = part.deadlineAt !== null && new Date(part.deadlineAt).getTime() - now < URGENT_MS;
        return (
          <li key={part.id}>
            <Link className={styles.row} to={detailPath(part)}>
              <span className={styles.main}>
                <span className={styles.customer}>
                  {part.customer ? `${part.customer.prenom} ${part.customer.nom}`.trim() : "Client"}
                </span>
                <span className={styles.meta}>
                  {part.totalItems} article{part.totalItems > 1 ? "s" : ""} · {formatPrice(part.amount)}
                </span>
              </span>
              <span className={styles.side}>
                {showStatus ? <ShopOrderStatusBadge status={part.status} /> : null}
                {part.deadlineAt && label ? (
                  <span className={[styles.deadline, urgent ? styles.urgent : ""].filter(Boolean).join(" ")}>
                    {label} {formatDeadline(part.deadlineAt)} · {timeLeft(part.deadlineAt, now)}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
};
