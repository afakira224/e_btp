import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../entities/cart.dart';
import '../../../shared/api/api_client.dart';
import '../../auth/shared/auth_controller.dart';

// ─────────────────────────────────────────────
//  Favoris — /wishlist/:userId, rattachés au compte. Le cœur des cartes et
//  de la fiche bascule partout à la fois : un seul état global.
// ─────────────────────────────────────────────
class WishlistController extends Notifier<Wishlist> {
  String _userId = '';
  ApiClient get _api => ref.read(apiClientProvider);
  String get _base => '/wishlist/${Uri.encodeComponent(_userId)}';

  @override
  Wishlist build() {
    _userId = ref.watch(currentUserIdProvider);
    if (_userId.isEmpty) return Wishlist.empty;
    _reload();
    return Wishlist.empty;
  }

  Future<void> _reload() async {
    try {
      state = Wishlist.fromJson((await _api.get(_base)).map);
    } catch (_) {}
  }

  Future<void> refresh() => _reload();

  Future<void> toggle(String productBoutiqueId) async {
    final res = state.has(productBoutiqueId)
        ? await _api.delete('$_base/items/${Uri.encodeComponent(productBoutiqueId)}')
        : await _api.post('$_base/items', {'productBoutiqueId': productBoutiqueId});
    state = Wishlist.fromJson(res.map);
  }

  Future<void> remove(String productBoutiqueId) async =>
      state = Wishlist.fromJson((await _api.delete('$_base/items/${Uri.encodeComponent(productBoutiqueId)}')).map);

  Future<void> clear() async => state = Wishlist.fromJson((await _api.delete(_base)).map);
}

final wishlistProvider = NotifierProvider<WishlistController, Wishlist>(WishlistController.new);
final wishlistCountProvider = Provider<int>((ref) => ref.watch(wishlistProvider).count);
