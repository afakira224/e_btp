import 'package:apk/app/providers.dart';
import 'package:apk/entities/cart.dart';
import 'package:apk/entities/delivery.dart';
import 'package:apk/features/auth/shared/auth_controller.dart';
import 'package:apk/features/cart/shared/cart_controller.dart';
import 'package:apk/features/cart/shared/delivery_controller.dart';
import 'package:apk/shared/api/api_client.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Devis tel que le back le renvoie (POST /cart/:userId/delivery-quote).
const _quoteJson = {
  'groups': [
    {
      'boutiqueId': 'shop-1',
      'boutiqueNom': 'Négoce Boké',
      'pickupAdresse': 'Kamsar, Conakry',
      'items': [
        {'productBoutiqueId': 'pb-1', 'quantity': 1},
        {'productBoutiqueId': 'pb-2', 'quantity': 3},
      ],
      'options': [
        {'method': 'pickup', 'fee': 0},
        {'method': 'flat_rate', 'fee': 25000},
      ],
      'selectedMethod': 'flat_rate',
      'fee': 25000,
    },
    {
      'boutiqueId': 'shop-2',
      'items': [
        {'productBoutiqueId': 'pb-3', 'quantity': 1},
      ],
      'options': [],
      'selectedMethod': null,
      'fee': null,
      'error': "Les articles de Dépôt Matam n'ont aucun mode de livraison en commun : commandez-les séparément.",
    },
  ],
  'shippingFee': 25000,
  'ready': false,
  'currency': 'GNF',
  'subtotal': 100000,
  'total': 125000,
};

class _FakeApi implements ApiClient {
  final posts = <(String, Object?)>[];

  @override
  Future<ApiResponse> post(String path, [Object? body]) async {
    posts.add((path, body));
    return const ApiResponse(success: true, message: 'Devis de livraison calculé', statusCode: 200, data: _quoteJson);
  }

  @override
  Future<ApiResponse> get(String path) => throw UnimplementedError();
  @override
  Future<ApiResponse> put(String path, [Object? body]) => throw UnimplementedError();
  @override
  Future<ApiResponse> patch(String path, [Object? body]) => throw UnimplementedError();
  @override
  Future<ApiResponse> delete(String path) => throw UnimplementedError();
}

class _FixedCart extends CartController {
  @override
  Cart build() => const Cart(
        items: [CartItem(productBoutiqueId: 'pb-1', price: 100000, unitPrice: 100000, quantity: 1, stock: 5, lineTotal: 100000)],
        totalItems: 1,
        totalAmount: 100000,
      );
}

void main() {
  test('le devis se lit comme le back l’envoie', () {
    final quote = DeliveryQuote.fromJson(Map<String, dynamic>.from(_quoteJson));

    expect(quote.total, 125000);
    expect(quote.ready, isFalse);
    final group = quote.groupOf('pb-2')!;
    expect(group.boutiqueNom, 'Négoce Boké');
    expect(group.options.map((o) => o.method), [DeliveryMode.pickup, DeliveryMode.flatRate]);
    expect(group.selectedMethod, DeliveryMode.flatRate);
    expect(quote.groupOf('pb-3')!.error, contains('aucun mode'));
    expect(quote.groupOf('inconnu'), isNull);
  });

  test('« Gratuit » plutôt que 0 GNF', () {
    expect(formatFee(0), 'Gratuit');
    expect(formatFee(25000).replaceAll(RegExp(r'\s'), ' '), '25 000 GNF');
  });

  test('le devis envoie le mode choisi par boutique, jamais un montant', () async {
    final api = _FakeApi();
    final container = ProviderContainer.test(overrides: [
      apiClientProvider.overrideWithValue(api),
      currentUserIdProvider.overrideWithValue('u1'),
      cartProvider.overrideWith(_FixedCart.new),
    ]);

    container.read(deliverySelectionProvider.notifier).choose('shop-1', DeliveryMode.pickup);
    await container.read(deliveryQuoteProvider.future);

    expect(api.posts.single.$1, '/cart/u1/delivery-quote');
    expect(api.posts.single.$2, {
      'deliveries': [
        {'boutiqueId': 'shop-1', 'method': 'pickup'},
      ],
    });
  });

  test('une boutique sortie du panier est oubliée', () {
    final container = ProviderContainer.test(overrides: [currentUserIdProvider.overrideWithValue('u1')]);
    final selection = container.read(deliverySelectionProvider.notifier)
      ..choose('shop-1', DeliveryMode.pickup)
      ..choose('shop-2', DeliveryMode.free);

    selection.keepOnly({'shop-2'});

    expect(container.read(deliverySelectionProvider), {'shop-2': DeliveryMode.free});
  });
}
