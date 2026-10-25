// Point d'entrée de l'espace boutique : une application de travail à part
// du site marchand, avec sa connexion, sa barre et son menu latéral.
// Réservé aux comptes boutique et à l'administration (SellerGuard) ; le back
// vérifie de son côté que la boutique appartient bien au compte.
export { SellerConsoleLayout, SellerGuard, SellerShopLayout, sellerPaths } from "./shared";
export { SellerLoginPage } from "./login";
export { SellerDashboardPage } from "./dashboard";
export { SellerHomePage } from "./shops";
export { ShopOrderPage, ShopOrdersPage } from "./orders";
export { ShopDeliveryPage } from "./delivery";
export { OfferFormPage, OffersPage } from "./products";
export { ShopInfoPage } from "./settings";
