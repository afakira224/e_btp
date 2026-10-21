import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/account/addresses/address_form_page.dart';
import '../features/account/addresses/addresses_page.dart';
import '../features/account/orders/order_detail_page.dart';
import '../features/account/orders/orders_page.dart';
import '../features/account/overview/account_home_page.dart';
import '../features/account/profile/profile_page.dart';
import '../features/account/settings/settings_page.dart';
import '../features/auth/forgot_password/forgot_password_page.dart';
import '../features/auth/forgot_password/reset_password_page.dart';
import '../features/auth/login/login_page.dart';
import '../features/auth/shared/auth_controller.dart';
import '../features/auth/shared/auth_widgets.dart';
import '../features/auth/signup/signup_page.dart';
import '../features/auth/verify_email/verify_email_page.dart';
import '../features/cart/cart_page.dart';
import '../features/cart/shared/cart_controller.dart';
import '../features/catalog/browse/browse_pages.dart';
import '../features/catalog/lists/list_pages.dart';
import '../features/catalog/product/product_page.dart';
import '../features/home/home_page.dart';
import '../features/search/results/search_results_page.dart';
import '../features/search/search_bar/search_input_page.dart';
import '../features/search/shared/search_state.dart';
import '../features/shops/shops_pages.dart';
import '../features/welcome/onboarding_page.dart';
import '../features/welcome/splash_page.dart';
import '../features/welcome/welcome_page.dart';
import '../features/wishlist/wishlist_page.dart';
import '../shared/ui/responsive.dart';
import '../shared/ui/states.dart';
import 'theme/theme.dart';
import 'theme/tokens.dart';

// ─────────────────────────────────────────────
//  Routes de l'application.
//
//  Cinq onglets, chacun avec sa pile (StatefulShellRoute). Les écrans
//  partagés sont déclarés sous chaque onglet, pour s'ouvrir sans quitter
//  l'onglet courant. L'authentification s'affiche en plein écran, hors
//  onglets. Les liens du site web (emails, partages) sont traduits vers
//  ces chemins par [_fromWebPath].
// ─────────────────────────────────────────────

/// Écrans accessibles depuis n'importe quel onglet.
List<RouteBase> _sharedRoutes() => [
      GoRoute(path: 'produits/:offreId', builder: (_, s) => ProductPage(id: s.pathParameters['offreId']!)),
      GoRoute(path: 'boutique/:boutiqueId', builder: (_, s) => ShopPage(id: s.pathParameters['boutiqueId']!)),
      GoRoute(path: 'familles/:id', builder: (_, s) => FamillePage(id: s.pathParameters['id']!)),
      GoRoute(path: 'categories/:id', builder: (_, s) => CategoriePage(id: s.pathParameters['id']!)),
      GoRoute(path: 'sous-categories/:id', builder: (_, s) => SousCategoriePage(id: s.pathParameters['id']!)),
      // La saisie avant les résultats : deux écrans frères, pas empilés.
      GoRoute(path: 'recherche/saisie', builder: (_, s) => SearchInputPage(initial: s.uri.queryParameters['q'] ?? '')),
      GoRoute(
        path: 'recherche',
        // Une nouvelle recherche = un nouvel écran : la clé suit la requête.
        pageBuilder: (_, s) => MaterialPage(key: ValueKey(s.uri.toString()), child: SearchResultsPage(initial: parseSearchParams(s.uri.queryParameters))),
      ),
      GoRoute(path: 'nouveautes', builder: (_, _) => const NewArrivalsPage()),
      GoRoute(path: 'meilleures-ventes', builder: (_, _) => const BestSellersPage()),
      GoRoute(path: 'promotions', builder: (_, _) => const PromotionsPage()),
    ];

StatefulShellBranch _branch(String root, Widget page, [List<RouteBase> extra = const []]) => StatefulShellBranch(routes: [
      GoRoute(path: '/$root', builder: (_, _) => page, routes: [...extra, ..._sharedRoutes()]),
    ]);

const _guarded = ['/panier', '/compte'];
const _guestOnly = ['/login', '/signup', '/forgot-password', '/bienvenue'];

bool _under(String path, String root) => path == root || path.startsWith('$root/');

/// Chemins du site web → chemins de l'application.
String? _fromWebPath(Uri uri) {
  final s = uri.pathSegments;
  final q = uri.hasQuery ? '?${uri.query}' : '';
  // Lancement de l'app (ou lien vers la racine du site) : le splash d'abord.
  if (s.isEmpty) return '/splash';
  // `/boutiques/recherche` est un chemin de l'application, pas une boutique.
  const appScreens = {'recherche', 'nouveautes', 'meilleures-ventes', 'promotions'};
  if (s.length == 2 && !appScreens.contains(s[1])) {
    final id = Uri.encodeComponent(s[1]);
    switch (s[0]) {
      case 'produits':
        return '/accueil/produits/$id';
      case 'boutiques':
        return '/boutiques/boutique/$id';
      case 'familles' || 'categories' || 'sous-categories':
        return '/catalogue/${s[0]}/$id';
    }
  }
  if (s.length == 1) {
    switch (s[0]) {
      case 'familles' || 'categories':
        return '/catalogue';
      case 'recherche' || 'nouveautes' || 'meilleures-ventes' || 'promotions':
        return '/accueil/${s[0]}$q';
      case 'favoris':
        return '/compte/favoris';
    }
  }
  return null;
}

final routerProvider = Provider<GoRouter>((ref) {
  // Le routeur réévalue ses redirections à chaque changement de session.
  final auth = ValueNotifier(ref.read(authProvider));
  ref.listen(authProvider, (_, next) => auth.value = next);
  ref.onDispose(auth.dispose);

  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: auth,
    redirect: (context, state) {
      final web = _fromWebPath(state.uri);
      if (web != null) return web;

      final path = state.uri.path;
      final status = auth.value.status;
      final from = state.uri.queryParameters['from'];

      // Le splash part de lui-même, une fois la session connue.
      if (path == '/splash') return null;
      final guarded = _guarded.any((r) => _under(path, r));
      if (guarded) {
        // Tant que /auth/me n'a pas répondu, on n'éjecte personne.
        if (status == AuthStatus.pending) return '/splash?from=${Uri.encodeQueryComponent(state.uri.toString())}';
        if (status == AuthStatus.anonymous) return '/login?from=${Uri.encodeQueryComponent(state.uri.toString())}';
      }
      if (status == AuthStatus.authenticated && _guestOnly.contains(path)) {
        return from != null && from.startsWith('/') ? from : '/accueil';
      }
      return null;
    },
    errorBuilder: (context, state) => const _NotFoundPage(),
    routes: [
      GoRoute(path: '/splash', builder: (_, s) => SplashPage(from: s.uri.queryParameters['from'])),
      GoRoute(path: '/onboarding', builder: (_, _) => const OnboardingPage()),
      GoRoute(path: '/bienvenue', builder: (_, _) => const WelcomePage()),
      GoRoute(path: '/login', builder: (_, s) => LoginPage(from: s.uri.queryParameters['from'])),
      GoRoute(path: '/signup', builder: (_, _) => const SignupPage()),
      GoRoute(path: '/forgot-password', builder: (_, _) => const ForgotPasswordPage()),
      GoRoute(path: '/reset-password/:token', builder: (_, s) => ResetPasswordPage(token: s.pathParameters['token']!)),
      GoRoute(path: '/verify-email/:token', builder: (_, s) => VerifyEmailPage(token: s.pathParameters['token']!)),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => _Shell(shell: shell),
        branches: [
          _branch('accueil', const HomePage()),
          _branch('catalogue', const DomainesPage()),
          _branch('boutiques', const ShopsPage()),
          _branch('panier', const CartPage()),
          _branch('compte', const AccountHomePage(), [
            GoRoute(path: 'commandes', builder: (_, _) => const OrdersPage()),
            GoRoute(path: 'commandes/:orderId', builder: (_, s) => OrderDetailPage(id: s.pathParameters['orderId']!)),
            GoRoute(path: 'adresses', builder: (_, _) => const AddressesPage()),
            GoRoute(path: 'adresses/nouvelle', builder: (_, _) => const AddressFormPage()),
            GoRoute(path: 'adresses/:addressId/modifier', builder: (_, s) => AddressFormPage(addressId: s.pathParameters['addressId'])),
            GoRoute(path: 'profil', builder: (_, _) => const ProfilePage()),
            GoRoute(path: 'parametres', builder: (_, _) => const SettingsPage()),
            GoRoute(path: 'parametres/mot-de-passe', builder: (_, _) => const ChangePasswordPage()),
            GoRoute(path: 'favoris', builder: (_, _) => const WishlistPage()),
          ]),
        ],
      ),
    ],
  );
});

/// Barre d'onglets anthracite en bas sur téléphone (charte §9), rail
/// latéral sur tablette. Toucher l'onglet actif ramène à sa racine.
class _Shell extends ConsumerWidget {
  const _Shell({required this.shell});

  final StatefulNavigationShell shell;

  void _select(BuildContext context, int i) {
    HapticFeedback.selectionClick();
    // Le message d'un onglet ne suit pas l'utilisateur sur un autre.
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    shell.goBranch(i, initialLocation: i == shell.currentIndex);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final cart = ref.watch(cartCountProvider);

    Widget counted(IconData icon, int count) => Badge(isLabelVisible: count > 0, label: Text(count > 99 ? '99+' : '$count'), child: Icon(icon));

    final items = [
      (Icons.home_outlined, Icons.home_rounded, 'Accueil', 0),
      (Icons.grid_view_outlined, Icons.grid_view_rounded, 'Catalogue', 0),
      (Icons.storefront_outlined, Icons.storefront, 'Boutiques', 0),
      (Icons.shopping_bag_outlined, Icons.shopping_bag, 'Panier', cart),
      (Icons.person_outline, Icons.person, 'Compte', 0),
    ];

    if (context.isExpanded) {
      return AnnotatedRegion(
        value: chromeOverlay(t),
        child: Scaffold(
          body: Row(children: [
            ColoredBox(
              color: t.chrome,
              child: SafeArea(
                right: false,
                child: NavigationRail(
                  selectedIndex: shell.currentIndex,
                  onDestinationSelected: (i) => _select(context, i),
                  labelType: NavigationRailLabelType.all,
                  leading: const Padding(padding: EdgeInsets.symmetric(vertical: Space.s3), child: BrandMark(size: 40)),
                  destinations: [
                    for (final (icon, selected, label, count) in items)
                      NavigationRailDestination(icon: counted(icon, count), selectedIcon: counted(selected, count), label: Text(label)),
                  ],
                ),
              ),
            ),
            Expanded(child: shell),
          ]),
        ),
      );
    }
    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) => _select(context, i),
        destinations: [
          for (final (icon, selected, label, count) in items)
            NavigationDestination(icon: counted(icon, count), selectedIcon: counted(selected, count), label: label, tooltip: count > 0 ? '$label, $count' : label),
        ],
      ),
    );
  }
}

class _NotFoundPage extends StatelessWidget {
  const _NotFoundPage();

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(),
        body: Center(
          child: EmptyState(
            icon: Icons.explore_off_outlined,
            title: 'Page introuvable',
            text: "Cette page n'existe pas ou n'est plus disponible.",
            actionLabel: "Retour à l'accueil",
            onAction: () => context.go('/accueil'),
          ),
        ),
      );
}
