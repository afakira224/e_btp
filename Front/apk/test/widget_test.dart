import 'package:apk/entities/product.dart';
import 'package:apk/entities/shop.dart';
import 'package:apk/shared/utils/format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('une boutique ne conserve jamais son téléphone', () {
    final shop = Shop.fromJson({'_id': 's1', 'nom': 'Dépôt Kaloum', 'ownerId': 'u1', 'telephone': '620000000', 'adresse': 'Kaloum, Conakry'});
    expect(shop.nom, 'Dépôt Kaloum');
    expect(shop.toString().contains('620000000'), isFalse);
  });

  test('prix en francs guinéens', () {
    expect(formatPrice(125000).replaceAll(RegExp(r'\s'), ' '), '125 000 GNF');
  });

  test('normalisation pour la recherche', () {
    expect(normalize('  Cîment   Ébène '), 'ciment ebene');
  });

  test('ProductBoutique se décode sans planter sur un JSON partiel', () {
    final offer = ProductBoutique.fromJson({'_id': 'o1', 'price': 1000, 'stock': 0});
    expect(offer.isOutOfStock, isTrue);
  });
}
