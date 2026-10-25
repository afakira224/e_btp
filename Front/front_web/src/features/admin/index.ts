// Point d'entrée de l'espace d'administration.
// Réservé aux comptes admin (AdminGuard) ; le back le vérifie de son côté.
export { AdminGuard, adminPaths } from "./shared";
export { AdminOrdersPage, AdminShopOrderPage } from "./orders";
export { ShopRequestReviewPage, ShopRequestsPage } from "./shop-requests";
