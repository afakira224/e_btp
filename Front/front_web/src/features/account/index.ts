// Point d'entrée de la feature espace compte.
// Chaque rubrique est une page autonome, sans ossature commune : « Mon
// compte » les présente, le fil d'Ariane y ramène.
export { AccountOverviewPage } from "./overview";
export { OrderDetailPage, OrdersPage, type OrderDetailState } from "./orders";
export { AddressesPage, AddressFormPage, type AddressFormState } from "./addresses";
export { ProfilePage } from "./profile";
export { SettingsPage } from "./settings";

// Cadre et blocs de page, repris par l'espace vendeur pour rester homogène.
export { AccountPage, AccountPanel } from "./shared";