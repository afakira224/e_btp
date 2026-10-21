import 'dart:convert';
import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

import 'mock_seed.dart';

// ─────────────────────────────────────────────
//  Base de données simulée, persistée sur l'appareil.
//
//  Elle tient lieu à la fois de base et de cookie de session : un
//  redémarrage retrouve les comptes créés, le panier et la session ouverte,
//  comme le ferait le vrai back. Les documents reprennent les modèles
//  Mongoose (`_id`, profil séparé des secrets de connexion).
// ─────────────────────────────────────────────

const demoEmail = 'mamadou@btp.com';
const demoPassword = 'Secret@123';

String objectId() {
  final random = Random.secure();
  return List.generate(12, (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
}

String randomToken() {
  final random = Random.secure();
  return List.generate(32, (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
}

class MockDb {
  MockDb._(this._prefs, this.data);

  static const _key = 'btp.mock.db';

  final SharedPreferences _prefs;
  final Map<String, dynamic> data;

  static Future<MockDb> open(MockSeed seed) async {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(_key);
    if (stored != null) {
      try {
        return MockDb._(prefs, jsonDecode(stored) as Map<String, dynamic>);
      } catch (_) {
        // Base illisible : on repart d'un jeu neuf.
      }
    }
    final db = MockDb._(prefs, _seed(seed));
    await db.save();
    return db;
  }

  /// Un compte vérifié prêt à se connecter, avec un historique de commandes,
  /// et un compte non vérifié pour éprouver le refus 403 du login.
  static Map<String, dynamic> _seed(MockSeed seed) {
    final now = DateTime.now().toUtc().toIso8601String();
    final verifiedId = objectId();
    final pendingId = objectId();
    final demo = seed.demoAccountFor(verifiedId);

    Map<String, dynamic> user(String id, String nom, String prenom, String email, String tel, bool verified) => {
          '_id': id,
          'nom': nom,
          'prenom': prenom,
          'email': email,
          'telephone': tel,
          'avatar': null,
          'role': 'user',
          'isEmailVerified': verified,
          'createdAt': now,
          'updatedAt': now,
        };

    return {
      'users': [
        user(verifiedId, 'Diallo', 'Mamadou', demoEmail, '620000000', true),
        user(pendingId, 'Camara', 'Aissatou', 'aissatou@btp.com', '620111222', false),
      ],
      'logins': [
        {'entityId': verifiedId, 'email': demoEmail, 'password': demoPassword, 'emailVerifyToken': null, 'resetPasswordToken': null, 'resetPasswordExpires': null},
        {'entityId': pendingId, 'email': 'aissatou@btp.com', 'password': demoPassword, 'emailVerifyToken': randomToken(), 'resetPasswordToken': null, 'resetPasswordExpires': null},
      ],
      'carts': <Map<String, dynamic>>[],
      'wishlists': <Map<String, dynamic>>[],
      'recentlyViewed': <Map<String, dynamic>>[],
      'addresses': demo.addresses,
      'orders': demo.orders,
      'sessionUserId': null,
      'otherSessions': 2,
    };
  }

  List<Map<String, dynamic>> list(String key) {
    final value = data[key];
    if (value is List) return value.cast<Map<String, dynamic>>();
    final fresh = <Map<String, dynamic>>[];
    data[key] = fresh;
    return fresh;
  }

  String? get sessionUserId => data['sessionUserId'] as String?;
  set sessionUserId(String? id) => data['sessionUserId'] = id;

  Future<void> save() => _prefs.setString(_key, jsonEncode(data));
}
