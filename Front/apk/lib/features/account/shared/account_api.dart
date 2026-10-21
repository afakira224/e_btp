import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../entities/address.dart';
import '../../../entities/json.dart';
import '../../../entities/order.dart';
import '../../../entities/page.dart';
import '../../../shared/api/api_client.dart';
import '../../auth/shared/auth_controller.dart';

// Espace compte — /orders et /addresses, protégés par session.
class AccountApi {
  const AccountApi(this._api);

  final ApiClient _api;

  Future<PageOf<Order>> orders(String userId, {OrderStatus? status, required int page, int limit = 10}) async {
    final data = (await _api.get('/orders${query({'userId': userId, 'status': status?.value, 'page': page, 'limit': limit})}')).map;
    final current = integer(data, 'page', page);
    return PageOf(
      items: objects(data, 'orders').map(Order.fromJson).toList(),
      total: integer(data, 'total'),
      page: current,
      hasMore: current < integer(data, 'totalPages'),
    );
  }

  Future<Order> order(String id) async => Order.fromJson((await _api.get('/orders/${Uri.encodeComponent(id)}')).map);

  /// Par défaut en tête, puis les plus récentes — l'ordre du back.
  Future<List<Address>> addresses(String userId) async =>
      (await _api.get('/addresses?userId=${Uri.encodeQueryComponent(userId)}')).list.cast<Map>().map((e) => Address.fromJson(e.cast())).toList();

  Future<void> createAddress(String userId, AddressInput input) => _api.post('/addresses', {'userId': userId, ...input.toJson()});
  Future<void> updateAddress(String id, AddressInput input) => _api.put('/addresses/${Uri.encodeComponent(id)}', input.toJson());
  Future<void> setDefaultAddress(String id) => _api.patch('/addresses/${Uri.encodeComponent(id)}/default');
  Future<void> deleteAddress(String id) => _api.delete('/addresses/${Uri.encodeComponent(id)}');
}

final accountApiProvider = Provider((ref) => AccountApi(ref.watch(apiClientProvider)));

final addressesProvider = FutureProvider.autoDispose<List<Address>>((ref) {
  final userId = ref.watch(currentUserIdProvider);
  return userId.isEmpty ? Future.value(const []) : ref.watch(accountApiProvider).addresses(userId);
});

final orderProvider = FutureProvider.autoDispose.family<Order, String>((ref, id) => ref.watch(accountApiProvider).order(id));

/// Aperçus des tuiles de « Mon compte » : décomptes lus avec `limit=1`,
/// justes quel que soit le nombre de commandes ; « en cours » additionne
/// trois statuts.
final accountOverviewProvider = FutureProvider.autoDispose<({int total, int inProgress})>((ref) async {
  final userId = ref.watch(currentUserIdProvider);
  if (userId.isEmpty) return (total: 0, inProgress: 0);
  final api = ref.watch(accountApiProvider);
  Future<int> count([OrderStatus? s]) async => (await api.orders(userId, status: s, page: 1, limit: 1)).total;
  final results = await Future.wait([count(), count(OrderStatus.pending), count(OrderStatus.confirmed), count(OrderStatus.shipped)]);
  return (total: results[0], inProgress: results[1] + results[2] + results[3]);
});
