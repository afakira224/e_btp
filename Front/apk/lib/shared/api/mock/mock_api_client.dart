import 'dart:convert';

import '../api_client.dart';
import '../api_exception.dart';
import 'mock_db.dart';
import 'mock_seed.dart';

// ─────────────────────────────────────────────
//  Client simulé.
//
//  Même interface que HttpApiClient, mêmes routes, mêmes codes HTTP, même
//  enveloppe et mêmes messages que le back — portage du mock du front web
//  (mockClient.ts, cartWishlist.ts, account.ts). Passer au vrai serveur se
//  fait avec --dart-define=USE_MOCK=false, sans toucher une feature.
// ─────────────────────────────────────────────

typedef J = Map<String, dynamic>;

class MockApiClient implements ApiClient {
  MockApiClient._(this._seed, this._db);

  final MockSeed _seed;
  final MockDb _db;

  static Future<MockApiClient> create() async {
    final seed = await MockSeed.load();
    final db = await MockDb.open(seed);
    return MockApiClient._(seed, db);
  }

  // ── Enveloppe ─────────────────────────────────
  ApiResponse _ok(Object? data, [String message = 'Opération réussie', int status = 200]) =>
      ApiResponse(success: true, message: message, statusCode: status, data: _copy(data));

  /// Copie profonde : un écran ne peut pas modifier la « base » par ricochet.
  Object? _copy(Object? data) => data == null ? null : jsonDecode(jsonEncode(data));

  Never _fail(String message, int status) => throw ApiException(message, status);

  Future<ApiResponse> _call(String method, String path, Object? body) async {
    // Latence simulée : sans elle, les états de chargement ne s'observent pas.
    await Future<void>.delayed(const Duration(milliseconds: 260));
    final uri = Uri.parse(path);
    final b = body is Map ? body.cast<String, dynamic>() : <String, dynamic>{};
    final result = _route(method, uri.path, uri.queryParameters, b);
    await _db.save();
    return result;
  }

  @override
  Future<ApiResponse> get(String path) => _call('GET', path, null);
  @override
  Future<ApiResponse> post(String path, [Object? body]) => _call('POST', path, body);
  @override
  Future<ApiResponse> put(String path, [Object? body]) => _call('PUT', path, body);
  @override
  Future<ApiResponse> patch(String path, [Object? body]) => _call('PATCH', path, body);
  @override
  Future<ApiResponse> delete(String path) => _call('DELETE', path, null);

  // ── Routage ───────────────────────────────────
  ApiResponse _route(String method, String path, Map<String, String> q, J body) {
    final key = '$method $path';
    switch (key) {
      case 'POST /auth/register':
        return _register(body);
      case 'POST /auth/login':
        return _login(body);
      case 'POST /auth/logout':
        _db.sessionUserId = null;
        return _ok(null, 'Déconnexion réussie.');
      case 'POST /auth/logout-all':
        _sessionUser();
        final revoked = _db.data['otherSessions'] ?? 0;
        _db.sessionUserId = null;
        _db.data['otherSessions'] = 0;
        return _ok({'revoked': revoked}, 'Toutes les sessions ont été fermées.');
      case 'GET /auth/me':
        return _ok(_sessionUser());
      case 'PUT /auth/me':
        return _updateMe(body);
      case 'PUT /auth/change-password':
        return _changePassword(body);
      case 'POST /auth/forgot-password':
        return _forgotPassword(body);
      case 'POST /auth/resend-verification':
        return _resendVerification();
      case 'GET /categories':
        return _ok(_seed.categories.where((c) => c['actif'] != false).toList());
      case 'GET /familles':
        return _ok(_seed.familles.where((f) => f['actif'] != false).toList());
      case 'GET /product-boutiques':
        return _listOffers(q);
      case 'GET /product-boutiques/search':
        return _search(q);
      case 'GET /promotions/flash/active':
        return _flashSales();
      case 'GET /shops':
        return _listShops(q);
      case 'GET /addresses':
        return _listAddresses(q);
      case 'POST /addresses':
        return _createAddress(body);
      case 'GET /orders':
        return _listOrders(q);
    }

    RegExpMatch? m(String pattern) => RegExp('^$pattern\$').firstMatch(key);
    String g(RegExpMatch match, int i) => Uri.decodeComponent(match.group(i)!);

    // L'ordre compte : /search et /recently-viewed seraient sinon pris pour des identifiants.
    if (m(r'GET /product-boutiques/([^/]+)/suggestions') case final r?) return _suggestions(g(r, 1), q);
    if (m(r'GET /product-boutiques/recently-viewed/([^/]+)') case final r?) return _recentlyViewed(g(r, 1));
    if (m(r'GET /product-boutiques/([^/]+)') case final r?) return _getOffer(g(r, 1));
    if (m(r'GET /familles/([^/]+)') case final r?) return _ok(_find(_seed.familles, g(r, 1), 'Famille introuvable.'));
    if (m(r'GET /categories/([^/]+)') case final r?) return _ok(_find(_seed.categories, g(r, 1), 'Catégorie introuvable.'));
    if (m(r'GET /sous-categories/([^/]+)') case final r?) return _ok(_find(_seed.sousCategories, g(r, 1), 'Sous-catégorie introuvable.'));
    if (m(r'GET /shops/([^/]+)') case final r?) return _ok(_rawShop(_find(_seed.shops, g(r, 1), 'Boutique introuvable.')));
    if (m(r'PUT /auth/reset-password/([^/]+)') case final r?) return _resetPassword(g(r, 1), body);
    if (m(r'GET /auth/verify-email/([^/]+)') case final r?) return _verifyEmail(g(r, 1));

    // Panier : les routes « items » avant celles qui ne portent qu'un userId.
    if (m(r'PUT /cart/([^/]+)/items/([^/]+)') case final r?) return _updateCartItem(g(r, 1), g(r, 2), body);
    if (m(r'DELETE /cart/([^/]+)/items/([^/]+)') case final r?) return _removeCartItem(g(r, 1), g(r, 2));
    if (m(r'POST /cart/([^/]+)/items') case final r?) return _addToCart(g(r, 1), body);
    if (m(r'GET /cart/([^/]+)') case final r?) return _getCart(g(r, 1));
    if (m(r'DELETE /cart/([^/]+)') case final r?) return _clearCart(g(r, 1));

    if (m(r'DELETE /wishlist/([^/]+)/items/([^/]+)') case final r?) return _removeWish(g(r, 1), g(r, 2));
    if (m(r'POST /wishlist/([^/]+)/items') case final r?) return _addWish(g(r, 1), body);
    if (m(r'GET /wishlist/([^/]+)') case final r?) return _getWishlist(g(r, 1));
    if (m(r'DELETE /wishlist/([^/]+)') case final r?) return _clearWishlist(g(r, 1));

    if (m(r'PATCH /addresses/([^/]+)/default') case final r?) return _setDefaultAddress(g(r, 1));
    if (m(r'PUT /addresses/([^/]+)') case final r?) return _updateAddress(g(r, 1), body);
    if (m(r'DELETE /addresses/([^/]+)') case final r?) return _deleteAddress(g(r, 1));
    if (m(r'GET /orders/([^/]+)') case final r?) return _getOrder(g(r, 1));

    _fail('Route non simulée : $key', 404);
  }

  J _find(List<J> list, String id, String message) =>
      list.firstWhere((e) => e['id'] == id, orElse: () => _fail(message, 404));

  // ── Session ───────────────────────────────────
  J _sessionUser() {
    final id = _db.sessionUserId;
    final user = _db.list('users').where((u) => u['_id'] == id).firstOrNull;
    if (id == null || user == null) _fail('Session absente ou expirée, veuillez vous connecter.', 401);
    return user;
  }

  void _requireSelf(String userId) {
    if (_sessionUser()['_id'] != userId) _fail("Vous ne pouvez accéder qu'à vos propres données.", 403);
  }

  J? _loginByEmail(String email) {
    final normalized = email.trim().toLowerCase();
    return _db.list('logins').where((l) => (l['email'] as String).toLowerCase() == normalized).firstOrNull;
  }

  String _now() => DateTime.now().toUtc().toIso8601String();

  // ── Authentification ──────────────────────────
  ApiResponse _register(J body) {
    final email = (body['email'] as String? ?? '').trim().toLowerCase();
    if (_loginByEmail(email) != null) _fail('Email déjà utilisé.', 409);
    final id = objectId();
    final token = randomToken();
    // L'inscription publique ne crée que des comptes « user ».
    _db.list('users').add({
      '_id': id,
      'nom': body['nom'],
      'prenom': body['prenom'],
      'email': email,
      'telephone': body['telephone'],
      'avatar': null,
      'role': 'user',
      'isEmailVerified': false,
      'createdAt': _now(),
      'updatedAt': _now(),
    });
    _db.list('logins').add({'entityId': id, 'email': email, 'password': body['password'], 'emailVerifyToken': token, 'resetPasswordToken': null, 'resetPasswordExpires': null});
    return _ok({'verifyLink': '/verify-email/$token'}, 'Compte créé. Vérifie ton email.', 201);
  }

  ApiResponse _login(J body) {
    final login = _loginByEmail(body['email'] as String? ?? '');
    final user = login == null ? null : _db.list('users').where((u) => u['_id'] == login['entityId']).firstOrNull;
    // Même message dans les deux cas : on ne révèle pas si l'email existe.
    if (login == null || user == null || login['password'] != body['password']) _fail('Identifiants invalides.', 401);
    if (user['isEmailVerified'] != true) _fail('Email non vérifié.', 403);
    _db.sessionUserId = user['_id'] as String;
    return _ok({'user': user});
  }

  ApiResponse _updateMe(J body) {
    final user = _sessionUser();
    for (final field in ['nom', 'prenom', 'telephone', 'avatar']) {
      if (body.containsKey(field)) user[field] = body[field] is String ? (body[field] as String).trim() : body[field];
    }
    user['updatedAt'] = _now();
    return _ok(user);
  }

  ApiResponse _changePassword(J body) {
    final user = _sessionUser();
    final login = _db.list('logins').firstWhere((l) => l['entityId'] == user['_id'], orElse: () => _fail('Ressource introuvable.', 404));
    if (login['password'] != body['currentPassword']) _fail('Mot de passe actuel incorrect.', 400);
    if (body['newPassword'] == body['currentPassword']) _fail("Le nouveau mot de passe doit être différent de l'ancien.", 422);
    if (body['newPassword'] != body['confirmNewPassword']) _fail('Les mots de passe ne correspondent pas.', 422);
    login['password'] = body['newPassword'];
    // Comme le back : les autres sessions tombent, la courante est conservée.
    _db.data['otherSessions'] = 0;
    return _ok(null, 'Mot de passe mis à jour.');
  }

  ApiResponse _forgotPassword(J body) {
    final login = _loginByEmail(body['email'] as String? ?? '');
    if (login == null) _fail('Email introuvable.', 404);
    final token = randomToken();
    login['resetPasswordToken'] = token;
    login['resetPasswordExpires'] = DateTime.now().add(const Duration(hours: 1)).toUtc().toIso8601String();
    return _ok({'resetLink': '/reset-password/$token'}, 'Email de réinitialisation envoyé.');
  }

  ApiResponse _resetPassword(String token, J body) {
    final login = _db.list('logins').where((l) => l['resetPasswordToken'] == token).firstOrNull;
    final expires = DateTime.tryParse(login?['resetPasswordExpires'] as String? ?? '');
    if (login == null || (expires != null && expires.isBefore(DateTime.now()))) _fail('Token invalide ou expiré.', 400);
    login['password'] = body['password'];
    login['resetPasswordToken'] = null;
    login['resetPasswordExpires'] = null;
    // Un mot de passe réinitialisé ferme toutes les sessions.
    _db.sessionUserId = null;
    _db.data['otherSessions'] = 0;
    return _ok(null, 'Mot de passe réinitialisé.');
  }

  ApiResponse _verifyEmail(String token) {
    final login = _db.list('logins').where((l) => l['emailVerifyToken'] == token).firstOrNull;
    if (login == null) _fail('Token invalide.', 400);
    final user = _db.list('users').firstWhere((u) => u['_id'] == login['entityId'], orElse: () => _fail('Utilisateur introuvable.', 404));
    login['emailVerifyToken'] = null;
    user['isEmailVerified'] = true;
    user['updatedAt'] = _now();
    return _ok(null, 'Email vérifié avec succès.');
  }

  ApiResponse _resendVerification() {
    final user = _sessionUser();
    if (user['isEmailVerified'] == true) _fail('Email déjà vérifié.', 400);
    final login = _db.list('logins').firstWhere((l) => l['entityId'] == user['_id']);
    final token = randomToken();
    login['emailVerifyToken'] = token;
    return _ok({'verifyLink': '/verify-email/$token'}, 'Email de vérification renvoyé.');
  }

  // ── Offres ────────────────────────────────────
  List<J> get _offers => _seed.offers;

  J _offer(String id) => _offers.firstWhere((o) => o['id'] == id, orElse: () => _fail('Produit en boutique introuvable', 404));

  J? _first(J offer, String key) {
    final list = (offer['product'] as Map?)?[key] as List?;
    return (list == null || list.isEmpty) ? null : (list.first as Map).cast<String, dynamic>();
  }

  double _price(J o) => (o['price'] as num).toDouble();
  double? _discount(J o) => (o['discountPrice'] as num?)?.toDouble();
  bool _hasDiscount(J o) => _discount(o) != null && _discount(o)! < _price(o);
  double _effective(J o) => _hasDiscount(o) ? _discount(o)! : _price(o);

  J _paginate(List<Object?> all, Map<String, String> q, {int defaultLimit = 10, String itemsKey = 'items'}) {
    final page = (int.tryParse(q['page'] ?? '') ?? 1).clamp(1, 1 << 30);
    final limit = (int.tryParse(q['limit'] ?? '') ?? defaultLimit).clamp(1, 100);
    final start = (page - 1) * limit;
    return {
      itemsKey: all.skip(start).take(limit).toList(),
      'total': all.length,
      'page': page,
      'totalPages': (all.length / limit).ceil(),
    };
  }

  ApiResponse _listOffers(Map<String, String> q) {
    final shopId = q['boutiqueId'];
    if (shopId != null && !_seed.shops.any((s) => s['id'] == shopId)) _fail('Boutique introuvable', 404);
    final all = _offers.where((o) {
      if (shopId != null && (o['boutique'] as Map?)?['id'] != shopId) return false;
      if (q['productId'] != null && o['productId'] != q['productId']) return false;
      if (q['isFeatured'] != null && o['isFeatured'] != (q['isFeatured'] == 'true')) return false;
      return true;
    }).toList();
    return _ok(_paginate(all, q));
  }

  ApiResponse _search(Map<String, String> q) {
    final text = q['q']?.toLowerCase();
    final minPrice = double.tryParse(q['minPrice'] ?? '');
    final maxPrice = double.tryParse(q['maxPrice'] ?? '');
    final minRating = double.tryParse(q['minRating'] ?? '');

    // Le prix est filtré à part : la facette priceRange décrit la sélection
    // sans la contrainte de prix, comme le back.
    final withoutPrice = _offers.where((o) {
      if (q['boutiqueId'] != null && (o['boutique'] as Map?)?['id'] != q['boutiqueId']) return false;
      if (q['familleId'] != null && _first(o, 'familles')?['id'] != q['familleId']) return false;
      if (q['categoryId'] != null && _first(o, 'categories')?['id'] != q['categoryId']) return false;
      if (q['sousCategoryId'] != null && _first(o, 'sousCategories')?['id'] != q['sousCategoryId']) return false;
      if (text != null && text.isNotEmpty) {
        final product = o['product'] as Map?;
        final haystack = '${product?['name'] ?? ''} ${product?['description'] ?? ''}'.toLowerCase();
        if (!haystack.contains(text)) return false;
      }
      if (minRating != null && ((o['rating'] as num?) ?? 0) < minRating) return false;
      if (q['inStock'] == 'true' && (o['stock'] as num) <= 0) return false;
      if (q['discounted'] == 'true' && !_hasDiscount(o)) return false;
      return true;
    }).toList();

    // Comme le back, le filtre porte sur `price`, pas sur le prix remisé.
    final all = withoutPrice.where((o) {
      if (minPrice != null && _price(o) < minPrice) return false;
      if (maxPrice != null && _price(o) > maxPrice) return false;
      return true;
    }).toList();

    final sorts = <String, int Function(J, J)>{
      'newest': (a, b) => (b['createdAt'] as String).compareTo(a['createdAt'] as String),
      'price_asc': (a, b) => _price(a).compareTo(_price(b)),
      'price_desc': (a, b) => _price(b).compareTo(_price(a)),
      'rating': (a, b) => ((b['rating'] as num?) ?? 0).compareTo((a['rating'] as num?) ?? 0),
      'popular': (a, b) => ((b['reviewsCount'] as num?) ?? 0).compareTo((a['reviewsCount'] as num?) ?? 0),
    };
    all.sort(sorts[q['sort']] ?? sorts['newest']);

    final prices = withoutPrice.map(_price).toList();
    return _ok({
      ..._paginate(all, q),
      'priceRange': {
        'min': prices.isEmpty ? 0 : prices.reduce((a, b) => a < b ? a : b),
        'max': prices.isEmpty ? 0 : prices.reduce((a, b) => a > b ? a : b),
      },
    }, 'Résultats de recherche récupérés avec succès');
  }

  /// Même cascade que le back : sous-catégorie (3) > catégorie (2) > famille (1).
  ApiResponse _suggestions(String id, Map<String, String> q) {
    final item = _offer(id);
    final limit = (int.tryParse(q['limit'] ?? '') ?? 10).clamp(1, 50);
    int score(J c) {
      if (_first(item, 'sousCategories') != null && _first(c, 'sousCategories')?['id'] == _first(item, 'sousCategories')!['id']) return 3;
      if (_first(item, 'categories') != null && _first(c, 'categories')?['id'] == _first(item, 'categories')!['id']) return 2;
      if (_first(item, 'familles') != null && _first(c, 'familles')?['id'] == _first(item, 'familles')!['id']) return 1;
      return 0;
    }

    final ranked = _offers.where((c) => c['id'] != item['id'] && c['productId'] != item['productId'] && score(c) > 0).toList()
      ..sort((a, b) => score(b).compareTo(score(a)));
    return _ok(ranked.take(limit).toList());
  }

  ApiResponse _getOffer(String id) {
    final offer = _offer(id);
    // Comme le back : consulter une fiche alimente l'historique d'un utilisateur connecté.
    final userId = _db.sessionUserId;
    if (userId != null) {
      final history = _db.list('recentlyViewed').where((h) => h['userId'] == userId).firstOrNull ??
          (() {
            final created = <String, dynamic>{'userId': userId, 'items': <Map<String, dynamic>>[]};
            _db.list('recentlyViewed').add(created);
            return created;
          })();
      final items = (history['items'] as List).cast<Map<String, dynamic>>().where((e) => e['productBoutiqueId'] != id).toList()
        ..insert(0, {'productBoutiqueId': id, 'viewedAt': _now()});
      history['items'] = items.take(20).toList();
    }
    return _ok(offer);
  }

  ApiResponse _recentlyViewed(String userId) {
    _requireSelf(userId);
    final history = _db.list('recentlyViewed').where((h) => h['userId'] == userId).firstOrNull;
    final items = (history?['items'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final offers = items
        .map((e) => _offers.where((o) => o['id'] == e['productBoutiqueId']).firstOrNull)
        .whereType<J>()
        .toList();
    return _ok(offers, 'Produits récemment vus récupérés avec succès');
  }

  ApiResponse _flashSales() {
    final now = DateTime.now();
    final running = _seed.promotions.where((p) {
      final start = DateTime.parse(p['startDate'] as String);
      final end = DateTime.parse(p['endDate'] as String);
      return p['type'] == 'flash_sale' && p['actif'] == true && !start.isAfter(now) && end.isAfter(now);
    }).toList()
      ..sort((a, b) => (a['endDate'] as String).compareTo(b['endDate'] as String));
    return _ok(running.map((p) => {...p, 'isActive': true}).toList());
  }

  // ── Boutiques ─────────────────────────────────
  /// Le back renvoie ici le document brut (`_id`, `deletedAt`, `__v`).
  J _rawShop(J shop) {
    final copy = Map<String, dynamic>.of(shop)..remove('id');
    return {'_id': shop['id'], ...copy, 'deletedAt': null, '__v': 0};
  }

  ApiResponse _listShops(Map<String, String> q) {
    final search = q['search']?.toLowerCase();
    final all = _seed.shops.where((s) => search == null || (s['nom'] as String).toLowerCase().contains(search)).map(_rawShop).toList();
    return _ok(_paginate(all, q, itemsKey: 'shops'));
  }

  // ── Panier ────────────────────────────────────
  J _cartOf(String userId) {
    final carts = _db.list('carts');
    return carts.where((c) => c['userId'] == userId).firstOrNull ??
        (() {
          final cart = <String, dynamic>{'id': 'cart-$userId', 'userId': userId, 'items': <Map<String, dynamic>>[], 'amount': 0, 'createdAt': _now(), 'updatedAt': _now()};
          carts.add(cart);
          return cart;
        })();
  }

  List<J> _cartItems(J cart) => (cart['items'] as List).cast<Map<String, dynamic>>();

  J _cartDto(J cart) {
    final items = _cartItems(cart).map((item) {
      final pb = _offers.where((o) => o['id'] == item['productBoutiqueId']).firstOrNull;
      final unit = (item['price'] as num).toDouble();
      final qty = item['quantity'] as int;
      return {
        'productBoutiqueId': item['productBoutiqueId'],
        'productId': pb?['productId'],
        'productName': (pb?['product'] as Map?)?['name'],
        'urlImages': pb?['urlImages'] ?? <String>[],
        'price': pb?['price'] ?? unit,
        if (pb?['discountPrice'] != null) 'discountPrice': pb!['discountPrice'],
        'unitPrice': unit,
        'quantity': qty,
        'stock': pb?['stock'] ?? 0,
        'lineTotal': unit * qty,
      };
    }).toList();
    return {
      'id': cart['id'],
      'userId': cart['userId'],
      'items': items,
      'totalItems': items.fold<int>(0, (t, i) => t + (i['quantity'] as int)),
      'totalAmount': items.fold<double>(0, (t, i) => t + (i['lineTotal'] as double)),
    };
  }

  void _touch(J cart) => cart['updatedAt'] = _now();

  ApiResponse _getCart(String userId) {
    _requireSelf(userId);
    return _ok(_cartDto(_cartOf(userId)), 'Panier récupéré avec succès');
  }

  ApiResponse _addToCart(String userId, J body) {
    _requireSelf(userId);
    final pb = _offer(body['productBoutiqueId'] as String? ?? '');
    final quantity = (body['quantity'] as num?)?.toInt() ?? 1;
    final cart = _cartOf(userId);
    final existing = _cartItems(cart).where((i) => i['productBoutiqueId'] == pb['id']).firstOrNull;
    final next = ((existing?['quantity'] as int?) ?? 0) + quantity;
    // Le back répond 400 — et non 409 — sur un stock insuffisant.
    if (next > (pb['stock'] as num)) _fail('Stock insuffisant (disponible : ${pb['stock']})', 400);
    if (existing != null) {
      existing['quantity'] = next;
      existing['price'] = _effective(pb);
    } else {
      _cartItems(cart).add({'productBoutiqueId': pb['id'], 'quantity': quantity, 'price': _effective(pb)});
    }
    _touch(cart);
    return _ok(_cartDto(cart), 'Article ajouté au panier avec succès');
  }

  ApiResponse _updateCartItem(String userId, String pbId, J body) {
    _requireSelf(userId);
    final cart = _cartOf(userId);
    final items = _cartItems(cart);
    final index = items.indexWhere((i) => i['productBoutiqueId'] == pbId);
    if (index == -1) _fail('Article introuvable dans le panier', 404);
    final quantity = (body['quantity'] as num?)?.toInt() ?? 0;
    if (quantity == 0) {
      items.removeAt(index);
    } else {
      final pb = _offer(pbId);
      if (quantity > (pb['stock'] as num)) _fail('Stock insuffisant (disponible : ${pb['stock']})', 400);
      items[index]['quantity'] = quantity;
    }
    _touch(cart);
    return _ok(_cartDto(cart), 'Panier mis à jour avec succès');
  }

  ApiResponse _removeCartItem(String userId, String pbId) {
    _requireSelf(userId);
    final cart = _cartOf(userId);
    final items = _cartItems(cart);
    final index = items.indexWhere((i) => i['productBoutiqueId'] == pbId);
    if (index == -1) _fail('Article introuvable dans le panier', 404);
    items.removeAt(index);
    _touch(cart);
    return _ok(_cartDto(cart), 'Article retiré du panier avec succès');
  }

  ApiResponse _clearCart(String userId) {
    _requireSelf(userId);
    final cart = _cartOf(userId);
    cart['items'] = <Map<String, dynamic>>[];
    _touch(cart);
    return _ok(_cartDto(cart), 'Panier vidé avec succès');
  }

  // ── Favoris ───────────────────────────────────
  J _wishlistOf(String userId) {
    final lists = _db.list('wishlists');
    return lists.where((w) => w['userId'] == userId).firstOrNull ??
        (() {
          final w = <String, dynamic>{'id': 'wish-$userId', 'userId': userId, 'items': <Map<String, dynamic>>[]};
          lists.add(w);
          return w;
        })();
  }

  List<J> _wishItems(J w) => (w['items'] as List).cast<Map<String, dynamic>>();

  J _wishDto(J w) {
    final items = _wishItems(w).map((i) {
      final pb = _offers.where((o) => o['id'] == i['productBoutiqueId']).firstOrNull;
      return {'productBoutiqueId': i['productBoutiqueId'], 'productBoutique': ?pb};
    }).toList();
    return {'id': w['id'], 'userId': w['userId'], 'items': items, 'totalItems': items.length};
  }

  ApiResponse _getWishlist(String userId) {
    _requireSelf(userId);
    return _ok(_wishDto(_wishlistOf(userId)), 'Favoris récupérés avec succès');
  }

  ApiResponse _addWish(String userId, J body) {
    _requireSelf(userId);
    final pb = _offer(body['productBoutiqueId'] as String? ?? '');
    final w = _wishlistOf(userId);
    final already = _wishItems(w).any((i) => i['productBoutiqueId'] == pb['id']);
    if (!already) _wishItems(w).add({'productBoutiqueId': pb['id']});
    return _ok(_wishDto(w), already ? 'Ce produit est déjà dans les favoris' : 'Produit ajouté aux favoris avec succès');
  }

  ApiResponse _removeWish(String userId, String pbId) {
    _requireSelf(userId);
    final w = _wishlistOf(userId);
    final items = _wishItems(w);
    final index = items.indexWhere((i) => i['productBoutiqueId'] == pbId);
    if (index == -1) _fail('Article introuvable dans les favoris', 404);
    items.removeAt(index);
    return _ok(_wishDto(w), 'Produit retiré des favoris avec succès');
  }

  ApiResponse _clearWishlist(String userId) {
    _requireSelf(userId);
    final w = _wishlistOf(userId);
    w['items'] = <Map<String, dynamic>>[];
    return _ok(_wishDto(w), 'Favoris vidés avec succès');
  }

  // ── Adresses ──────────────────────────────────
  List<J> _liveAddresses(String userId) =>
      _db.list('addresses').where((a) => a['userId'] == userId && a['deletedAt'] == null).toList();

  J _address(String id) => _db.list('addresses').firstWhere((a) => a['id'] == id && a['deletedAt'] == null, orElse: () => _fail('Adresse non trouvée', 404));

  J _addressDto(J a) => Map<String, dynamic>.of(a)..remove('deletedAt');

  void _unsetOtherDefaults(String userId, String? keep) {
    for (final a in _liveAddresses(userId)) {
      if (a['id'] != keep) a['isDefault'] = false;
    }
  }

  int _byNewest(J a, J b) => (b['createdAt'] as String).compareTo(a['createdAt'] as String);

  ApiResponse _listAddresses(Map<String, String> q) {
    _requireSelf(q['userId'] ?? '');
    final sorted = _liveAddresses(q['userId']!)
      ..sort((a, b) {
        final byDefault = (b['isDefault'] == true ? 1 : 0) - (a['isDefault'] == true ? 1 : 0);
        return byDefault != 0 ? byDefault : _byNewest(a, b);
      });
    return _ok(sorted.map(_addressDto).toList(), 'Adresses récupérées avec succès');
  }

  String? _opt(Object? v) {
    final s = (v as String?)?.trim();
    return (s == null || s.isEmpty) ? null : s;
  }

  ApiResponse _createAddress(J body) {
    final userId = body['userId'] as String? ?? '';
    _requireSelf(userId);
    // La première adresse devient par défaut d'office.
    final makeDefault = _liveAddresses(userId).isEmpty || body['isDefault'] == true;
    if (makeDefault) _unsetOtherDefaults(userId, null);
    final address = <String, dynamic>{
      'id': objectId(),
      'userId': userId,
      'label': _opt(body['label']),
      'destinataire': _opt(body['destinataire']),
      'telephone': (body['telephone'] as String? ?? '').trim(),
      'adresse': (body['adresse'] as String? ?? '').trim(),
      'ville': (body['ville'] as String? ?? '').trim(),
      'commune': _opt(body['commune']),
      'pays': _opt(body['pays']) ?? 'Guinée',
      'isDefault': makeDefault,
      'deletedAt': null,
      'createdAt': _now(),
      'updatedAt': _now(),
    };
    _db.list('addresses').add(address);
    return _ok(_addressDto(address), 'Adresse créée avec succès', 201);
  }

  ApiResponse _updateAddress(String id, J body) {
    _sessionUser();
    final address = _address(id);
    for (final field in ['label', 'destinataire', 'telephone', 'adresse', 'ville', 'commune', 'pays']) {
      if (body[field] is String) address[field] = (body[field] as String).trim();
    }
    if (body['isDefault'] == true && address['isDefault'] != true) {
      _unsetOtherDefaults(address['userId'] as String, id);
      address['isDefault'] = true;
    }
    if (body['isDefault'] == false && address['isDefault'] == true) {
      final others = _liveAddresses(address['userId'] as String).where((a) => a['id'] != id).toList()..sort(_byNewest);
      if (others.isEmpty) _fail("Impossible de retirer l'adresse par défaut : c'est votre seule adresse.", 400);
      address['isDefault'] = false;
      others.first['isDefault'] = true;
    }
    address['updatedAt'] = _now();
    return _ok(_addressDto(address), 'Adresse mise à jour avec succès');
  }

  ApiResponse _setDefaultAddress(String id) {
    _sessionUser();
    final address = _address(id);
    _unsetOtherDefaults(address['userId'] as String, id);
    address['isDefault'] = true;
    return _ok(_addressDto(address), 'Adresse définie par défaut avec succès');
  }

  ApiResponse _deleteAddress(String id) {
    _sessionUser();
    final address = _address(id);
    final wasDefault = address['isDefault'] == true;
    address['deletedAt'] = _now();
    address['isDefault'] = false;
    // Si elle était par défaut, la plus récente restante prend le relais.
    if (wasDefault) {
      final rest = _liveAddresses(address['userId'] as String)..sort(_byNewest);
      if (rest.isNotEmpty) rest.first['isDefault'] = true;
    }
    return _ok(null, 'Adresse supprimée avec succès');
  }

  // ── Commandes ─────────────────────────────────
  /// Enrichissement façon `buildOrderDto` : offre, boutique et produit imbriqués.
  J _orderDto(J order) {
    final items = (order['items'] as List).cast<Map<String, dynamic>>().map((item) {
      final pb = _offers.where((o) => o['id'] == item['productBoutiqueId']).firstOrNull;
      final price = (item['price'] as num).toDouble();
      final qty = item['quantity'] as int;
      return {
        'productBoutique': ?pb,
        if (pb?['boutique'] != null) 'boutique': pb!['boutique'],
        if (pb?['product'] != null) 'product': pb!['product'],
        'price': price,
        'quantity': qty,
        'lineTotal': price * qty,
      };
    }).toList();
    return {...order, 'items': items, 'totalItems': items.fold<int>(0, (t, i) => t + (i['quantity'] as int))};
  }

  ApiResponse _listOrders(Map<String, String> q) {
    _requireSelf(q['userId'] ?? '');
    final all = _db.list('orders').where((o) => o['userId'] == q['userId'] && (q['status'] == null || o['status'] == q['status'])).toList()
      ..sort(_byNewest);
    return _ok(_paginate(all.map(_orderDto).toList(), q, itemsKey: 'orders'), 'Commandes récupérées avec succès');
  }

  ApiResponse _getOrder(String id) {
    final user = _sessionUser();
    final order = _db.list('orders').firstWhere((o) => o['id'] == id, orElse: () => _fail('Commande non trouvée', 404));
    if (order['userId'] != user['_id'] && user['role'] != 'admin') _fail('Vous ne pouvez consulter que vos propres commandes.', 403);
    return _ok(_orderDto(order), 'Commande récupérée avec succès');
  }
}
