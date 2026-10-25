import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES, type OrderStatus } from "../../../../entities/order";
import { StatusBadge } from "../../../../shared/ui";

/** Statut global d'une commande, déduit de ses sous-commandes. */
export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => (
  <StatusBadge tone={ORDER_STATUS_TONES[status]}>{ORDER_STATUS_LABELS[status]}</StatusBadge>
);
