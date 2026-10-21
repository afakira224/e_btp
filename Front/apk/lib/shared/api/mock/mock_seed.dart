import 'dart:convert';

import 'package:flutter/services.dart';

import '../../utils/format.dart';

// ─────────────────────────────────────────────
//  Jeu de données du mode simulé.
//
//  Exporté tel quel du mock du front web (assets/mock/seed.json) : même
//  catalogue, mêmes boutiques, mêmes promotions, mêmes commandes de
//  démonstration. Les dates sont relatives au moment de l'export : on les
//  décale d'autant au chargement, pour que les nouveautés restent récentes
//  et que la vente flash reste en cours.
// ─────────────────────────────────────────────
class MockSeed {
  MockSeed._(this._data);

  final Map<String, dynamic> _data;

  static const _dateKeys = {'createdAt', 'updatedAt', 'startDate', 'endDate', 'changedAt', 'viewedAt'};

  static Future<MockSeed> load() async {
    final raw = jsonDecode(await rootBundle.loadString('assets/mock/seed.json')) as Map<String, dynamic>;
    final exportedAt = DateTime.parse(raw['exportedAt'] as String);
    final shift = DateTime.now().difference(exportedAt);
    return MockSeed._(_illustrate(_shift(raw, shift)) as Map<String, dynamic>);
  }

  /// Photos de chaque produit : les offres du mock web n'ont pas d'image ;
  /// on leur donne les illustrations embarquées qui correspondent à leur nom
  /// (assets/images/products, sources dans design/products.py). Le vrai back
  /// fournit des URL http, que l'app affiche telles quelles.
  static const _pictures = [
    ('colle', 'colle'),
    ('plinthe', 'plinthe'),
    ('faience', 'faience'),
    ('carrelage', 'carrelage'),
    ('ciment', 'ciment'),
    ('fer a beton', 'fer'),
    ('treillis', 'treillis'),
    ('parpaing', 'parpaing'),
    ('gravier', 'gravier'),
    ('sable', 'sable'),
    ('enduit', 'enduit'),
    ('sous-couche', 'sous-couche'),
    ('peinture facade', 'peinture-facade'),
    ('peinture', 'peinture-interieure'),
    ('rouleau', 'kit-peintre'),
    ('parquet', 'parquet'),
    ('tube pvc', 'tube-pvc'),
    ('wc', 'wc'),
    ('mitigeur', 'mitigeur'),
    ('chauffe-eau', 'chauffe-eau'),
    ('cable', 'cable'),
    ('tableau', 'tableau'),
    ('disjoncteur', 'disjoncteur'),
    ('prise', 'prise'),
    ('projecteur', 'projecteur'),
    ('perforateur', 'perforateur'),
    ('meuleuse', 'meuleuse'),
    ('niveau laser', 'niveau-laser'),
    ('brouette', 'brouette'),
    ('echafaudage', 'echafaudage'),
    ('betonniere', 'betonniere'),
    ('casque', 'casque'),
  ];

  /// Photos par produit : 5 vues (face, gros plan, autre fond, studio, fiche).
  static const picturesPerProduct = 5;

  static List<String> picturesFor(String productName) {
    final name = normalize(productName);
    for (final (keyword, file) in _pictures) {
      if (name.contains(keyword)) {
        return [for (var i = 1; i <= picturesPerProduct; i++) 'assets/images/products/$file-$i.png'];
      }
    }
    return const [];
  }

  /// Toute offre sans image (où qu'elle soit dans le jeu : catalogue,
  /// commandes de démonstration) reçoit son illustration.
  static Object? _illustrate(Object? node) {
    if (node is Map<String, dynamic>) {
      final product = node['product'];
      final images = node['urlImages'];
      if (product is Map && images is List && images.isEmpty) {
        final pictures = picturesFor('${product['name'] ?? ''}');
        if (pictures.isNotEmpty) node['urlImages'] = pictures;
      }
      for (final value in node.values) {
        _illustrate(value);
      }
    } else if (node is List) {
      for (final e in node) {
        _illustrate(e);
      }
    }
    return node;
  }

  static Object? _shift(Object? node, Duration shift) {
    if (node is Map) {
      return node.map((key, value) {
        if (_dateKeys.contains(key) && value is String) {
          final date = DateTime.tryParse(value);
          if (date != null) return MapEntry(key as String, date.add(shift).toUtc().toIso8601String());
        }
        return MapEntry(key as String, _shift(value, shift));
      });
    }
    if (node is List) return node.map((e) => _shift(e, shift)).toList();
    return node;
  }

  List<Map<String, dynamic>> _list(String key) =>
      (_data[key] as List).cast<Map>().map((e) => e.cast<String, dynamic>()).toList();

  List<Map<String, dynamic>> get familles => _list('familles');
  List<Map<String, dynamic>> get categories => _list('categories');
  List<Map<String, dynamic>> get sousCategories => _list('sousCategories');
  List<Map<String, dynamic>> get shops => _list('shops');
  List<Map<String, dynamic>> get offers => _list('offers');
  List<Map<String, dynamic>> get promotions => _list('promotions');

  /// Adresses et commandes du compte de démonstration, pour un utilisateur donné.
  ({List<Map<String, dynamic>> addresses, List<Map<String, dynamic>> orders}) demoAccountFor(String userId) {
    final encoded = jsonEncode(_data['demoAccount']).replaceAll('__DEMO__', userId);
    final account = jsonDecode(encoded) as Map<String, dynamic>;
    List<Map<String, dynamic>> list(String k) =>
        (account[k] as List).cast<Map>().map((e) => e.cast<String, dynamic>()).toList();
    return (addresses: list('addresses'), orders: list('orders'));
  }
}
