part of 'mock_api_client.dart';

// ─────────────────────────────────────────────
//  Promotions simulées — portage de Front/front_web/src/shared/api/mock/
//  marketing*.ts, lui-même portage du moteur de prix du back
//  (Back/src/shared/services/pricing.service.ts).
//
//  Les promotions sont construites au lancement, avec des dates relatives
//  à ce moment : la démonstration reste toujours « en cours ». Seuls les
//  compteurs (unités flash vendues, codes utilisés, statistiques des
//  boosts) sont gardés dans la base de l'appareil.
// ─────────────────────────────────────────────

const _priceTypes = {'product_discount', 'shop_discount', 'flash_sale'};

/// Places sponsorisées par page, comme SLOT_PLACES du back.
const _slotPlaces = {'home': 4, 'search': 2, 'category': 2, 'similar': 2, 'promotions': 4};
const _frequencyCap = 3;

extension _Marketing on MockApiClient {
  // ── Jeu de promotions ─────────────────────────
  List<J> _buildPromotions(DateTime now) {
    String iso(Duration d) => now.add(d).toUtc().toIso8601String();
    J promo(
      String id, {
      String? boutiqueId,
      required String type,
      required String nom,
      String scope = 'product_boutique',
      String discountType = 'percentage',
      num discountValue = 0,
      List<String> offers = const [],
      String? code,
      num minAmount = 0,
      num? maxDiscount,
      int? perCustomerLimit,
      bool stackable = true,
      List<J> tiers = const [],
      int? flashQuantity,
      String? campaignId,
      Duration start = const Duration(days: -2),
      Duration end = const Duration(days: 19),
      String? description,
    }) => {
      'id': id,
      'boutiqueId': boutiqueId,
      'type': type,
      'nom': nom,
      'description': description,
      'scope': scope,
      'discountType': discountType,
      'discountValue': discountValue,
      'productBoutiqueIds': offers,
      'code': code,
      'minAmount': minAmount,
      'maxDiscount': maxDiscount,
      'perCustomerLimit': perCustomerLimit,
      'stackable': stackable,
      'tiers': tiers,
      'flashQuantity': flashQuantity,
      'campaignId': campaignId,
      'startDate': iso(start),
      'endDate': iso(end),
    };

    String shopId(String nom) => (_seed.shops.firstWhere((s) => s['nom'] == nom, orElse: () => {'id': ''}))['id'] as String;
    final matam = shopId('Dépôt Matam');
    final kaloum = shopId('Kaloum Céramique');
    final volta = shopId('Volta Électrique');

    return [
      // Vente flash et codes de la plateforme.
      for (final p in _seed.promotions)
        if (p['type'] == 'flash_sale')
          {
            ...promo(
              p['id'] as String,
              type: 'flash_sale',
              nom: p['nom'] as String,
              discountValue: p['discountValue'] as num,
              offers: (p['productBoutiqueIds'] as List).cast<String>(),
              description: p['description'] as String?,
            ),
            'startDate': p['startDate'],
            'endDate': p['endDate'],
          },
      promo(
        'promo-bienvenue',
        type: 'coupon',
        scope: 'cart',
        nom: 'Bienvenue',
        description: '10 % sur votre première commande.',
        discountValue: 10,
        code: 'BIENVENUE10',
        minAmount: 200000,
        maxDiscount: 100000,
        perCustomerLimit: 1,
        start: const Duration(days: -30),
        end: const Duration(days: 335),
      ),
      promo(
        'promo-chantier',
        type: 'coupon',
        scope: 'cart',
        nom: 'Remise chantier',
        description: "50 000 GNF dès 1 000 000 GNF d'achat.",
        discountType: 'fixed',
        discountValue: 50000,
        code: 'CHANTIER50',
        minAmount: 1000000,
        end: const Duration(days: 28),
      ),
      // Remises du catalogue : celles de Dépôt Matam inscrites à la campagne.
      for (final o in _seed.offers)
        if (o['discountPrice'] != null && (o['boutique'] as Map?) != null)
          () {
            final price = (o['price'] as num).toDouble();
            final percent = ((price - (o['discountPrice'] as num)) / price * 100).round();
            final shop = (o['boutique'] as Map)['id'] as String;
            final inCampaign = shop == matam && percent >= 10;
            return promo(
              'promo-${o['id']}',
              boutiqueId: shop,
              type: 'product_discount',
              nom: inCampaign ? 'Rentrée chantier — −$percent %' : 'Remise de $percent %',
              discountValue: percent,
              offers: [o['id'] as String],
              campaignId: inCampaign ? 'camp-rentree-chantier' : null,
              end: inCampaign ? const Duration(days: 12) : const Duration(days: 19),
            );
          }(),
      promo(
        'promo-paliers-ciment',
        boutiqueId: matam,
        type: 'quantity_tiers',
        nom: 'Ciment en gros',
        offers: const ['off-ciment-cem2'],
        tiers: const [
          {'minQuantity': 50, 'discountValue': 5},
          {'minQuantity': 200, 'discountValue': 8},
        ],
        start: const Duration(days: -3),
        end: const Duration(days: 3650),
      ),
      promo('promo-livraison-kaloum', boutiqueId: kaloum, type: 'free_shipping', scope: 'cart', nom: 'Livraison offerte dès 1 000 000 GNF', minAmount: 1000000, end: const Duration(days: 28)),
      promo(
        'promo-volta10',
        boutiqueId: volta,
        type: 'coupon',
        scope: 'cart',
        nom: 'Volta : 10 % dès 500 000 GNF',
        discountValue: 10,
        code: 'VOLTA10',
        minAmount: 500000,
        perCustomerLimit: 1,
        start: const Duration(days: -1),
        end: const Duration(days: 60),
      ),
    ];
  }

  List<J> _buildCampaigns(DateTime now) => [
    {
      'id': 'camp-rentree-chantier',
      'slug': 'rentree-chantier',
      'nom': 'Rentrée chantier',
      'description': 'Les dépôts baissent leurs prix pour la reprise des chantiers.',
      'startDate': now.subtract(const Duration(days: 2)).toUtc().toIso8601String(),
      'endDate': now.add(const Duration(days: 12)).toUtc().toIso8601String(),
      'minDiscount': 10,
      'familleIds': <String>[],
      'actif': true,
    },
  ];

  /// Deux boosts en cours : un produit Volta (accueil, recherche, rubriques)
  /// et une promotion Kaloum (page Promotions).
  List<J> _buildBoosts(DateTime now) {
    String shopOf(String offerId) =>
        ((_seed.offers.firstWhere(
                  (o) => o['id'] == offerId,
                  orElse: () => {
                    'boutique': {'id': ''},
                  },
                )['boutique']
                as Map?)?['id']
            as String?) ??
        '';
    J boost(String id, String kind, String offerId, {String? promotionId}) => {
      'id': id,
      'boutiqueId': shopOf(offerId),
      'kind': kind,
      'promotionId': promotionId,
      'productBoutiqueIds': [offerId],
      'goal': 'visits',
      'dailyBudget': 15000,
      'reserved': 105000,
      'costPerVisit': 500,
      'costPerThousandViews': 5000,
      'startDate': now.subtract(const Duration(days: 2)).toUtc().toIso8601String(),
      'endDate': now.add(const Duration(days: 5)).toUtc().toIso8601String(),
    };
    return [boost('boost-volta-tableau', 'product', 'off-tableau-12'), boost('boost-kaloum-carrelage', 'promotion', 'off-carrelage-60', promotionId: 'promo-off-carrelage-60')];
  }

  /// Compteurs persistés (unités flash vendues, codes utilisés, statistiques).
  J get _counters {
    final value = _db.data['marketing'];
    if (value is Map<String, dynamic>) return value;
    final fresh = <String, dynamic>{
      'flashSold': <String, dynamic>{},
      'usedCount': <String, dynamic>{},
      'boostSpent': <String, dynamic>{},
      'exposures': <String, dynamic>{},
      'visits': <Map<String, dynamic>>[],
    };
    _db.data['marketing'] = fresh;
    return fresh;
  }

  Map<String, dynamic> _counter(String key) => ((_counters[key] ??= <String, dynamic>{}) as Map).cast<String, dynamic>();

  int _flashSold(String promoId) => ((_counter('flashSold')[promoId] as num?) ?? 0).toInt();

  // ── Règles ────────────────────────────────────
  bool _live(J promo, DateTime now) {
    final start = DateTime.parse(promo['startDate'] as String);
    final end = DateTime.parse(promo['endDate'] as String);
    if (now.isBefore(start) || now.isAfter(end)) return false;
    final quantity = promo['flashQuantity'] as num?;
    if (promo['type'] == 'flash_sale' && quantity != null && _flashSold(promo['id'] as String) >= quantity) return false;
    return true;
  }

  bool _targets(J promo, J offer) {
    final boutiqueId = promo['boutiqueId'] as String?;
    if (boutiqueId != null && boutiqueId != (offer['boutique'] as Map?)?['id']) return false;
    return (promo['productBoutiqueIds'] as List).contains(offer['id']);
  }

  double _discountedPrice(double base, String type, num value) => (type == 'fixed' ? base - value : base * (1 - value / 100)).roundToDouble().clamp(0, double.infinity);

  /// Le plus bas des remises en cours (jamais leur somme) ; prix barré = prix de
  /// référence (ici le prix courant : le mode simulé ne change pas de prix).
  ({double? best, J? promo, J? tiers, J pricing}) _computePricing(J offer, DateTime now, {Set<String> excluded = const {}}) {
    final price = (offer['price'] as num).toDouble();
    final applicable = _promotions.where((p) => _live(p, now) && !excluded.contains(p['id']) && _targets(p, offer)).toList();
    J? bestPromo;
    double? best;
    for (final p in applicable.where((p) => _priceTypes.contains(p['type']))) {
      final value = _discountedPrice(price, p['discountType'] as String, p['discountValue'] as num);
      if (value >= price) continue;
      if (best == null || value < best) {
        best = value;
        bestPromo = p;
      }
    }
    final tiersPromo = applicable.where((p) => p['type'] == 'quantity_tiers' && (p['tiers'] as List).isNotEmpty).firstOrNull;
    final unit = best ?? price;
    final reference = price;
    final percent = best == null || reference <= 0 ? 0 : ((reference - best) / reference * 100).floor();
    final shown = percent >= 5 && (offer['stock'] as num) > 0;
    final pricing = <String, dynamic>{
      'basePrice': price,
      'price': unit,
      if (shown) 'referencePrice': reference,
      if (shown) 'percent': percent,
      if (bestPromo != null) 'endsAt': bestPromo['endDate'],
      if (bestPromo != null)
        'promotion': {
          'id': bestPromo['id'],
          'type': bestPromo['type'],
          'label': bestPromo['nom'],
          'flash': bestPromo['type'] == 'flash_sale',
          if (bestPromo['campaignId'] != null) 'campaignId': bestPromo['campaignId'],
        },
      'tiers': [
        for (final t in ((tiersPromo?['tiers'] as List?) ?? const []).cast<Map>())
          {
            'minQuantity': t['minQuantity'],
            'percent': t['discountValue'],
            'unitPrice': [unit, _discountedPrice(price, 'percentage', t['discountValue'] as num)].reduce((a, b) => a < b ? a : b),
          },
      ],
    };
    return (best: best, promo: bestPromo, tiers: tiersPromo, pricing: pricing);
  }

  /// L'offre telle que le back la renvoie : prix du moment recopié, produit phare.
  J _withPricing(J offer, DateTime now) {
    final result = _computePricing(offer, now);
    final shopId = (offer['boutique'] as Map?)?['id'];
    final rank = (_featured[shopId] ?? const []).indexOf(offer['id'] as String);
    final copy = Map<String, dynamic>.of(offer)..remove('discountPrice');
    return {...copy, if (result.best != null) 'discountPrice': result.best, 'pricing': result.pricing, if (rank >= 0) 'featuredRank': rank + 1};
  }

  /// Prix d'une unité pour une quantité, palier compris.
  double _unitPrice(J pricedOffer, int quantity) {
    final pricing = pricedOffer['pricing'] as Map;
    var unit = (pricing['price'] as num).toDouble();
    for (final t in (pricing['tiers'] as List).cast<Map>()) {
      if (quantity >= (t['minQuantity'] as num) && (t['unitPrice'] as num) < unit) unit = (t['unitPrice'] as num).toDouble();
    }
    return unit;
  }

  /// Prix frais d'une ligne au checkout : une vente flash ne sert que tant que
  /// sa quantité suffit ; au-delà, la ligne retombe sur la meilleure autre remise.
  ({double unitPrice, double basePrice, String? promotionId, String? promotionLabel, String? flashId, bool promoted}) _priceLine(J offer, int quantity, Map<String, int> flashUsed, DateTime now) {
    final excluded = <String>{};
    var result = _computePricing(offer, now);
    while (result.promo?['type'] == 'flash_sale' && result.promo?['flashQuantity'] != null) {
      final id = result.promo!['id'] as String;
      final left = (result.promo!['flashQuantity'] as num) - _flashSold(id) - (flashUsed[id] ?? 0);
      if (left >= quantity) {
        flashUsed[id] = (flashUsed[id] ?? 0) + quantity;
        break;
      }
      excluded.add(id);
      result = _computePricing(offer, now, excluded: excluded);
    }
    final price = (offer['price'] as num).toDouble();
    final unit = _unitPrice({'pricing': result.pricing}, quantity);
    final byTier = result.tiers != null && unit < (result.best ?? price);
    final source = byTier ? result.tiers : result.promo;
    return (
      unitPrice: unit,
      basePrice: price,
      promotionId: source?['id'] as String?,
      promotionLabel: source?['nom'] as String?,
      flashId: !byTier && result.promo?['type'] == 'flash_sale' ? result.promo!['id'] as String : null,
      promoted: unit < price,
    );
  }

  /// Livraison offerte en cours, par boutique : le seuil le plus bas.
  Map<String, ({double minAmount, String label})> _freeShippingRules(Iterable<String> shopIds, DateTime now) {
    final rules = <String, ({double minAmount, String label})>{};
    for (final p in _promotions) {
      final shop = p['boutiqueId'] as String?;
      if (p['type'] != 'free_shipping' || shop == null || !shopIds.contains(shop) || !_live(p, now)) continue;
      final min = (p['minAmount'] as num).toDouble();
      if (rules[shop] == null || min < rules[shop]!.minAmount) rules[shop] = (minAmount: min, label: p['nom'] as String);
    }
    return rules;
  }

  /// Même calcul que evaluateCoupon du back, messages compris.
  ({double discount, String? boutiqueId, String? error}) _evaluateCoupon(J promo, List<({String offerId, String boutiqueId, double price, int quantity, bool promoted})> lines, DateTime now) {
    final boutiqueId = promo['boutiqueId'] as String?;
    if (promo['type'] != 'coupon' || !_live(promo, now)) return (discount: 0, boutiqueId: boutiqueId, error: "Ce coupon n'est pas valide (inactif, expiré ou épuisé).");
    var eligible = lines;
    if (boutiqueId != null) {
      eligible = lines.where((l) => l.boutiqueId == boutiqueId).toList();
      if (eligible.isEmpty) return (discount: 0, boutiqueId: boutiqueId, error: "Ce code ne vaut que chez la boutique qui l'a créé : ajoutez un de ses articles.");
      if (promo['stackable'] == false) eligible = eligible.where((l) => !l.promoted).toList();
    }
    final base = eligible.fold<double>(0, (s, l) => s + l.price * l.quantity);
    final threshold = boutiqueId != null ? base : lines.fold<double>(0, (s, l) => s + l.price * l.quantity);
    final min = (promo['minAmount'] as num?) ?? 0;
    if (min > 0 && threshold < min) return (discount: 0, boutiqueId: boutiqueId, error: 'Montant minimum non atteint pour ce coupon (requis : ${min.round()}).');
    var discount = promo['discountType'] == 'fixed' ? (promo['discountValue'] as num).toDouble() : base * (promo['discountValue'] as num) / 100;
    final cap = promo['maxDiscount'] as num?;
    if (cap != null && discount > cap) discount = cap.toDouble();
    discount = (discount > base ? base : discount).roundToDouble();
    if (discount <= 0) return (discount: 0, boutiqueId: boutiqueId, error: "Aucun article de la commande n'est éligible à ce coupon.");
    return (discount: discount, boutiqueId: boutiqueId, error: null);
  }

  /// Utilisations d'un code par un client (commandes annulées ou non payées exclues).
  int _usedCode(String userId, String code) =>
      _db.list('orders').where((o) => o['userId'] == userId && o['promotionCode'] == code && o['status'] != 'cancelled' && o['status'] != 'payment_failed').length;

  // ── Lectures publiques ────────────────────────
  ApiResponse _flashSales() {
    final now = DateTime.now();
    final shops = _seed.shops;
    final running = _promotions.where((p) => p['type'] == 'flash_sale' && _live(p, now)).toList()..sort((a, b) => (a['endDate'] as String).compareTo(b['endDate'] as String));
    return _ok(
      running.map((p) {
        final shop = shops.where((s) => s['id'] == p['boutiqueId']).firstOrNull;
        final quantity = p['flashQuantity'] as num?;
        return {
          ...p,
          'actif': true,
          'isActive': true,
          if (shop != null) 'boutique': {'id': shop['id'], 'nom': shop['nom']},
          if (quantity != null) 'flashLeft': (quantity - _flashSold(p['id'] as String)).clamp(0, quantity),
        };
      }).toList(),
      'Ventes flash actives récupérées avec succès',
    );
  }

  /// POST /promotions/apply : aperçu d'un code sur le panier, aux prix du moment.
  ApiResponse _applyCoupon(J body) {
    final user = _sessionUser();
    if (body['userId'] != user['_id']) _fail("Vous ne pouvez accéder qu'à vos propres données.", 403);
    final code = (body['code'] as String? ?? '').trim().toUpperCase();
    final promo = _promotions.where((p) => p['code'] == code).firstOrNull;
    if (promo == null) _fail('Coupon introuvable', 404);
    final cart = _cartOf(user['_id'] as String);
    final items = _cartItems(cart);
    if (items.isEmpty) _fail('Le panier est vide.', 400);
    final now = DateTime.now();
    final lines = [
      for (final item in items)
        if (_offers.where((o) => o['id'] == item['productBoutiqueId']).firstOrNull case final offer?)
          () {
            final unit = _unitPrice(offer, item['quantity'] as int);
            return (offerId: offer['id'] as String, boutiqueId: (offer['boutique'] as Map)['id'] as String, price: unit, quantity: item['quantity'] as int, promoted: unit < (offer['price'] as num));
          }(),
    ];
    final result = _evaluateCoupon(promo, lines, now);
    if (result.error != null) _fail(result.error!, 400);
    final limit = promo['perCustomerLimit'] as int?;
    if (limit != null && _usedCode(user['_id'] as String, code) >= limit) _fail(limit == 1 ? 'Vous avez déjà utilisé ce code.' : 'Ce code s’utilise $limit fois par client.', 400);
    final before = lines.fold<double>(0, (s, l) => s + l.price * l.quantity);
    final shop = _seed.shops.where((s) => s['id'] == result.boutiqueId).firstOrNull;
    return _ok({
      'promotion': {'id': promo['id'], 'nom': promo['nom'], 'code': promo['code'], 'type': promo['type']},
      'totalBefore': before,
      'discountAmount': result.discount,
      'totalAfter': (before - result.discount).clamp(0, double.infinity),
      if (shop != null) 'boutique': {'id': shop['id'], 'nom': shop['nom']},
    }, 'Coupon appliqué avec succès');
  }

  // ── Campagnes ─────────────────────────────────
  String _campaignState(J c, DateTime now) {
    if (c['actif'] != true || now.isAfter(DateTime.parse(c['endDate'] as String))) return 'ended';
    if (now.isBefore(DateTime.parse(c['startDate'] as String))) return 'upcoming';
    return 'running';
  }

  /// Offres inscrites : celles d'une remise de la campagne en cours, même
  /// quand une vente flash plus forte fixe leur prix du moment.
  Set<String> _campaignOfferIds(String campaignId, DateTime now) => {
    for (final p in _promotions)
      if (p['campaignId'] == campaignId && _live(p, now)) ...(p['productBoutiqueIds'] as List).cast<String>(),
  };

  J _campaignDto(J c, DateTime now) {
    final ids = _campaignOfferIds(c['id'] as String, now);
    return {...c, 'state': _campaignState(c, now), 'offerCount': _offers.where((o) => ids.contains(o['id'])).length};
  }

  ApiResponse _listCampaigns() {
    final now = DateTime.now();
    final open = _campaigns.where((c) => c['actif'] == true && !now.isAfter(DateTime.parse(c['endDate'] as String))).map((c) => _campaignDto(c, now)).toList();
    return _ok(open, 'Campagnes récupérées avec succès');
  }

  ApiResponse _getCampaign(String slug) {
    final now = DateTime.now();
    final c = _campaigns.firstWhere((c) => c['slug'] == slug || c['id'] == slug, orElse: () => _fail('Campagne introuvable.', 404));
    final ids = _campaignOfferIds(c['id'] as String, now);
    final offers = _offers.where((o) => ids.contains(o['id']) && (o['stock'] as num) > 0).toList()
      ..sort((a, b) => (((b['pricing'] as Map)['percent'] as num?) ?? 0).compareTo(((a['pricing'] as Map)['percent'] as num?) ?? 0));
    return _ok({..._campaignDto(c, now), 'offers': offers}, 'Campagne récupérée avec succès');
  }

  // ── Meilleures ventes ─────────────────────────
  /// Unités livrées sur 30 jours (historique de démonstration compris).
  Map<String, num> _salesCounts() {
    final counts = <String, num>{for (final o in _seed.offers) o['id'] as String: ((o['reviewsCount'] as num?) ?? 0) / 4};
    final since = DateTime.now().subtract(const Duration(days: 30));
    for (final part in _db.list('shopOrders')) {
      if (part['status'] != 'delivered' && part['status'] != 'completed') continue;
      final delivered = (part['statusHistory'] as List).cast<Map>().where((s) => s['status'] == 'delivered').firstOrNull?['changedAt'] as String?;
      if (delivered == null || DateTime.parse(delivered).isBefore(since)) continue;
      for (final item in (part['items'] as List).cast<Map>()) {
        counts[item['productBoutiqueId'] as String] = (counts[item['productBoutiqueId']] ?? 0) + (item['quantity'] as num);
      }
    }
    return counts;
  }

  // ── Places sponsorisées ───────────────────────
  String get _viewerKey => _db.sessionUserId != null ? 'user:${_db.sessionUserId}' : 'anon:cet-appareil';
  String _dayKey(DateTime d) => d.toUtc().toIso8601String().substring(0, 10);

  bool _relevant(String slot, Map<String, String> q, J offer, J? viewed) {
    J? first(J o, String key) {
      final list = (o['product'] as Map?)?[key] as List?;
      return list == null || list.isEmpty ? null : (list.first as Map).cast<String, dynamic>();
    }

    switch (slot) {
      case 'search':
        final text = q['q']?.trim().toLowerCase();
        if (text == null || text.isEmpty) return false;
        final product = offer['product'] as Map?;
        return '${product?['name'] ?? ''} ${product?['description'] ?? ''}'.toLowerCase().contains(text);
      case 'category':
        if (q['sousCategoryId'] != null) return first(offer, 'sousCategories')?['id'] == q['sousCategoryId'];
        if (q['categoryId'] != null) return first(offer, 'categories')?['id'] == q['categoryId'];
        if (q['familleId'] != null) return first(offer, 'familles')?['id'] == q['familleId'];
        return false;
      case 'similar':
        return viewed != null && offer['id'] != viewed['id'] && first(offer, 'categories')?['id'] == first(viewed, 'categories')?['id'];
      case 'promotions':
        return (((offer['pricing'] as Map)['percent'] as num?) ?? 0) > 0;
      default:
        return true;
    }
  }

  double _boostSpent(String id) => ((_counter('boostSpent')[id] as num?) ?? 0).toDouble();

  ApiResponse _sponsored(Map<String, String> q) {
    final slot = q['slot'] ?? 'home';
    final places = _slotPlaces[slot];
    if (places == null) _fail('Emplacement inconnu.', 400);
    final now = DateTime.now();
    final day = _dayKey(now);
    final viewed = q['offerId'] == null ? null : _offers.where((o) => o['id'] == q['offerId']).firstOrNull;
    final exposures = _counter('exposures');

    final chosen = <(J, J)>[];
    final perShop = <String, int>{};
    for (final boost in _boosts) {
      if (chosen.length >= places) break;
      if (now.isAfter(DateTime.parse(boost['endDate'] as String)) || _boostSpent(boost['id'] as String) >= (boost['reserved'] as num)) continue;
      if (slot == 'promotions' && boost['kind'] != 'promotion') continue;
      final key = '${boost['id']}|$_viewerKey|$day';
      if (((exposures[key] as num?) ?? 0) >= _frequencyCap) continue;
      final offer = _offers.where((o) => (boost['productBoutiqueIds'] as List).contains(o['id']) && (o['stock'] as num) > 0 && _relevant(slot, q, o, viewed)).firstOrNull;
      if (offer == null) continue;
      final shop = boost['boutiqueId'] as String;
      if ((perShop[shop] ?? 0) >= (places / 2).floor().clamp(1, places)) continue;
      perShop[shop] = (perShop[shop] ?? 0) + 1;
      chosen.add((offer, boost));
    }

    for (final (_, boost) in chosen) {
      final key = '${boost['id']}|$_viewerKey|$day';
      exposures[key] = ((exposures[key] as num?) ?? 0) + 1;
    }
    return _ok([
      for (final (offer, boost) in chosen)
        {
          ...offer,
          'sponsored': {
            'boostId': boost['id'],
            'kind': boost['kind'],
            'why': "${(offer['boutique'] as Map?)?['nom'] ?? 'Cette boutique'} paie pour montrer ce produit aux clients intéressés par ce type d'article.",
          },
        },
    ], 'Produits sponsorisés');
  }

  /// Visite d'une fiche depuis une place sponsorisée : une fois par visiteur et par jour.
  void _recordBoostVisit(String boostId, String offerId) {
    final boost = _boosts.where((b) => b['id'] == boostId).firstOrNull;
    if (boost == null || !(boost['productBoutiqueIds'] as List).contains(offerId)) return;
    final day = _dayKey(DateTime.now());
    final visits = ((_counters['visits'] ??= <Map<String, dynamic>>[]) as List);
    if (visits.any((v) => v['boostId'] == boostId && v['viewerKey'] == _viewerKey && v['day'] == day)) return;
    visits.add({'boostId': boostId, 'offerId': offerId, 'viewerKey': _viewerKey, 'userId': _db.sessionUserId, 'day': day, 'at': _now()});
    final spent = _counter('boostSpent');
    spent[boostId] = _boostSpent(boostId) + (boost['costPerVisit'] as num);
  }

  /// Boost dont une visite, dans les 7 jours, a précédé cet achat.
  String? _attributedBoost(String userId, String offerId) {
    final visits = ((_counters['visits'] as List?) ?? const []).cast<Map>();
    final since = DateTime.now().subtract(const Duration(days: 7));
    return visits.lastWhere((v) => v['userId'] == userId && v['offerId'] == offerId && DateTime.parse(v['at'] as String).isAfter(since), orElse: () => const {})['boostId'] as String?;
  }
}
