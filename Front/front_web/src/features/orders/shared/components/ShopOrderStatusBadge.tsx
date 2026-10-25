import {
  SHOP_ORDER_STATUS_LABELS,
  SHOP_ORDER_STATUS_TONES,
  type ShopOrderStatus,
} from "../../../../entities/order";
import { StatusBadge } from "../../../../shared/ui";

export const ShopOrderStatusBadge = ({ status }: { status: ShopOrderStatus }) => (
  <StatusBadge tone={SHOP_ORDER_STATUS_TONES[status]}>{SHOP_ORDER_STATUS_LABELS[status]}</StatusBadge>
);
