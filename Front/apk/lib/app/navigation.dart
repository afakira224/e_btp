import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/shared/auth_controller.dart';

// ─────────────────────────────────────────────
//  Navigation entre onglets.
//
//  Chaque onglet garde sa pile. Les écrans « partagés » (fiche produit,
//  recherche, page boutique, rayons, listes) existent sous chaque onglet :
//  on les pousse sous l'onglet courant, la barre d'onglets reste visible.
// ─────────────────────────────────────────────
const tabRoots = ['accueil', 'catalogue', 'boutiques', 'panier', 'compte'];

extension NavigationX on BuildContext {
  /// Onglet courant, d'après le premier segment de l'URL.
  String get currentTab {
    final first = GoRouterState.of(this).uri.pathSegments.firstOrNull;
    return tabRoots.contains(first) ? first! : 'accueil';
  }

  /// Pousse un écran partagé sous l'onglet courant : `openShared('produits/x')`.
  void openShared(String subPath) => push('/$currentTab/$subPath');

  void openOffer(String id) => openShared('produits/${Uri.encodeComponent(id)}');
  void openShop(String id) => openShared('boutique/${Uri.encodeComponent(id)}');
  void openFamille(String id) => openShared('familles/${Uri.encodeComponent(id)}');
  void openCategorie(String id) => openShared('categories/${Uri.encodeComponent(id)}');
  void openSousCategorie(String id) => openShared('sous-categories/${Uri.encodeComponent(id)}');

  void openSearch([String? q]) =>
      openShared(q == null || q.isEmpty ? 'recherche/saisie' : 'recherche?q=${Uri.encodeQueryComponent(q)}');
}

/// Action qui exige un compte : sans session, ouvre la connexion puis revient
/// à l'écran d'origine. Renvoie `true` quand l'utilisateur est connecté.
bool requireSession(BuildContext context, WidgetRef ref) {
  if (ref.read(authProvider).isAuthenticated) return true;
  final here = GoRouterState.of(context).uri.toString();
  context.push('/login?from=${Uri.encodeQueryComponent(here)}');
  return false;
}

void showMessage(BuildContext context, String message, {String? actionLabel, VoidCallback? onAction}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(message),
      // Un message passe : même avec une action, il s'efface seul.
      duration: const Duration(seconds: 3),
      persist: false,
      actionOverflowThreshold: 1,
      action: actionLabel == null ? null : SnackBarAction(label: actionLabel, onPressed: onAction ?? () {}),
    ));
}
