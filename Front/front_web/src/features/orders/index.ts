// Cycle de vie des commandes, partagé par les trois places qui le lisent :
// le client (Mes commandes), la boutique (Commandes) et l'administration
// (litiges). Chaque sous-commande s'affiche et s'actionne avec les mêmes
// blocs ; le serveur dit qui peut faire quoi (`availableActions`).
export {
  fetchOrder,
  fetchShopOrder,
  fetchShopOrders,
  paymentDestination,
  performShopOrderAction,
  restartPayment,
  settleSandboxPayment,
  type PaymentSummary,
  type ShopOrderPage,
  type ShopOrderQuery,
} from "./shared/api/orders.api";
export { ShopOrderActions } from "./shared/components/ShopOrderActions";
export { ShopOrderBoard } from "./shared/components/ShopOrderBoard";
export { ShopOrderDetail } from "./shared/components/ShopOrderDetail";
export { ShopOrderHistory } from "./shared/components/ShopOrderHistory";
export { ShopOrderItems } from "./shared/components/ShopOrderItems";
export { ShopOrderPanel } from "./shared/components/ShopOrderPanel";
export { ShopOrderStatusBadge } from "./shared/components/ShopOrderStatusBadge";
export { useNow } from "./shared/hooks/useNow";
export { useShopOrder } from "./shared/hooks/useShopOrder";
export { formatDeadline, shortPartReference, timeLeft } from "./shared/utils/format";
export { guidanceFor, refundNoteFor } from "./shared/utils/guidance";
