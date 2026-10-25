// Point d'entrée du parcours d'ouverture de boutique : un client connecté
// dépose une demande depuis son profil, l'administration l'examine.
export { ShopRequestFormPage } from "./apply";
export { ShopRequestPanel, ShopRequestStatusPage } from "./status";

// Réutilisés par l'espace d'administration, qui examine les mêmes demandes.
export { ShopRequestStatusBadge, ShopRequestSummary, shopRequestPaths } from "./shared";
