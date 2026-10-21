import { ORDER_STATUS_LABELS, type OrderStatus } from "../../../../entities/order";
import styles from "./OrderStatusBadge.module.css";

/**
 * Statut d'une commande. Les couleurs fonctionnelles de la charte portent
 * le sens (attente, livrée, annulée) ; le libellé reste toujours écrit, la
 * couleur n'est jamais seule à parler.
 */
export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => (
  <span className={[styles.badge, styles[status]].join(" ")}>
    <span className={styles.dot} aria-hidden="true" />
    {ORDER_STATUS_LABELS[status]}
  </span>
);
