import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import {
  AuthGuard,
  ForgotPasswordPage,
  GuestGuard,
  LoginPage,
  ResetPasswordPage,
  SignupPage,
  VerifyEmailPage,
} from "../../features/auth";
import {
  BestSellersPage,
  CategoriePage,
  FamillePage,
  FamillesPage,
  NewArrivalsPage,
  ProductPage,
  PromotionsPage,
  SousCategoriePage,
} from "../../features/catalog";
import { CartPage, CheckoutPage, PaymentPage } from "../../features/cart";
import { SearchResultsPage } from "../../features/search";
import { ShopPage, ShopsPage } from "../../features/shops";
import { WishlistPage } from "../../features/wishlist";
import { ShopRequestFormPage, ShopRequestStatusPage } from "../../features/shop-request";
import {
  AdminGuard,
  AdminOrdersPage,
  AdminShopOrderPage,
  ShopRequestReviewPage,
  ShopRequestsPage,
} from "../../features/admin";
import { HomePage } from "../../features/home";
import {
  AccountOverviewPage,
  AddressesPage,
  AddressFormPage,
  OrderDetailPage,
  OrdersPage,
  ProfilePage,
  SettingsPage,
} from "../../features/account";
import {
  OfferFormPage,
  OffersPage,
  SellerConsoleLayout,
  SellerDashboardPage,
  SellerGuard,
  SellerHomePage,
  SellerLoginPage,
  SellerShopLayout,
  ShopDeliveryPage,
  ShopInfoPage,
  ShopOrderPage,
  ShopOrdersPage,
} from "../../features/seller";
import { SiteLayout } from "../../shared/layout";
import { ROUTES } from "./routes";

export const AppRouter = () => (
  <BrowserRouter>
    <Routes>
      {/* Écrans réservés aux visiteurs : un utilisateur connecté est renvoyé
          vers l'accueil. Ils portent leur propre mise en page. */}
      <Route element={<GuestGuard />}>
        <Route path={ROUTES.login} element={<LoginPage />} />
        <Route path={ROUTES.signup} element={<SignupPage />} />
        <Route path={ROUTES.forgotPassword} element={<ForgotPasswordPage />} />
        <Route path={ROUTES.resetPassword} element={<ResetPasswordPage />} />
      </Route>

      {/* La vérification d'email s'ouvre depuis un lien : elle doit
          fonctionner que l'on soit connecté ou non. */}
      <Route path={ROUTES.verifyEmail} element={<VerifyEmailPage />} />

      {/* Espace boutique : une application à part du site marchand, avec sa
          connexion, sa barre et son menu latéral. Un visiteur est renvoyé
          vers sa connexion ; un client sans boutique, vers sa demande
          d'ouverture (SellerGuard). */}
      <Route element={<GuestGuard destination={ROUTES.seller} />}>
        <Route path={ROUTES.sellerLogin} element={<SellerLoginPage />} />
      </Route>
      <Route element={<AuthGuard loginPath={ROUTES.sellerLogin} />}>
        <Route element={<SellerGuard />}>
          <Route element={<SellerConsoleLayout />}>
            <Route path={ROUTES.seller} element={<SellerHomePage />} />
            <Route path={ROUTES.sellerShop} element={<SellerShopLayout />}>
              <Route index element={<SellerDashboardPage />} />
              <Route path={ROUTES.sellerOrders} element={<ShopOrdersPage />} />
              <Route path={ROUTES.sellerOrder} element={<ShopOrderPage />} />
              <Route path={ROUTES.sellerProducts} element={<OffersPage />} />
              <Route path={ROUTES.sellerProductNew} element={<OfferFormPage />} />
              <Route path={ROUTES.sellerProductEdit} element={<OfferFormPage />} />
              <Route path={ROUTES.sellerDelivery} element={<ShopDeliveryPage />} />
              <Route path={ROUTES.sellerInfo} element={<ShopInfoPage />} />
            </Route>
          </Route>
        </Route>
      </Route>

      {/* Pages publiques du site, sous l'ossature commune : l'en-tête et le
          pied de page ne sont montés qu'une fois pour toutes. */}
      <Route element={<SiteLayout />}>
        <Route path={ROUTES.home} element={<HomePage />} />
        <Route path={ROUTES.catalogue} element={<FamillesPage />} />
        <Route path={ROUTES.famille} element={<FamillePage />} />
        <Route path={ROUTES.categorie} element={<CategoriePage />} />
        <Route path={ROUTES.sousCategorie} element={<SousCategoriePage />} />
        <Route path={ROUTES.produit} element={<ProductPage />} />
        <Route path={ROUTES.recherche} element={<SearchResultsPage />} />
        <Route path={ROUTES.nouveautes} element={<NewArrivalsPage />} />
        <Route path={ROUTES.meilleuresVentes} element={<BestSellersPage />} />
        <Route path={ROUTES.promotions} element={<PromotionsPage />} />
        <Route path={ROUTES.boutiques} element={<ShopsPage />} />
        <Route path={ROUTES.boutique} element={<ShopPage />} />

        {/* `/familles` sans identifiant mène à la même carte du catalogue. */}
        <Route path="/familles" element={<Navigate to={ROUTES.catalogue} replace />} />

        {/* Panier et favoris sont des ressources de compte : le back les
            protège par requireAuth + requireSelf, la garde fait de même. */}
        <Route element={<AuthGuard />}>
          <Route path={ROUTES.panier} element={<CartPage />} />
          <Route path={ROUTES.commande} element={<CheckoutPage />} />
          <Route path={ROUTES.paiement} element={<PaymentPage />} />
          <Route path={ROUTES.favoris} element={<WishlistPage />} />

          {/* Espace compte : « Mon compte » présente les rubriques, chacune
              est une page à part entière. */}
          <Route path={ROUTES.account} element={<AccountOverviewPage />} />
          <Route path={ROUTES.accountOrders} element={<OrdersPage />} />
          <Route path={ROUTES.accountOrder} element={<OrderDetailPage />} />
          <Route path={ROUTES.accountAddresses} element={<AddressesPage />} />
          <Route path={ROUTES.accountAddressNew} element={<AddressFormPage />} />
          <Route path={ROUTES.accountAddressEdit} element={<AddressFormPage />} />
          <Route path={ROUTES.accountProfile} element={<ProfilePage />} />
          <Route path={ROUTES.accountSettings} element={<SettingsPage />} />
          <Route path={ROUTES.accountShopRequest} element={<ShopRequestStatusPage />} />
          <Route path={ROUTES.accountShopRequestNew} element={<ShopRequestFormPage />} />

          {/* Administration : comptes admin seulement. L'accueil de l'espace
              est la file des demandes de boutique à examiner ; les commandes
              et les litiges ont leur rubrique. */}
          <Route element={<AdminGuard />}>
            <Route path={ROUTES.admin} element={<Navigate to={ROUTES.adminShopRequests} replace />} />
            <Route path={ROUTES.adminShopRequests} element={<ShopRequestsPage />} />
            <Route path={ROUTES.adminShopRequest} element={<ShopRequestReviewPage />} />
            <Route path={ROUTES.adminOrders} element={<AdminOrdersPage />} />
            <Route path={ROUTES.adminOrder} element={<AdminShopOrderPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
    </Routes>
  </BrowserRouter>
);
