// Point d'entrée de l'espace d'administration.
// Réservé aux comptes admin (AdminGuard) ; le back le vérifie de son côté.
export { AdminGuard, adminPaths } from "./shared";
export { ShopRequestReviewPage, ShopRequestsPage } from "./shop-requests";
