import 'dart:convert';
import 'dart:io';

import 'package:apk/shared/api/mock/mock_seed.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('chaque produit du catalogue simulé a ses 5 photos', () {
    final seed = jsonDecode(File('assets/mock/seed.json').readAsStringSync()) as Map<String, dynamic>;
    final offers = (seed['offers'] as List).cast<Map<String, dynamic>>();
    for (final offer in offers) {
      final name = (offer['product'] as Map)['name'] as String;
      final pictures = MockSeed.picturesFor(name);
      expect(pictures, hasLength(MockSeed.picturesPerProduct), reason: name);
      for (final picture in pictures) {
        expect(File(picture).existsSync(), isTrue, reason: picture);
      }
    }
  });

  test('« Colle à carrelage » est une colle, pas un carrelage', () {
    expect(MockSeed.picturesFor('Colle à carrelage C2ET — 25 kg').first, 'assets/images/products/colle-1.png');
    expect(MockSeed.picturesFor('Peinture façade acrylique — 20 L').first, 'assets/images/products/peinture-facade-1.png');
  });
}
