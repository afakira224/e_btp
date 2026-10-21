import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../entities/cart.dart';
import '../../../shared/api/api_client.dart';
import '../../auth/shared/auth_controller.dart';

// ─────────────────────────────────────────────
//  Panier — rattaché au compte côté serveur (/cart/:userId, protégé par
//  session). Il se recharge à la connexion et se vide à la déconnexion.
//  Chaque action lève une ApiException (400 stock insuffisant, 401 hors
//  session) que l'écran affiche.
// ─────────────────────────────────────────────
class CartController extends Notifier<Cart> {
  String _userId = '';
  ApiClient get _api => ref.read(apiClientProvider);
  String get _base => '/cart/${Uri.encodeComponent(_userId)}';

  @override
  Cart build() {
    _userId = ref.watch(currentUserIdProvider);
    if (_userId.isEmpty) return Cart.empty;
    _reload();
    return Cart.empty;
  }

  Future<void> _reload() async {
    try {
      state = Cart.fromJson((await _api.get(_base)).map);
    } catch (_) {
      // Le compteur reste à zéro ; l'écran Panier affichera l'erreur au besoin.
    }
  }

  Future<void> refresh() => _reload();

  Future<void> add(String productBoutiqueId, [int quantity = 1]) async =>
      state = Cart.fromJson((await _api.post('$_base/items', {'productBoutiqueId': productBoutiqueId, 'quantity': quantity})).map);

  /// 0 retire la ligne.
  Future<void> setQuantity(String productBoutiqueId, int quantity) async =>
      state = Cart.fromJson((await _api.put('$_base/items/${Uri.encodeComponent(productBoutiqueId)}', {'quantity': quantity})).map);

  Future<void> remove(String productBoutiqueId) async =>
      state = Cart.fromJson((await _api.delete('$_base/items/${Uri.encodeComponent(productBoutiqueId)}')).map);

  Future<void> clear() async => state = Cart.fromJson((await _api.delete(_base)).map);
}

final cartProvider = NotifierProvider<CartController, Cart>(CartController.new);

/// Somme des quantités — la pastille de l'onglet.
final cartCountProvider = Provider<int>((ref) => ref.watch(cartProvider).totalItems);
