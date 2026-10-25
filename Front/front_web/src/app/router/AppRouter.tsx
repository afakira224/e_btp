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
import { CartPage, CheckoutPage } from "../../features/cart";
import { SearchResultsPage } from "../../features/search";
import { ShopPage, ShopsPage } from "../../features/shops";
import { WishlistPage } from "../../features/wishlist";
import { ShopRequestFormPage, ShopRequestStatusPage } from "../../features/shop-request";
import { AdminGuard, ShopRequestReviewPage, ShopRequestsPage } from "../../features/admin";
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
  SellerGuard,
  SellerHomePage,
  SellerShopLayout,
  ShopDeliveryPage,
  ShopInfoPage,
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

          {/* Espace vendeur : comptes boutique et administration seulement.
              Une boutique = une ossature (en-tête, onglets) et ses rubriques. */}
          <Route element={<SellerGuard />}>
            <Route path={ROUTES.seller} element={<SellerHomePage />} />
            <Route path={ROUTES.sellerShop} element={<SellerShopLayout />}>
              <Route index element={<Navigate to="produits" replace />} />
              <Route path={ROUTES.sellerProducts} element={<OffersPage />} />
              <Route path={ROUTES.sellerProductNew} element={<OfferFormPage />} />
              <Route path={ROUTES.sellerProductEdit} element={<OfferFormPage />} />
              <Route path={ROUTES.sellerDelivery} element={<ShopDeliveryPage />} />
              <Route path={ROUTES.sellerInfo} element={<ShopInfoPage />} />
            </Route>
          </Route>

          {/* Administration : comptes admin seulement. L'accueil de l'espace
              est la file des demandes de boutique à examiner. */}
          <Route element={<AdminGuard />}>
            <Route path={ROUTES.admin} element={<Navigate to={ROUTES.adminShopRequests} replace />} />
            <Route path={ROUTES.adminShopRequests} element={<ShopRequestsPage />} />
            <Route path={ROUTES.adminShopRequest} element={<ShopRequestReviewPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
    </Routes>
  </BrowserRouter>
);
