part of 'mock_api_client.dart';

// ─────────────────────────────────────────────
//  Commandes simulées — portage de Front/front_web/src/shared/api/mock/
//  orders.ts et shopOrders.ts, eux-mêmes portages du back
//  (order.controller.ts, shopOrder.workflow.ts, orderPayment.service.ts).
//
//  Une commande = une sous-commande par boutique. Le client peut annuler
//  une partie à confirmer ou en préparation, et demander un retour sur une
//  partie livrée, 7 jours au plus. Les échéances (48 h pour confirmer,
//  7 jours de retour, 30 minutes pour payer en ligne) sont appliquées à
//  chaque lecture, comme le ferait le planificateur du back.
//
//  Le stock du jeu simulé n'est pas décompté : le catalogue est celui,
//  figé, exporté du web.
// ─────────────────────────────────────────────

const _confirmDelay = Duration(hours: 48);
const _returnWindow = Duration(days: 7);
const _pickupDelay = Duration(days: 7);
const _paymentDelay = Duration(minutes: 30);

extension _Orders on MockApiClient {
  List<J> get _parts => _db.list('shopOrders');

  String _code() => List.generate(6, (_) => Random.secure().nextInt(10)).join();

  /// Statut de la commande déduit de ses sous-commandes (orderStatusFrom du back).
  String _orderStatusFrom(List<String> statuses) {
    const negative = ['cancelled', 'refused', 'expired', 'failed', 'returned'];
    if (statuses.isEmpty) return 'in_progress';
    if (statuses.any((s) => s != 'completed' && !negative.contains(s))) return 'in_progress';
    if (statuses.every((s) => s == 'completed')) return 'completed';
    if (statuses.every(negative.contains)) return 'cancelled';
    return 'partially_completed';
  }

  void _syncOrder(J order) {
    if (order['status'] == 'payment_failed' || order['status'] == 'awaiting_payment') return;
    final next = _orderStatusFrom(_parts.where((p) => p['orderId'] == order['id']).map((p) => p['status'] as String).toList());
    if (order['status'] != next) {
      order['status'] = next;
      (order['statusHistory'] as List).add({'status': next, 'changedAt': _now()});
      order['updatedAt'] = _now();
    }
  }

  void _step(J part, String status, String actor, {String? reason, String? reasonLabel, String? note, DateTime? at}) {
    part['status'] = status;
    final stamp = (at ?? DateTime.now()).toUtc().toIso8601String();
    (part['statusHistory'] as List).add({'status': status, 'changedAt': stamp, 'actor': actor, 'reason': ?reason, 'reasonLabel': ?reasonLabel, 'note': ?note});
    part['updatedAt'] = stamp;
    final deadline = switch (status) {
      'pending' => _confirmDelay,
      'ready_for_pickup' => _pickupDelay,
      'delivered' => _returnWindow,
      'return_requested' => const Duration(hours: 48),
      _ => null,
    };
    part['deadlineAt'] = deadline == null ? null : (at ?? DateTime.now()).add(deadline).toUtc().toIso8601String();
  }

  /// Le planificateur, à la lecture : échéances dépassées, paiements expirés.
  void _sweepDeadlines() {
    final now = DateTime.now();
    for (final order in _db.list('orders')) {
      final expires = DateTime.tryParse(order['paymentExpiresAt'] as String? ?? '');
      if (order['status'] == 'awaiting_payment' && expires != null && expires.isBefore(now)) _failPayment(order, 'Paiement non confirmé sous 30 minutes');
    }
    for (final part in _parts) {
      final deadline = DateTime.tryParse(part['deadlineAt'] as String? ?? '');
      if (deadline == null || deadline.isAfter(now)) continue;
      switch (part['status']) {
        case 'pending':
          _step(part, 'expired', 'system', note: 'La boutique n’a pas confirmé sous 48 heures.');
        case 'ready_for_pickup':
          _step(part, 'expired', 'system', note: 'Commande non retirée sous 7 jours.');
        case 'delivered':
          _step(part, 'completed', 'system');
        default:
          continue;
      }
      final order = _db.list('orders').where((o) => o['id'] == part['orderId']).firstOrNull;
      if (order != null) _syncOrder(order);
    }
  }

  // ── Lecture ───────────────────────────────────
  static const _clientActions = {
    'pending': ['cancel'],
    'confirmed': ['cancel'],
    'delivered': ['return'],
  };

  J _partDto(J part, DateTime now) {
    final deadline = DateTime.tryParse(part['deadlineAt'] as String? ?? '');
    final actions = [
      for (final a in _clientActions[part['status']] ?? const <String>[])
        if (a != 'return' || deadline == null || deadline.isAfter(now)) a,
    ];
    final items = (part['items'] as List).cast<Map<String, dynamic>>().map((item) {
      final pb = _seed.offers.where((o) => o['id'] == item['productBoutiqueId']).firstOrNull;
      final price = (item['price'] as num).toDouble();
      final qty = item['quantity'] as int;
      return {
        'productBoutiqueId': item['productBoutiqueId'],
        'productId': pb?['productId'],
        'productName': (pb?['product'] as Map?)?['name'],
        'urlImages': pb?['urlImages'] ?? <String>[],
        'price': price,
        'quantity': qty,
        'lineTotal': price * qty,
      };
    }).toList();
    return {
      ...part,
      'boutique': {'id': part['boutiqueId'], 'nom': part['boutiqueNom']},
      'items': items,
      'totalItems': items.fold<int>(0, (t, i) => t + (i['quantity'] as int)),
      'availableActions': actions,
    };
  }

  /// Enrichissement façon `buildOrderDto` : offre, boutique et produit imbriqués, sous-commandes jointes.
  J _orderDto(J order) {
    final now = DateTime.now();
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
    final parts = _parts.where((p) => p['orderId'] == order['id']).toList()..sort((a, b) => (a['reference'] as String).compareTo(b['reference'] as String));
    return {...order, 'items': items, 'totalItems': items.fold<int>(0, (t, i) => t + (i['quantity'] as int)), 'parts': parts.map((p) => _partDto(p, now)).toList()};
  }

  ApiResponse _listOrders(Map<String, String> q) {
    _requireSelf(q['userId'] ?? '');
    _sweepDeadlines();
    final all = _db.list('orders').where((o) => o['userId'] == q['userId'] && (q['status'] == null || o['status'] == q['status'])).toList()..sort(_byNewest);
    return _ok(_paginate(all.map(_orderDto).toList(), q, itemsKey: 'orders'), 'Commandes récupérées avec succès');
  }

  ApiResponse _getOrder(String id) {
    final user = _sessionUser();
    _sweepDeadlines();
    final order = _db.list('orders').firstWhere((o) => o['id'] == id, orElse: () => _fail('Commande non trouvée', 404));
    if (order['userId'] != user['_id'] && user['role'] != 'admin') _fail('Vous ne pouvez consulter que vos propres commandes.', 403);
    return _ok(_orderDto(order), 'Commande récupérée avec succès');
  }

  // ── Checkout ──────────────────────────────────
  /// POST /orders/:userId — même enchaînement que createOrder du back :
  /// prix frais (409 sur une hausse), livraisons, adresse, code, sous-commandes.
  ApiResponse _createOrder(String userId, J body) {
    final user = _sessionUser();
    if (user['_id'] != userId) _fail("Vous ne pouvez accéder qu'à vos propres données.", 403);
    final method = body['paymentMethod'] as String? ?? 'on_delivery';
    if (method != 'on_delivery' && method != 'online') _fail('Mode de paiement invalide. Valeurs acceptées : on_delivery, online.', 422);
    final telephone = (body['telephone'] as String?)?.trim();
    if (telephone != null && (telephone.length < 9 || telephone.length > 12)) _fail('Entre 9 et 12 caractères.', 422);
    final code = (body['code'] as String?)?.trim().toUpperCase();
    final online = method == 'online';

    final cart = _cartOf(userId);
    final cartItems = _cartItems(cart);
    if (cartItems.isEmpty) _fail('Le panier est vide.', 400);
    final lines = [
      for (final item in cartItems)
        (item: item, offer: _offers.where((o) => o['id'] == item['productBoutiqueId']).firstOrNull ?? _fail('Un produit du panier n’est plus disponible (${item['productBoutiqueId']}).', 400)),
    ];

    // Prix du moment : une hausse depuis l'ajout se signale (409), une baisse s'applique.
    final now = DateTime.now();
    final flashUsed = <String, int>{};
    final priced = [for (final l in lines) _priceLine(l.offer, l.item['quantity'] as int, flashUsed, now)];
    final raised = [
      for (var i = 0; i < lines.length; i++)
        if (priced[i].unitPrice > (lines[i].item['price'] as num)) lines[i],
    ];
    if (raised.isNotEmpty) {
      for (var i = 0; i < lines.length; i++) {
        lines[i].item['price'] = priced[i].unitPrice;
      }
      _touch(cart);
      final names = raised.map((l) => '« ${(l.offer['product'] as Map?)?['name'] ?? 'un article'} »').join(', ');
      _fail('Le prix de $names a changé : vérifiez votre panier.', 409);
    }

    final quote = _quote(userId, body);
    final groups = (quote['groups'] as List).cast<Map<String, dynamic>>();
    if (quote['ready'] != true) _fail((groups.where((g) => g['error'] != null).firstOrNull?['error'] as String?) ?? 'Aucune livraison possible pour ce panier.', 400);
    final deliveries = [
      for (final g in groups)
        {'boutiqueId': g['boutiqueId'], 'boutiqueNom': g['boutiqueNom'], 'method': g['selectedMethod'], 'fee': g['fee'], if (g['selectedMethod'] == 'pickup') 'pickupAdresse': g['pickupAdresse']},
    ];
    final homeDelivery = deliveries.any((d) => d['method'] != 'pickup');

    J? shippingAddress;
    String? addressId;
    final requestedAddress = body['addressId'] as String?;
    if (requestedAddress != null && requestedAddress.isNotEmpty) {
      final address = _db.list('addresses').where((a) => a['id'] == requestedAddress && a['deletedAt'] == null).firstOrNull;
      if (address == null) _fail('Adresse de livraison introuvable', 404);
      if (address['userId'] != userId) _fail('Cette adresse ne vous appartient pas.', 403);
      addressId = address['id'] as String;
      shippingAddress = {
        for (final k in ['destinataire', 'telephone', 'adresse', 'ville', 'commune', 'pays']) k: address[k],
      };
    } else if (homeDelivery) {
      _fail('Une adresse de livraison est requise (addressId ou adresse).', 400);
    }

    for (final l in lines) {
      if ((l.offer['stock'] as num) < (l.item['quantity'] as num)) _fail('Stock insuffisant pour un produit (disponible : ${l.offer['stock']}).', 400);
    }

    final items = [
      for (var i = 0; i < lines.length; i++)
        {
          'productBoutiqueId': lines[i].item['productBoutiqueId'],
          'boutiqueId': (lines[i].offer['boutique'] as Map)['id'],
          'price': priced[i].unitPrice,
          'quantity': lines[i].item['quantity'],
          'basePrice': priced[i].basePrice,
          'promotionId': priced[i].promotionId,
          'promotionLabel': ?priced[i].promotionLabel,
          'boostId': _attributedBoost(userId, lines[i].offer['id'] as String),
        },
    ];
    final subtotal = items.fold<double>(0, (s, i) => s + (i['price'] as num) * (i['quantity'] as num));

    // Code : de la plateforme (réparti au prorata, payé par elle) ou d'une boutique (sur sa part seule).
    var discount = 0.0;
    String? couponShop;
    if (code != null && code.isNotEmpty) {
      final promo = _promotions.where((p) => p['code'] == code).firstOrNull;
      if (promo == null) _fail('Coupon introuvable', 404);
      final result = _evaluateCoupon(promo, [
        for (var i = 0; i < items.length; i++)
          (
            offerId: items[i]['productBoutiqueId'] as String,
            boutiqueId: items[i]['boutiqueId'] as String,
            price: (items[i]['price'] as num).toDouble(),
            quantity: items[i]['quantity'] as int,
            promoted: priced[i].promoted,
          ),
      ], now);
      if (result.error != null) _fail(result.error!, 400);
      final limit = promo['perCustomerLimit'] as int?;
      if (limit != null && _usedCode(userId, code) >= limit) _fail(limit == 1 ? 'Vous avez déjà utilisé ce code.' : 'Ce code s’utilise $limit fois par client.', 400);
      discount = result.discount;
      couponShop = result.boutiqueId;
      final used = _counter('usedCount');
      used[promo['id'] as String] = ((used[promo['id']] as num?) ?? 0) + 1;
    }

    // Ventes flash : la quantité vendue au prix flash est décomptée.
    final sold = _counter('flashSold');
    for (var i = 0; i < lines.length; i++) {
      final id = priced[i].flashId;
      if (id != null) sold[id] = ((sold[id] as num?) ?? 0) + (lines[i].item['quantity'] as num);
    }

    final stamp = _now();
    final status = online ? 'awaiting_payment' : 'in_progress';
    final shipping = (quote['shippingFee'] as num).toDouble();
    final orderId = objectId();
    final reference = 'CMD-${now.millisecondsSinceEpoch}-${Random().nextInt(999999)}';
    final methods = deliveries.map((d) => d['method']).toSet();
    final order = <String, dynamic>{
      'id': orderId,
      'userId': userId,
      'reference': reference,
      'items': items,
      'subtotal': subtotal,
      'discountAmount': discount,
      'promotionCode': code != null && code.isNotEmpty ? code : null,
      'shippingFee': shipping,
      'amount': (subtotal - discount).clamp(0, double.infinity) + shipping,
      'status': status,
      'statusHistory': [
        {'status': status, 'changedAt': stamp, 'note': 'Commande créée'},
      ],
      'paymentMethod': method,
      'paymentStatus': online ? 'pending' : 'on_delivery',
      'paidAt': null,
      'paymentExpiresAt': online ? now.add(_paymentDelay).toUtc().toIso8601String() : null,
      'deliveryMethod': methods.length == 1 ? methods.first : 'mixed',
      'deliveries': deliveries,
      'addressId': addressId,
      'shippingAddress': ?shippingAddress,
      'telephone': telephone ?? shippingAddress?['telephone'] ?? user['telephone'],
      'createdAt': stamp,
      'updatedAt': stamp,
    };

    // Sous-commandes : une par boutique. Un code de boutique pèse sur sa part seule.
    final subtotals = [for (final d in deliveries) items.where((i) => i['boutiqueId'] == d['boutiqueId']).fold<double>(0, (s, i) => s + (i['price'] as num) * (i['quantity'] as num))];
    final shares = couponShop != null ? [for (final d in deliveries) d['boutiqueId'] == couponShop ? discount : 0.0] : _allocate(subtotals, discount);
    for (var i = 0; i < deliveries.length; i++) {
      final d = deliveries[i];
      final part = <String, dynamic>{
        'id': objectId(),
        'orderId': orderId,
        'userId': userId,
        'boutiqueId': d['boutiqueId'],
        'boutiqueNom': d['boutiqueNom'],
        'reference': '$reference-${i + 1}',
        'items': items.where((it) => it['boutiqueId'] == d['boutiqueId']).toList(),
        'subtotal': subtotals[i],
        'discountAmount': shares[i],
        'platformDiscount': couponShop != null ? 0 : shares[i],
        'deliveryFee': d['fee'],
        'amount': (subtotals[i] - shares[i]).clamp(0, double.infinity) + ((d['fee'] as num?) ?? 0),
        'delivery': d,
        if (shippingAddress != null && d['method'] != 'pickup') 'shippingAddress': shippingAddress,
        'payment': {'method': method, 'status': 'unpaid', 'paidAt': null, 'refundedAmount': 0, 'refundedAt': null},
        'status': status == 'awaiting_payment' ? 'awaiting_payment' : 'pending',
        'statusHistory': <Map<String, dynamic>>[],
        'pickupCode': _code(),
        'deliveryAttempts': 0,
        'return': null,
        'deadlineAt': null,
        'createdAt': stamp,
        'updatedAt': stamp,
      };
      _step(part, part['status'] as String, 'client', note: 'Commande passée');
      _parts.add(part);
    }
    _db.list('orders').add(order);
    cart['items'] = <Map<String, dynamic>>[];
    _touch(cart);

    if (online) {
      return _ok(
        {
          ..._orderDto(order),
          'payment': {'redirectUrl': '${Env.webUrl}/paiement/$orderId'},
        },
        'Commande créée : il reste à la payer.',
        201,
      );
    }
    return _ok(_orderDto(order), 'Commande créée avec succès', 201);
  }

  /// Répartition au prorata des sous-totaux, au franc près (allocateDiscount du back).
  List<double> _allocate(List<double> subtotals, double discount) {
    final total = subtotals.fold<double>(0, (s, v) => s + v);
    if (discount <= 0 || total <= 0) return [for (final _ in subtotals) 0.0];
    final shares = [for (final s in subtotals) (discount * s / total).floorToDouble()];
    var rest = discount - shares.fold<double>(0, (s, v) => s + v);
    for (var i = 0; rest > 0 && i < shares.length; i++, rest--) {
      shares[i] += 1;
    }
    return shares;
  }

  // ── Paiement en ligne (prestataire simulé) ────
  J _ownOnlineOrder(String orderId) {
    final user = _sessionUser();
    final order = _db.list('orders').firstWhere((o) => o['id'] == orderId, orElse: () => _fail('Commande introuvable.', 404));
    if (user['role'] != 'admin' && order['userId'] != user['_id']) _fail('Vous ne pouvez payer que vos propres commandes.', 403);
    if (order['paymentMethod'] != 'online') _fail('Cette commande se paie à la livraison ou au retrait.', 400);
    return order;
  }

  J _paymentSummary(J order) => {'orderId': order['id'], 'status': order['status'], 'paymentStatus': order['paymentStatus'], 'paymentExpiresAt': order['paymentExpiresAt']};

  ApiResponse _restartPayment(String orderId) {
    _sweepDeadlines();
    final order = _ownOnlineOrder(orderId);
    if (order['status'] != 'awaiting_payment' || order['paymentStatus'] != 'pending') _fail("Cette commande n'attend plus de paiement.", 409);
    return _ok({..._paymentSummary(order), 'redirectUrl': '${Env.webUrl}/paiement/$orderId'}, 'Paiement relancé.');
  }

  void _failPayment(J order, String note) {
    for (final part in _parts.where((p) => p['orderId'] == order['id'] && p['status'] == 'awaiting_payment')) {
      (part['payment'] as Map)['status'] = 'void';
      _step(part, 'cancelled', 'system', note: note);
      _releaseFlash(part);
    }
    order['paymentStatus'] = 'failed';
    order['paymentExpiresAt'] = null;
    order['status'] = 'payment_failed';
    (order['statusHistory'] as List).add({'status': 'payment_failed', 'changedAt': _now(), 'note': note});
    _releaseCoupon(order);
    // Le panier revient au client, comme restoreCartAfterFailedPayment.
    final cart = _cartOf(order['userId'] as String);
    for (final item in (order['items'] as List).cast<Map>()) {
      final existing = _cartItems(cart).where((i) => i['productBoutiqueId'] == item['productBoutiqueId']).firstOrNull;
      if (existing == null) _cartItems(cart).add({'productBoutiqueId': item['productBoutiqueId'], 'quantity': item['quantity'], 'price': item['price']});
    }
    _touch(cart);
  }

  ApiResponse _settleSandboxPayment(String orderId, J body) {
    final outcome = body['outcome'];
    if (outcome != 'paid' && outcome != 'failed') _fail('Issue invalide. Valeurs acceptées : paid, failed.', 422);
    _sweepDeadlines();
    final order = _ownOnlineOrder(orderId);
    if (outcome == 'paid') {
      if (order['paymentStatus'] == 'failed') _fail('Le délai de paiement était dépassé : la commande est annulée et votre paiement remboursé.', 409);
      if (order['paymentStatus'] != 'paid') {
        for (final part in _parts.where((p) => p['orderId'] == order['id'] && p['status'] == 'awaiting_payment')) {
          (part['payment'] as Map)
            ..['status'] = 'paid'
            ..['paidAt'] = _now();
          _step(part, 'pending', 'system', note: 'Paiement confirmé');
        }
        order['paymentStatus'] = 'paid';
        order['paidAt'] = _now();
        order['paymentExpiresAt'] = null;
        order['status'] = 'in_progress';
        (order['statusHistory'] as List).add({'status': 'in_progress', 'changedAt': _now(), 'note': 'Paiement confirmé'});
      }
      return _ok(_paymentSummary(order), 'Paiement confirmé.');
    }
    if (order['paymentStatus'] == 'pending') _failPayment(order, 'Paiement refusé');
    return _ok(_paymentSummary(order), 'Paiement refusé : votre panier a été restauré.');
  }

  /// Unités d'une vente flash rendues quand la partie ne sera pas livrée.
  void _releaseFlash(J part) {
    final sold = _counter('flashSold');
    for (final item in (part['items'] as List).cast<Map>()) {
      final id = item['promotionId'] as String?;
      if (id == null || sold[id] == null) continue;
      sold[id] = (((sold[id] as num) - (item['quantity'] as num)).clamp(0, 1 << 30));
    }
  }

  void _releaseCoupon(J order) {
    final code = order['promotionCode'] as String?;
    if (code == null) return;
    final promo = _promotions.where((p) => p['code'] == code).firstOrNull;
    if (promo == null) return;
    final used = _counter('usedCount');
    final current = (used[promo['id']] as num?) ?? 0;
    if (current > 0) used[promo['id'] as String] = current - 1;
  }

  // ── Actions du client sur une sous-commande ───
  ApiResponse _partAction(String partId, String action, J body) {
    final user = _sessionUser();
    _sweepDeadlines();
    final part = _parts.firstWhere((p) => p['id'] == partId, orElse: () => _fail('Sous-commande introuvable.', 404));
    if (part['userId'] != user['_id']) _fail('Vous ne pouvez pas effectuer cette action sur cette commande.', 403);
    final reason = (body['reason'] as String?)?.trim();
    final note = (body['note'] as String?)?.trim();
    final status = part['status'] as String;
    String label(String s) => ShopOrderStatus.parse(s).label.toLowerCase();

    switch (action) {
      case 'cancel':
        if (status != 'pending' && status != 'confirmed') _fail('Action impossible : la commande est ${label(status)}.', 400);
        if (reason != null && reason.isNotEmpty && !cancellationReasons.containsKey(reason)) _fail('Motif invalide. Valeurs acceptées : ${cancellationReasons.keys.join(', ')}.', 400);
        if (reason == 'other' && (note == null || note.isEmpty)) _fail('Précisez le motif « Autre ».', 400);
        final payment = part['payment'] as Map;
        if (payment['status'] == 'paid') {
          payment
            ..['status'] = 'refunded'
            ..['refundedAmount'] = part['amount']
            ..['refundedAt'] = _now();
        } else {
          payment['status'] = 'void';
        }
        _step(part, 'cancelled', 'client', reason: reason, reasonLabel: reason == null ? null : cancellationReasons[reason], note: note);
        _releaseFlash(part);
      case 'return':
        if (status != 'delivered') _fail('Action impossible : la commande est ${label(status)}.', 400);
        if (reason == null || reason.isEmpty) _fail('Le motif est requis.', 400);
        if (!returnReasons.containsKey(reason)) _fail('Motif invalide. Valeurs acceptées : ${returnReasons.keys.join(', ')}.', 400);
        final deadline = DateTime.tryParse(part['deadlineAt'] as String? ?? '');
        if (deadline != null && !deadline.isAfter(DateTime.now())) _fail('Le délai de retour est dépassé.', 400);
        if (returnReasonsNeedingPhoto.contains(reason)) _fail('Joignez au moins une photo du produit abîmé.', 400);
        part['return'] = {
          'reason': reason,
          'reasonLabel': returnReasons[reason],
          'details': note,
          'photos': <String>[],
          'requestedAt': _now(),
          'shopResponse': null,
          'respondedAt': null,
          'resolvedAt': null,
        };
        _step(part, 'return_requested', 'client', reason: reason, reasonLabel: returnReasons[reason], note: note);
        _openReturnTicket(part, user, reason, note);
      default:
        _fail('Vous ne pouvez pas effectuer cette action sur cette commande.', 403);
    }
    final order = _db.list('orders').firstWhere((o) => o['id'] == part['orderId']);
    _syncOrder(order);
    return _ok(_partDto(part, DateTime.now()), action == 'cancel' ? 'Commande annulée.' : 'Retour demandé : la boutique a 48 heures pour répondre.');
  }

  // ── Migration des commandes d'avant les sous-commandes ──
  /// Chaque commande sans sous-commande en reçoit une par boutique
  /// (npm run migrate:shop-orders côté back). Livrée devient terminée.
  void _migrateLegacyOrders() {
    for (final order in _db.list('orders')) {
      if (_parts.any((p) => p['orderId'] == order['id'])) continue;
      final legacy = order['status'] as String? ?? 'pending';
      final byShop = <String, List<Map<String, dynamic>>>{};
      for (final item in (order['items'] as List).cast<Map<String, dynamic>>()) {
        final offer = _seed.offers.where((o) => o['id'] == item['productBoutiqueId']).firstOrNull;
        final shop = (offer?['boutique'] as Map?)?['id'] as String? ?? '';
        byShop.putIfAbsent(shop, () => []).add({...item, 'boutiqueId': shop});
      }
      final method = switch (order['deliveryMethod']) {
        'pickup' => 'pickup',
        'free' => 'free',
        _ => 'flat_rate',
      };
      final shops = byShop.keys.toList();
      final fee = ((order['shippingFee'] as num?) ?? 0) / (shops.isEmpty ? 1 : shops.length);
      final created = DateTime.parse(order['createdAt'] as String);
      final deliveries = <Map<String, dynamic>>[];
      for (var i = 0; i < shops.length; i++) {
        final shop = _seed.shops.where((s) => s['id'] == shops[i]).firstOrNull;
        final items = byShop[shops[i]]!;
        final subtotal = items.fold<double>(0, (s, it) => s + (it['price'] as num) * (it['quantity'] as num));
        final delivery = {'boutiqueId': shops[i], 'boutiqueNom': shop?['nom'], 'method': method, 'fee': method == 'pickup' ? 0 : fee, if (method == 'pickup') 'pickupAdresse': shop?['adresse']};
        deliveries.add(delivery);
        final part = <String, dynamic>{
          'id': objectId(),
          'orderId': order['id'],
          'userId': order['userId'],
          'boutiqueId': shops[i],
          'boutiqueNom': shop?['nom'],
          'reference': '${order['reference']}-${i + 1}',
          'items': items,
          'subtotal': subtotal,
          'discountAmount': 0,
          'deliveryFee': delivery['fee'],
          'amount': subtotal + (delivery['fee'] as num),
          'delivery': delivery,
          'shippingAddress': ?order['shippingAddress'],
          'payment': {'method': 'on_delivery', 'status': legacy == 'delivered' ? 'paid' : 'unpaid', 'paidAt': null, 'refundedAmount': 0, 'refundedAt': null},
          'status': 'pending',
          'statusHistory': <Map<String, dynamic>>[],
          'pickupCode': _code(),
          'deliveryAttempts': 0,
          'return': null,
          'deadlineAt': null,
          'createdAt': order['createdAt'],
          'updatedAt': order['updatedAt'],
        };
        _step(part, 'pending', 'client', note: 'Commande passée', at: created);
        switch (legacy) {
          case 'confirmed':
            _step(part, 'confirmed', 'shop', at: created.add(const Duration(hours: 2)));
          case 'shipped':
            _step(part, 'confirmed', 'shop', at: created.add(const Duration(hours: 2)));
            _step(part, 'shipped', 'shop', at: created.add(const Duration(days: 1)));
          case 'delivered':
            _step(part, 'confirmed', 'shop', at: created.add(const Duration(hours: 2)));
            _step(part, 'shipped', 'shop', at: created.add(const Duration(days: 1)));
            _step(part, 'delivered', 'shop', at: created.add(const Duration(days: 2)));
            _step(part, 'completed', 'system', at: created.add(const Duration(days: 9)));
          case 'cancelled':
            _step(part, 'cancelled', 'client', at: created.add(const Duration(hours: 3)));
        }
        _parts.add(part);
      }
      order
        ..['deliveries'] = deliveries
        ..['paymentMethod'] = order['paymentMethod'] ?? 'on_delivery'
        ..['paymentStatus'] = order['paymentStatus'] ?? 'on_delivery'
        ..['paidAt'] = order['paidAt']
        ..['paymentExpiresAt'] = order['paymentExpiresAt'];
      order['status'] = _orderStatusFrom(_parts.where((p) => p['orderId'] == order['id']).map((p) => p['status'] as String).toList());
    }
  }

  /// Jeu neuf : des sous-commandes à chaque étape, pour éprouver l'écran.
  void _stageDemoOrders() {
    final orders = _db.list('orders')..sort(_byNewest);
    if (orders.length < 3) return;
    final now = DateTime.now();
    J partOf(J order) => _parts.firstWhere((p) => p['orderId'] == order['id']);
    // La plus récente expédiée devient livrée hier : un retour est possible.
    final delivered = partOf(orders[1]);
    if (delivered['status'] == 'shipped') _step(delivered, 'delivered', 'shop', at: now.subtract(const Duration(days: 1)));
    // Le retrait en boutique est prêt : le code de remise s'affiche.
    final pickup = partOf(orders[2]);
    if (pickup['status'] == 'confirmed') _step(pickup, 'ready_for_pickup', 'shop', at: now.subtract(const Duration(hours: 3)));
    // La commande en attente reste à confirmer, encore 40 heures.
    final pending = partOf(orders[0]);
    if (pending['status'] == 'pending') pending['deadlineAt'] = now.add(const Duration(hours: 40)).toUtc().toIso8601String();
    for (final order in orders) {
      order['status'] = _orderStatusFrom(_parts.where((p) => p['orderId'] == order['id']).map((p) => p['status'] as String).toList());
    }
  }
}
