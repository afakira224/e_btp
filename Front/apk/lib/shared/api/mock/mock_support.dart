part of 'mock_api_client.dart';

// ─────────────────────────────────────────────
//  Support et demandes d'ouverture de boutique simulés — portage de
//  Front/front_web/src/shared/api/mock/{support,shopRequests}.ts pour ce
//  que le client voit et fait : ses demandes, leurs échanges, ses actions,
//  le formulaire de contact et ses mesures. Les réponses de la boutique et
//  de l'administration se font sur le site web.
// ─────────────────────────────────────────────

const _contactWarning = 'Votre message contient un numéro ou une adresse email : il est envoyé, mais tout doit se régler sur la plateforme.';

extension _Support on MockApiClient {
  List<J> get _tickets => _db.list('supportTickets');

  String _nextTicketNumber() {
    final next = ((_db.data['supportCounter'] as num?) ?? 0).toInt() + 1;
    _db.data['supportCounter'] = next;
    return 'SUP-${next.toString().padLeft(6, '0')}';
  }

  bool _containsContact(String text) => RegExp(r'(\+?\d[\d .-]{7,}\d)|[\w.+-]+@[\w-]+\.\w+|whats ?app', caseSensitive: false).hasMatch(text);

  J _message(String party, String name, String body, {String kind = 'message'}) => {
    'id': objectId(),
    'author': {'party': party, 'name': name},
    'visibility': 'public',
    'kind': kind,
    'body': body,
    'attachments': <J>[],
    'containsContact': party == 'requester' && _containsContact(body),
    'createdAt': _now(),
  };

  List<String> _requesterActions(J t, DateTime now) {
    final status = t['status'] as String;
    final open = status != 'resolved' && status != 'closed';
    final withShop = t['type'] == 'order_problem' || t['type'] == 'return';
    final resolvedAt = DateTime.tryParse(t['resolvedAt'] as String? ?? '');
    final closedAt = DateTime.tryParse(t['closedAt'] as String? ?? '');
    final proposal = t['proposal'] as Map?;
    return [
      if (status == 'awaiting_requester' && proposal?['status'] == 'pending') 'accept',
      if (withShop && (status == 'awaiting_shop' || status == 'awaiting_requester')) 'escalate',
      if (status == 'resolved' && t['appeal'] == null && resolvedAt != null && now.difference(resolvedAt) <= const Duration(days: 7) && (t['resolution'] as Map?)?['by'] == 'admin') 'appeal',
      if (open) 'close',
      if (!open && t['reopened'] != true && (closedAt ?? resolvedAt) != null && now.difference(closedAt ?? resolvedAt!) <= const Duration(days: 14)) 'reopen',
      if (!open && t['satisfaction'] == null) 'rate',
    ];
  }

  J _ticketDto(J t, {bool withMessages = false}) {
    final now = DateTime.now();
    final reasons = SupportTicketType.parse(t['type'] as String).reasons;
    return {
      ...Map<String, dynamic>.of(t)..remove('messages'),
      'typeLabel': SupportTicketType.parse(t['type'] as String).label,
      'reasonLabel': reasons[t['reason']] ?? t['reason'],
      'statusLabel': SupportTicketStatus.parse(t['status'] as String).label,
      'viewer': 'requester',
      'availableActions': _requesterActions(t, now),
      if (withMessages) 'messages': (t['messages'] as List).where((m) => (m as Map)['visibility'] == 'public').toList(),
    };
  }

  ApiResponse _listTickets(Map<String, String> q) {
    final user = _sessionUser();
    final mine = _tickets.where((t) => t['requesterId'] == user['_id']).toList()..sort((a, b) => (b['updatedAt'] as String).compareTo(a['updatedAt'] as String));
    bool open(J t) => t['status'] != 'resolved' && t['status'] != 'closed';
    final tab = q['tab'];
    final filtered = mine.where((t) => tab == null || (tab == 'open' ? open(t) : !open(t))).toList();
    return _ok({
      ..._paginate(filtered.map((t) => _ticketDto(t)).toList(), q, defaultLimit: 20, itemsKey: 'tickets'),
      'counts': {'open': mine.where(open).length, 'done': mine.where((t) => !open(t)).length},
    }, 'Demandes récupérées avec succès');
  }

  J _ownTicket(String id) {
    final user = _sessionUser();
    final t = _tickets.firstWhere((t) => t['id'] == id, orElse: () => _fail('Demande introuvable.', 404));
    if (t['requesterId'] != user['_id']) _fail('Vous ne participez pas à cette demande.', 403);
    return t;
  }

  ApiResponse _getTicket(String id) => _ok(_ticketDto(_ownTicket(id), withMessages: true), 'Demande récupérée avec succès');

  /// La cible d'une demande : une sous-commande, une annonce, une boutique.
  ({J? target, String? boutiqueId, String? orderId}) _resolveTarget(String type, String? targetId, J user) {
    switch (type) {
      case 'order_problem':
        final part = _parts.where((p) => p['id'] == targetId).firstOrNull;
        if (part == null) _fail('Commande introuvable.', 404);
        if (part['userId'] != user['_id']) _fail('Vous ne pouvez signaler que vos propres commandes.', 403);
        final delivered = (part['statusHistory'] as List).cast<Map>().where((s) => s['status'] == 'delivered').firstOrNull?['changedAt'] as String?;
        if (delivered != null && DateTime.now().difference(DateTime.parse(delivered)) > const Duration(days: 30)) {
          _fail('Une commande se signale 30 jours au plus après sa livraison.', 400);
        }
        return (
          target: {'kind': 'shop_order', 'id': part['id'], 'label': 'Commande ${part['reference']} — ${part['boutiqueNom']}'},
          boutiqueId: part['boutiqueId'] as String,
          orderId: part['orderId'] as String,
        );
      case 'listing_report':
        final offer = _seed.offers.where((o) => o['id'] == targetId).firstOrNull;
        if (offer == null) _fail('Annonce introuvable.', 404);
        return (
          target: {'kind': 'offer', 'id': offer['id'], 'label': '${(offer['product'] as Map?)?['name'] ?? 'Produit'} — ${(offer['boutique'] as Map?)?['nom'] ?? ''}'},
          boutiqueId: (offer['boutique'] as Map?)?['id'] as String?,
          orderId: null,
        );
      case 'shop_report':
        final shop = _seed.shops.where((s) => s['id'] == targetId).firstOrNull;
        if (shop == null) _fail('Boutique introuvable.', 404);
        return (target: {'kind': 'shop', 'id': shop['id'], 'label': shop['nom']}, boutiqueId: shop['id'] as String, orderId: null);
      case 'sanction_appeal':
        final sanction = _db.list('sanctions').where((s) => s['id'] == targetId).firstOrNull;
        if (sanction == null) _fail('Mesure introuvable.', 404);
        return (target: {'kind': 'sanction', 'id': sanction['id'], 'label': (sanction['target'] as Map)['label']}, boutiqueId: null, orderId: null);
      default:
        return (target: null, boutiqueId: null, orderId: null);
    }
  }

  J _newTicket(J user, String type, String reason, String description, String? subject, ({J? target, String? boutiqueId, String? orderId}) resolved) {
    final now = DateTime.now();
    final withShop = type == 'order_problem' || type == 'return';
    final reasons = SupportTicketType.parse(type).reasons;
    final name = '${user['prenom'] ?? ''} ${user['nom'] ?? ''}'.trim();
    final ticket = <String, dynamic>{
      'id': objectId(),
      'number': _nextTicketNumber(),
      'type': type,
      'reason': reason,
      'subject': (subject?.isNotEmpty ?? false) ? subject : '${reasons[reason] ?? reason}${resolved.target != null ? ' — ${resolved.target!['label']}' : ''}',
      'status': withShop ? 'awaiting_shop' : 'awaiting_admin',
      'priority': const {'counterfeit', 'prohibited', 'scam', 'off_platform_payment'}.contains(reason) ? 'urgent' : 'normal',
      'waitingOn': withShop ? 'shop' : 'admin',
      'requesterId': user['_id'],
      'requester': {'name': name, 'accountType': user['role']},
      'target': resolved.target,
      'boutiqueId': resolved.boutiqueId,
      'orderId': resolved.orderId,
      'proposal': null,
      'resolution': null,
      'appeal': null,
      'satisfaction': null,
      'deadlineAt': now.add(withShop ? const Duration(hours: 48) : const Duration(hours: 24)).toUtc().toIso8601String(),
      'messages': [_message('requester', name, description)],
      'createdAt': _now(),
      'updatedAt': _now(),
      'lastMessageAt': _now(),
      'resolvedAt': null,
      'closedAt': null,
    };
    _tickets.add(ticket);
    return ticket;
  }

  ApiResponse _createTicket(J body) {
    final user = _sessionUser();
    final type = body['type'] as String? ?? '';
    final reason = (body['reason'] as String? ?? '').trim();
    final description = (body['description'] as String? ?? '').trim();
    const openable = ['order_problem', 'listing_report', 'shop_report', 'review_report', 'customer_report', 'general_question', 'sanction_appeal'];
    final errors = [
      if (!openable.contains(type)) 'Type invalide. Valeurs acceptées : ${openable.join(', ')}.',
      if (reason.isEmpty) 'Le motif est requis.',
      if (description.length < 10 || description.length > 2000) 'Décrivez la situation : 10 à 2 000 caractères.',
    ];
    if (errors.isNotEmpty) _fail(errors.join(' | '), 422);
    final reasons = SupportTicketType.parse(type).reasons;
    if (!reasons.containsKey(reason)) _fail('Motif invalide. Valeurs acceptées : ${reasons.keys.join(', ')}.', 400);
    if (reason == 'other' && description.length < 20) _fail('Décrivez le problème en quelques phrases (20 caractères au moins).', 400);
    final resolved = _resolveTarget(type, body['targetId'] as String?, user);
    final target = resolved.target;
    if (target != null && (type == 'listing_report' || type == 'shop_report')) {
      final twice = _tickets.where((t) => t['requesterId'] == user['_id'] && (t['target'] as Map?)?['id'] == target['id'] && t['status'] != 'resolved' && t['status'] != 'closed').firstOrNull;
      if (twice != null) _fail('Vous avez déjà signalé ceci (${twice['number']}) : l’équipe l’examine.', 409);
    }
    final ticket = _newTicket(user, type, reason, description, (body['subject'] as String?)?.trim(), resolved);
    final flagged = ((ticket['messages'] as List).first as Map)['containsContact'] == true;
    return _ok({..._ticketDto(ticket, withMessages: true), if (flagged) 'warning': _contactWarning}, 'Demande ${ticket['number']} enregistrée.', 201);
  }

  /// Retour demandé sur une sous-commande : sa demande en suit les étapes.
  void _openReturnTicket(J part, J user, String reason, String? note) {
    final ticket = _newTicket(user, 'return', reason, (note == null || note.isEmpty) ? 'Retour demandé : ${returnReasons[reason]}.' : note, null, (
      target: {'kind': 'shop_order', 'id': part['id'], 'label': 'Commande ${part['reference']} — ${part['boutiqueNom']}'},
      boutiqueId: part['boutiqueId'] as String,
      orderId: part['orderId'] as String,
    ));
    ticket['shopOrderId'] = part['id'];
  }

  ApiResponse _postTicketMessage(String id, J body) {
    final t = _ownTicket(id);
    final content = (body['body'] as String? ?? '').trim();
    if (content.isEmpty || content.length > 2000) _fail('Message : 1 à 2 000 caractères.', 422);
    if (t['status'] == 'closed') _fail('Cette demande est fermée : rouvrez-la pour écrire.', 400);
    final user = _sessionUser();
    final message = _message('requester', '${user['prenom'] ?? ''} ${user['nom'] ?? ''}'.trim(), content);
    (t['messages'] as List).add(message);
    t['lastMessageAt'] = _now();
    t['updatedAt'] = _now();
    // Le client a répondu : la balle repasse à la boutique, ou à l'équipe.
    if (t['status'] == 'awaiting_requester') {
      final withShop = t['type'] == 'order_problem' || t['type'] == 'return';
      t['status'] = withShop && t['escalatedAt'] == null ? 'awaiting_shop' : 'awaiting_admin';
    }
    return _ok({..._ticketDto(t, withMessages: true), if (message['containsContact'] == true) 'warning': _contactWarning}, 'Message envoyé.');
  }

  ApiResponse _ticketAction(String id, String action, J body) {
    final t = _ownTicket(id);
    final now = DateTime.now();
    if (!_requesterActions(t, now).contains(action)) _fail('Action impossible sur cette demande.', 400);
    final reason = (body['reason'] as String?)?.trim();
    final user = _sessionUser();
    final name = '${user['prenom'] ?? ''} ${user['nom'] ?? ''}'.trim();
    void say(String text) => (t['messages'] as List).add(_message('system', 'Suivi', text, kind: 'event'));
    switch (action) {
      case 'accept':
        (t['proposal'] as Map)['status'] = 'accepted';
        t['status'] = 'resolved';
        t['resolution'] = {'outcome': 'agreed', 'outcomeLabel': 'Accord trouvé', 'by': 'requester', 'at': _now()};
        t['resolvedAt'] = _now();
        say('Proposition acceptée : la demande est résolue.');
      case 'escalate':
        t['status'] = 'awaiting_admin';
        t['escalatedAt'] = _now();
        say(reason == null || reason.isEmpty ? "Arbitrage demandé : l'administration reprend la demande." : 'Arbitrage demandé : $reason');
      case 'appeal':
        if (reason == null || reason.length < 10) _fail('Expliquez votre recours (10 caractères au moins).', 400);
        t['appeal'] = {'by': 'requester', 'reason': reason, 'at': _now()};
        t['status'] = 'awaiting_admin';
        say('Recours : $reason');
      case 'close':
        t['status'] = 'closed';
        t['closedAt'] = _now();
        t['resolution'] ??= {'outcome': 'withdrawn', 'outcomeLabel': 'Retirée par le demandeur', 'by': 'requester', 'at': _now()};
        say('$name a fermé la demande.');
      case 'reopen':
        if (reason == null || reason.length < 10) _fail('Dites pourquoi vous rouvrez la demande (10 caractères au moins).', 400);
        t['reopened'] = true;
        t['status'] = (t['type'] == 'order_problem' || t['type'] == 'return') ? 'awaiting_shop' : 'awaiting_admin';
        t['closedAt'] = null;
        say('Demande rouverte : $reason');
      case 'rate':
        final rating = (body['rating'] as num?)?.toInt();
        if (rating == null || rating < 1 || rating > 5) _fail('La note va de 1 à 5.', 422);
        t['satisfaction'] = {'rating': rating, 'comment': (body['comment'] as String?)?.trim()};
    }
    t['updatedAt'] = _now();
    const messages = {
      'accept': 'Proposition acceptée.',
      'escalate': "L'administration reprend la demande.",
      'appeal': 'Recours enregistré.',
      'close': 'Demande fermée.',
      'reopen': 'Demande rouverte.',
      'rate': 'Merci pour votre note.',
    };
    return _ok(_ticketDto(t, withMessages: true), messages[action] ?? 'Demande mise à jour.');
  }

  ApiResponse _contact(J body) {
    final name = (body['name'] as String? ?? '').trim();
    final email = (body['email'] as String? ?? '').trim();
    final message = (body['message'] as String? ?? '').trim();
    final errors = [
      if (name.length < 2 || name.length > 80) 'Votre nom : 2 à 80 caractères.',
      if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email)) 'Email invalide.',
      if (message.length < 10 || message.length > 2000) 'Votre message : 10 à 2 000 caractères.',
    ];
    if (errors.isNotEmpty) _fail(errors.join(' | '), 422);
    final number = _nextTicketNumber();
    _db.list('contactMessages').add({'number': number, 'name': name, 'email': email, 'reason': body['reason'] ?? 'usage', 'subject': body['subject'], 'message': message, 'createdAt': _now()});
    return _ok({'number': number}, "Message reçu ($number) : l'équipe vous répond par email sous 24 heures.", 201);
  }

  ApiResponse _mySanctions() {
    final user = _sessionUser();
    final now = DateTime.now();
    final mine = _db.list('sanctions').where((s) => s['notifiedUserId'] == user['_id']).map((s) {
      final ends = DateTime.tryParse(s['endsAt'] as String? ?? '');
      final state = s['liftedAt'] != null ? 'lifted' : (ends != null && ends.isBefore(now) ? 'ended' : 'active');
      return {...s, 'state': state};
    }).toList();
    return _ok(mine, 'Mesures récupérées avec succès');
  }

  /// Jeu neuf : une réclamation à laquelle la boutique a proposé une solution.
  void _seedDemoTicket() {
    final user = _db.list('users').firstWhere((u) => u['email'] == demoEmail, orElse: () => const {});
    if (user.isEmpty || _tickets.isNotEmpty) return;
    final part = _parts.where((p) => p['userId'] == user['_id'] && p['status'] == 'delivered').firstOrNull;
    if (part == null) return;
    final ticket = _newTicket(user, 'order_problem', 'delay', 'Ma commande devait arriver il y a deux jours.', null, (
      target: {'kind': 'shop_order', 'id': part['id'], 'label': 'Commande ${part['reference']} — ${part['boutiqueNom']}'},
      boutiqueId: part['boutiqueId'] as String,
      orderId: part['orderId'] as String,
    ));
    ticket
      ..['status'] = 'awaiting_requester'
      ..['waitingOn'] = 'requester'
      ..['proposal'] = {
        'kind': 'explanation',
        'kindLabel': 'Explication',
        'details': 'Le camion est tombé en panne : votre commande a été livrée hier. Nous vous offrons la livraison sur la prochaine commande.',
        'status': 'pending',
        'at': _now(),
      }
      ..['messages'] = [
        _message('requester', '${user['prenom']} ${user['nom']}', 'Ma commande devait arriver il y a deux jours et je n’ai eu aucune nouvelle.'),
        _message('shop', '${part['boutiqueNom']}', 'Le camion est tombé en panne : votre commande a été livrée hier. Nous vous offrons la livraison sur la prochaine commande.', kind: 'proposal'),
      ];
  }

  // ── Demandes d'ouverture de boutique ──────────
  J _shopRequestDto(J r) => {
    ...r,
    'familles': [
      for (final id in (r['familleIds'] as List).cast<String>()) {'id': id, 'nom': ?(_seed.familles.where((f) => f['id'] == id).firstOrNull?['nom'])},
    ],
  };

  ApiResponse _createShopRequest(J body) {
    final user = _sessionUser();
    String text(String key) => (body[key] as String? ?? '').trim();
    final nom = text('nom');
    final description = text('description');
    final familleIds = ((body['familleIds'] as List?) ?? const []).map((e) => '$e').toSet().toList();
    final sellerType = text('sellerType');
    final errors = [
      if (nom.isEmpty) 'Le nom de la boutique est requis.' else if (nom.length < 2 || nom.length > 100) 'Le nom de la boutique doit compter entre 2 et 100 caractères.',
      if (description.isEmpty) 'La présentation de la boutique est requise.' else if (description.length < 20 || description.length > 1000) 'La présentation doit compter entre 20 et 1000 caractères.',
      if (familleIds.isEmpty) "Choisissez au moins un domaine d'activité.",
      if (!sellerTypes.containsKey(sellerType)) 'Précisez si vous vendez en tant que particulier ou entreprise.',
      if (sellerType == 'entreprise' && (text('rccm').length < 5 || text('rccm').length > 50)) 'Le numéro RCCM est requis pour une entreprise (5 à 50 caractères).',
      if (!sellerExperiences.containsKey(text('experience'))) "Indiquez l'ancienneté de votre activité.",
      if (!catalogSizes.containsKey(text('catalogSize'))) 'Indiquez la taille de votre catalogue.',
      if (body['hasPhysicalStore'] is! bool) 'Indiquez si vous avez un dépôt ou un magasin.',
      if (text('adresse').length < 5) "L'adresse est requise (5 caractères au moins).",
      if (body['acceptTerms'] != true) 'Vous devez accepter les conditions des vendeurs.',
    ];
    if (errors.isNotEmpty) _fail(errors.join(' | '), 422);
    final requests = _db.list('shopRequests');
    if (requests.any((r) => r['userId'] == user['_id'] && r['status'] == 'pending')) _fail("Vous avez déjà une demande en cours d'examen.", 409);
    if (_seed.shops.any((s) => normalize(s['nom'] as String) == normalize(nom))) _fail('Une boutique porte déjà ce nom : choisissez-en un autre.', 409);
    if (!familleIds.every((id) => _seed.familles.any((f) => f['id'] == id))) _fail("Domaine d'activité introuvable.", 400);
    final request = <String, dynamic>{
      'id': objectId(),
      'userId': user['_id'],
      'nom': nom,
      'description': description,
      'familleIds': familleIds,
      'sellerType': sellerType,
      'rccm': sellerType == 'entreprise' ? text('rccm') : null,
      'experience': text('experience'),
      'catalogSize': text('catalogSize'),
      'hasPhysicalStore': body['hasPhysicalStore'],
      'adresse': text('adresse'),
      'email': text('email').isEmpty ? null : text('email').toLowerCase(),
      'message': text('message').isEmpty ? null : text('message'),
      'acceptedTermsAt': _now(),
      'status': 'pending',
      'rejectionReason': null,
      'reviewedAt': null,
      'shopId': null,
      'createdAt': _now(),
      'updatedAt': _now(),
    };
    requests.add(request);
    return _ok(_shopRequestDto(request), "Demande envoyée. L'administration va l'examiner.", 201);
  }

  ApiResponse _myShopRequests() {
    final user = _sessionUser();
    final mine = _db.list('shopRequests').where((r) => r['userId'] == user['_id']).toList()..sort(_byNewest);
    return _ok(mine.map(_shopRequestDto).toList(), 'Demandes récupérées avec succès');
  }

  ApiResponse _cancelShopRequest(String id) {
    final user = _sessionUser();
    final request = _db.list('shopRequests').firstWhere((r) => r['id'] == id, orElse: () => _fail('Demande introuvable.', 404));
    if (request['userId'] != user['_id']) _fail('Vous ne pouvez annuler que vos propres demandes.', 403);
    if (request['status'] != 'pending') _fail('Seule une demande en attente peut être annulée.', 400);
    request
      ..['status'] = 'cancelled'
      ..['updatedAt'] = _now();
    return _ok(_shopRequestDto(request), 'Demande annulée.');
  }
}
