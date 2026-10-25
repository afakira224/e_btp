import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../entities/delivery.dart';
import '../../auth/shared/auth_controller.dart';
import 'cart_controller.dart';

// ─────────────────────────────────────────────
//  Livraison du panier.
//
//  Le client choisit un mode par boutique (depuis n'importe quelle ligne de
//  la boutique) ; le devis est relu au serveur à chaque changement du
//  panier ou du choix. Comme sur le web, rien n'est additionné ici.
// ─────────────────────────────────────────────

/// Mode demandé par le client, par boutique.
class DeliverySelectionController extends Notifier<Map<String, DeliveryMode>> {
  @override
  Map<String, DeliveryMode> build() {
    // Un autre compte, un autre panier : on repart de zéro.
    ref.watch(currentUserIdProvider);
    return const {};
  }

  void choose(String boutiqueId, DeliveryMode mode) => state = {...state, boutiqueId: mode};

  /// Oublie les boutiques sorties du panier : leur mode ne doit pas resurgir
  /// si elles y reviennent avec d'autres articles.
  void keepOnly(Set<String> boutiqueIds) {
    if (state.keys.every(boutiqueIds.contains)) return;
    state = {for (final e in state.entries) if (boutiqueIds.contains(e.key)) e.key: e.value};
  }
}

final deliverySelectionProvider =
    NotifierProvider<DeliverySelectionController, Map<String, DeliveryMode>>(DeliverySelectionController.new);

/// Devis du panier courant ; null quand le panier est vide ou hors session.
final deliveryQuoteProvider = FutureProvider<DeliveryQuote?>((ref) async {
  final userId = ref.watch(currentUserIdProvider);
  final cart = ref.watch(cartProvider);
  final selection = ref.watch(deliverySelectionProvider);
  if (userId.isEmpty || cart.items.isEmpty) return null;

  final response = await ref.read(apiClientProvider).post('/cart/${Uri.encodeComponent(userId)}/delivery-quote', {
    'deliveries': [
      for (final e in selection.entries) {'boutiqueId': e.key, 'method': e.value.value},
    ],
  });
  return DeliveryQuote.fromJson(response.map);
});
