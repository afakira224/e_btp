// Point d'entrée de l'espace vendeur « Ma boutique ».
// Réservé aux comptes boutique et à l'administration (SellerGuard) ; le back
// vérifie de son côté que la boutique appartient bien au compte.
export { SellerGuard, SellerShopLayout } from "./shared";
export { SellerHomePage } from "./shops";
export { ShopDeliveryPage } from "./delivery";
export { OfferFormPage, OffersPage } from "./products";
export { ShopInfoPage } from "./settings";
