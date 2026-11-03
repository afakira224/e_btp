import 'package:apk/entities/cart.dart';
import 'package:apk/entities/order.dart';
import 'package:apk/entities/product.dart';
import 'package:apk/entities/promotion.dart';
import 'package:apk/entities/shop_request.dart';
import 'package:apk/entities/support.dart';
import 'package:apk/shared/api/api_exception.dart';
import 'package:apk/shared/api/mock/mock_api_client.dart';
import 'package:apk/shared/api/mock/mock_db.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ─────────────────────────────────────────────
//  Parcours client sur la couche simulée, de bout en bout : les mêmes
//  routes et les mêmes règles que le back (commande, paiement, retour,
//  support, promotions, demande de boutique).
// ─────────────────────────────────────────────

late MockApiClient api;
late String userId;

Future<void> fresh() async {
  SharedPreferences.setMockInitialValues({});
  MockApiClient.latency = Duration.zero;
  api = await MockApiClient.create();
  final login = await api.post('/auth/login', {'email': demoEmail, 'password': demoPassword});
  userId = (login.map['user'] as Map)['_id'] as String;
}

/// Remplit le panier puis choisit, pour chaque boutique, son premier mode.
Future<Map<String, String>> fillCart(List<(String, int)> lines) async {
  await api.delete('/cart/$userId');
  for (final (id, q) in lines) {
    await api.post('/cart/$userId/items', {'productBoutiqueId': id, 'quantity': q});
  }
  final quote = (await api.post('/cart/$userId/delivery-quote', {'deliveries': <Object>[]})).map;
  return {
    for (final g in (quote['groups'] as List).cast<Map>())
      g['boutiqueId'] as String: ((g['options'] as List).cast<Map>().firstWhere((o) => o['method'] == 'pickup', orElse: () => (g['options'] as List).first as Map)['method'] as String),
  };
}

Map<String, Object?> checkout(Map<String, String> modes, {String payment = 'on_delivery', String? code, String? addressId}) => {
  'deliveries': [
    for (final e in modes.entries) {'boutiqueId': e.key, 'method': e.value},
  ],
  'paymentMethod': payment,
  'code': ?code,
  'addressId': ?addressId,
  'telephone': '620000000',
};

Future<ApiException> failure(Future<Object?> call) async {
  try {
    await call;
  } on ApiException catch (e) {
    return e;
  }
  fail('Un refus était attendu');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(fresh);

  test('une base neuve a des commandes de démonstration découpées par boutique, et une demande de support', () async {
    final orders = (await api.get('/orders?userId=$userId&limit=50')).map;
    final list = (orders['orders'] as List).cast<Map>().map((o) => Order.fromJson(o.cast())).toList();
    expect(list, isNotEmpty);
    for (final o in list) {
      expect(o.parts, isNotEmpty, reason: o.reference);
      expect(o.parts.every((p) => p.orderId == o.id), isTrue);
    }
    final tickets = (await api.get('/support/tickets?scope=mine&tab=open')).map;
    expect((tickets['tickets'] as List), isNotEmpty);
  });

  test('commande payée à la livraison : une part par boutique, annulable avant expédition', () async {
    final offers = ((await api.get('/product-boutiques/search?limit=40&inStock=true')).map['items'] as List).cast<Map>();
    final byShop = <String, String>{};
    for (final o in offers) {
      byShop.putIfAbsent((o['boutique'] as Map)['id'] as String, () => o['id'] as String);
      if (byShop.length == 2) break;
    }
    final modes = await fillCart([for (final id in byShop.values) (id, 1)]);
    final created = await api.post('/orders/$userId', checkout(modes));
    final order = Order.fromJson(created.map);
    expect(order.parts, hasLength(2));
    expect(order.paymentMethod, PaymentMethod.onDelivery);
    expect(order.parts.every((p) => p.status == ShopOrderStatus.pending), isTrue);
    expect(order.parts.first.availableActions, contains(ShopOrderAction.cancel));

    final cart = Cart.fromJson((await api.get('/cart/$userId')).map);
    expect(cart.items, isEmpty, reason: 'le panier se vide à la commande');

    final part = order.parts.first;
    final cancelled = ShopOrder.fromJson((await api.patch('/shop-orders/${part.id}/cancel', {'reason': cancellationReasons.keys.first})).map);
    expect(cancelled.status, ShopOrderStatus.cancelled);
    expect(cancelled.availableActions, isEmpty);
    final after = Order.fromJson((await api.get('/orders/${order.id}')).map);
    expect(after.status.isOpen, isTrue, reason: "l'autre boutique suit son cours");
  });

  test('paiement en ligne : la page du prestataire, puis accepté ou refusé (panier restauré)', () async {
    final offer = ((await api.get('/product-boutiques/search?limit=5&inStock=true')).map['items'] as List).first as Map;
    var modes = await fillCart([(offer['id'] as String, 2)]);
    final placed = await api.post('/orders/$userId', checkout(modes, payment: 'online'));
    final redirect = (placed.map['payment'] as Map)['redirectUrl'] as String;
    expect(redirect, endsWith('/paiement/${placed.map['_id'] ?? placed.map['id']}'));
    final order = Order.fromJson(placed.map);
    expect(order.awaitsPayment, isTrue);

    await api.post('/payments/sandbox/${order.id}', {'outcome': 'paid'});
    final paid = Order.fromJson((await api.get('/orders/${order.id}')).map);
    expect(paid.paymentStatus, OrderPaymentStatus.paid);
    expect(paid.awaitsPayment, isFalse);

    modes = await fillCart([(offer['id'] as String, 1)]);
    final second = Order.fromJson((await api.post('/orders/$userId', checkout(modes, payment: 'online'))).map);
    await api.post('/payments/sandbox/${second.id}', {'outcome': 'failed'});
    final refused = Order.fromJson((await api.get('/orders/${second.id}')).map);
    expect(refused.awaitsPayment, isFalse);
    final cart = Cart.fromJson((await api.get('/cart/$userId')).map);
    expect(cart.items.map((i) => i.productBoutiqueId), contains(offer['id']), reason: 'un refus remet les articles dans le panier');
  });

  test('un code promo de la plateforme se prévisualise et réduit la commande', () async {
    final offer = ((await api.get('/product-boutiques/search?limit=5&inStock=true&sort=price_desc')).map['items'] as List).first as Map;
    final modes = await fillCart([(offer['id'] as String, 1)]);
    final preview = (await api.post('/promotions/apply', {'userId': userId, 'code': 'bienvenue10'})).map;
    expect((preview['discountAmount'] as num), greaterThan(0));
    final order = Order.fromJson((await api.post('/orders/$userId', checkout(modes, code: 'BIENVENUE10'))).map);
    expect(order.discountAmount, greaterThan(0));
    final unknown = await failure(api.post('/promotions/apply', {'userId': userId, 'code': 'NEXISTEPAS'}));
    expect(unknown.statusCode, anyOf(400, 404));
  });

  test("un prix monté depuis l'ajout au panier bloque la commande (409)", () async {
    final offer = ((await api.get('/product-boutiques/search?limit=5&inStock=true')).map['items'] as List).first as Map;
    final modes = await fillCart([(offer['id'] as String, 1)]);
    // Le panier garde le prix de l'ajout : on le fait passer sous le prix du moment.
    final db = api.debugDb;
    final cart = (db.list('carts').firstWhere((c) => c['userId'] == userId));
    for (final item in (cart['items'] as List).cast<Map>()) {
      item['price'] = (item['price'] as num) - 1000;
    }
    final error = await failure(api.post('/orders/$userId', checkout(modes)));
    expect(error.statusCode, 409);
    final refreshed = Cart.fromJson((await api.get('/cart/$userId')).map);
    expect(refreshed.items.single.priceChanged, isFalse, reason: 'le panier est remis au prix du moment');
  });

  test('retour d’une part livrée : ouvre une demande de support', () async {
    final orders = ((await api.get('/orders?userId=$userId&limit=50')).map['orders'] as List? ?? const []).cast<Map>().map((o) => Order.fromJson(o.cast()));
    final delivered = orders.expand((o) => o.parts).where((p) => p.availableActions.contains(ShopOrderAction.requestReturn)).first;
    final missing = await failure(api.patch('/shop-orders/${delivered.id}/return', <String, Object?>{}));
    expect(missing.statusCode, anyOf(400, 422));
    final reason = returnReasons.keys.firstWhere((r) => !returnReasonsNeedingPhoto.contains(r));
    final res = await api.patch('/shop-orders/${delivered.id}/return', {'reason': reason, 'note': 'La couleur ne correspond pas à la photo.'});
    final part = ShopOrder.fromJson(res.map);
    expect(part.status, ShopOrderStatus.returnRequested);
    final tickets = ((await api.get('/support/tickets?scope=mine&tab=open')).map['tickets'] as List).cast<Map>().map((t) => SupportTicket.fromJson(t.cast()));
    expect(tickets.any((t) => t.type == SupportTicketType.returnRequest), isTrue);
  });

  test('support : signaler une annonce une seule fois, écrire, fermer', () async {
    final offer = ((await api.get('/product-boutiques/search?limit=1')).map['items'] as List).first as Map;
    final body = {'type': 'listing_report', 'reason': SupportTicketType.listingReport.reasons.keys.first, 'description': 'Photo sans rapport avec le produit vendu.', 'targetId': offer['id']};
    final created = SupportTicket.fromJson((await api.post('/support/tickets', body)).map);
    expect(created.number, startsWith('SUP-'));
    final twice = await failure(api.post('/support/tickets', body));
    expect(twice.statusCode, 409);

    final answered = SupportTicket.fromJson((await api.post('/support/tickets/${created.id}/messages', {'body': 'Appelez-moi au 620 00 00 00'})).map);
    expect(answered.warning, isNotNull, reason: 'un numéro dans un message est signalé');

    final closed = SupportTicket.fromJson((await api.patch('/support/tickets/${created.id}/close', <String, Object?>{})).map);
    expect(closed.status.isOpen, isFalse);
  });

  test("demande d'ouverture de boutique : validée comme sur le site, une seule en attente, annulable", () async {
    final familles = (await api.get('/familles')).list.cast<Map>();
    final incomplete = await failure(api.post('/shop-requests', {'nom': 'X'}));
    expect(incomplete.statusCode, 422);
    final body = {
      'nom': 'Dépôt Test Ratoma',
      'description': 'Ciment, fer à béton et agrégats livrés sur Ratoma et Dixinn.',
      'familleIds': [familles.first['id']],
      'sellerType': 'particulier',
      'experience': 'debutant',
      'catalogSize': 'moins_50',
      'hasPhysicalStore': true,
      'adresse': 'Kipé, Ratoma, Conakry',
      'acceptTerms': true,
    };
    final created = ShopRequest.fromJson((await api.post('/shop-requests', body)).map);
    expect(created.status, ShopRequestStatus.pending);
    expect(created.familles.single, familles.first['nom']);
    expect((await failure(api.post('/shop-requests', {...body, 'nom': 'Autre nom'}))).statusCode, 409);
    final cancelled = ShopRequest.fromJson((await api.patch('/shop-requests/${created.id}/cancel', const {})).map);
    expect(cancelled.status, ShopRequestStatus.cancelled);
  });

  test('promotions : prix barré, paliers, campagne, produits phares, meilleures ventes', () async {
    final discounted = ((await api.get('/product-boutiques/search?discounted=true&sort=discount&limit=20')).map['items'] as List).cast<Map>().map((o) => ProductBoutique.fromJson(o.cast())).toList();
    expect(discounted, isNotEmpty);
    for (final o in discounted) {
      expect(o.discountPercent, isNotNull, reason: o.id);
      expect(o.effectivePrice, lessThan(o.pricing!.basePrice), reason: o.id);
    }
    final percents = [for (final o in discounted) o.pricing!.percent!];
    expect(percents, orderedEquals([...percents]..sort((a, b) => b.compareTo(a))), reason: 'tri par remise décroissante');

    // Le ciment est en vente flash : le prix le plus bas l'emporte, palier ou promotion.
    final ciment = ProductBoutique.fromJson((await api.get('/product-boutiques/off-ciment-cem2')).map);
    expect(ciment.tiers.map((t) => t.minQuantity), [50, 200]);
    expect(ciment.unitPriceFor(200), lessThanOrEqualTo(ciment.unitPriceFor(50)));
    expect(ciment.unitPriceFor(50), lessThanOrEqualTo(ciment.unitPriceFor(1)));
    expect(ciment.unitPriceFor(1), ciment.effectivePrice);

    final campaigns = (await api.get('/campaigns')).list.cast<Map>().map((c) => Campaign.fromJson(c.cast())).toList();
    final running = campaigns.firstWhere((c) => c.isRunning);
    final page = (await api.get('/campaigns/${running.slug}')).map;
    expect((page['offers'] as List), isNotEmpty, reason: 'la campagne montre ses offres');

    final featured = await api.get('/product-boutiques?boutiqueId=${ciment.boutique?.id}&featured=true');
    expect(featured.data, isNotNull);

    final best = ((await api.get('/product-boutiques/search?sort=best_sellers&limit=5')).map['items'] as List);
    expect(best, isNotEmpty);
  });

  test('places sponsorisées : marquées, plafonnées à 3 expositions par jour, visite comptée une fois', () async {
    List<ProductBoutique> home(Object? data) => (data as List).cast<Map>().map((o) => ProductBoutique.fromJson(o.cast())).toList();
    final first = home((await api.get('/sponsored?slot=home')).data);
    expect(first, isNotEmpty);
    expect(first.every((o) => o.sponsored != null && o.sponsored!.why.isNotEmpty), isTrue);
    await api.get('/sponsored?slot=home');
    await api.get('/sponsored?slot=home');
    final fourth = home((await api.get('/sponsored?slot=home')).data);
    expect(fourth.where((o) => o.sponsored!.boostId == first.first.sponsored!.boostId), isEmpty, reason: 'plafond de 3 expositions par jour');

    final boost = first.first.sponsored!.boostId;
    await api.get('/product-boutiques/${first.first.id}?src=boost:$boost');
    await api.get('/product-boutiques/${first.first.id}?src=boost:$boost');
    final visits = (api.debugDb.data['marketing'] as Map)['visits'] as List;
    expect(visits.where((v) => v['boostId'] == boost), hasLength(1));

    final promos = home((await api.get('/sponsored?slot=promotions')).data);
    expect(promos.every((o) => o.sponsored!.kind == 'promotion'), isTrue);
    expect((await failure(api.get('/sponsored?slot=nulle-part'))).statusCode, 400);
  });
}
