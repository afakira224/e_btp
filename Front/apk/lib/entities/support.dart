import 'json.dart';
import 'order.dart';

// ─────────────────────────────────────────────
//  Support — recopie de Back/src/shared/interfaces/Support.interfaces.ts et
//  des règles de Back/src/shared/helpers/support.workflow.ts.
//
//  Signalements, réclamations et questions sont des demandes, avec leur fil
//  d'échanges. Comme pour les commandes, l'écran n'affiche que les actions
//  renvoyées par le serveur (`availableActions`).
// ─────────────────────────────────────────────

enum SupportTicketType {
  orderProblem('order_problem', 'Problème de commande', "La boutique a 48 heures pour vous répondre. Sans réponse ou sans accord, l'administration tranche."),
  returnRequest('return', 'Retour', 'Le retour se demande depuis la commande livrée, dans les 7 jours.'),
  listingReport('listing_report', "Signalement d'annonce", "L'équipe examine l'annonce. La boutique ne saura pas qui l'a signalée."),
  shopReport('shop_report', 'Signalement de boutique', "L'équipe examine la boutique. Elle ne saura pas qui l'a signalée."),
  reviewReport('review_report', "Signalement d'avis", "L'équipe examine l'avis. Son auteur ne saura pas qui l'a signalé."),
  customerReport('customer_report', 'Signalement de client', "L'équipe examine le comportement du client."),
  generalQuestion('general_question', 'Question', "L'équipe de la plateforme vous répond sous 24 heures."),
  sanctionAppeal('sanction_appeal', "Contestation d'une mesure", "Un autre membre de l'équipe réexamine la mesure.");

  const SupportTicketType(this.value, this.label, this.intro);
  final String value;
  final String label;
  final String intro;

  static SupportTicketType parse(String v) => SupportTicketType.values.firstWhere((t) => t.value == v, orElse: () => SupportTicketType.generalQuestion);

  Map<String, String> get reasons => supportReasons[this] ?? const {'other': 'Autre'};
}

const supportReasons = <SupportTicketType, Map<String, String>>{
  SupportTicketType.orderProblem: {'delay': 'Retard', 'not_received': 'Colis non reçu', 'shop_unreachable': 'Boutique injoignable', 'refund_not_received': 'Remboursement non reçu', 'other': 'Autre'},
  SupportTicketType.returnRequest: returnReasons,
  SupportTicketType.listingReport: {
    'counterfeit': 'Contrefaçon',
    'prohibited': 'Produit interdit ou dangereux',
    'misleading': 'Description trompeuse',
    'abusive_price': 'Prix abusif',
    'stolen_photos': "Photos d'un autre vendeur",
    'fake_discount': 'Faux prix barré',
    'other': 'Autre',
  },
  SupportTicketType.shopReport: {'scam': 'Arnaque', 'off_platform_payment': 'Paiement demandé hors plateforme', 'insulting': 'Propos insultants', 'fake_address': 'Fausse adresse', 'other': 'Autre'},
  SupportTicketType.generalQuestion: {'account': 'Mon compte', 'payment': 'Paiement', 'usage': "Utilisation de l'application", 'shop_opening': 'Ouverture de boutique', 'other': 'Autre'},
  SupportTicketType.sanctionAppeal: {'appeal': "Contestation d'une mesure"},
};

enum SupportTicketStatus {
  awaitingShop('awaiting_shop', 'Chez la boutique', StatusTone.warning),
  awaitingRequester('awaiting_requester', 'Votre réponse est attendue', StatusTone.warning),
  awaitingAdmin('awaiting_admin', "Chez l'équipe de la plateforme", StatusTone.progress),
  resolved('resolved', 'Résolue', StatusTone.success),
  closed('closed', 'Fermée', StatusTone.neutral);

  const SupportTicketStatus(this.value, this.label, this.tone);
  final String value;
  final String label;
  final StatusTone tone;

  static SupportTicketStatus parse(String v) => SupportTicketStatus.values.firstWhere((s) => s.value == v, orElse: () => SupportTicketStatus.awaitingAdmin);

  bool get isOpen => this != resolved && this != closed;
}

/// Ce que le demandeur peut faire sur sa demande.
enum SupportAction {
  accept('accept', 'Accepter la proposition'),
  escalate('escalate', "Demander l'arbitrage"),
  appeal('appeal', 'Faire appel'),
  close('close', 'Fermer la demande'),
  reopen('reopen', 'Rouvrir'),
  rate('rate', 'Noter la réponse');

  const SupportAction(this.value, this.label);
  final String value;
  final String label;

  static SupportAction? tryParse(String v) => SupportAction.values.where((a) => a.value == v).firstOrNull;

  /// Un motif est demandé (arbitrage, appel, réouverture).
  bool get needsReason => this == escalate || this == appeal || this == reopen;
}

class SupportMessage {
  const SupportMessage({required this.id, required this.party, required this.authorName, required this.kind, required this.body, required this.createdAt, this.containsContact = false});

  final String id;

  /// `requester` | `shop` | `admin` | `system`
  final String party;
  final String authorName;

  /// `message` | `proposal` | `decision` | `event`
  final String kind;
  final String body;
  final DateTime createdAt;
  final bool containsContact;

  bool get mine => party == 'requester';

  factory SupportMessage.fromJson(Json j) {
    final author = object(j, 'author') ?? const {};
    return SupportMessage(
      id: anyId(j),
      party: str(author, 'party', 'system'),
      authorName: str(author, 'name'),
      kind: str(j, 'kind', 'message'),
      body: str(j, 'body'),
      createdAt: DateTime.tryParse(str(j, 'createdAt')) ?? DateTime.now(),
      containsContact: boolean(j, 'containsContact'),
    );
  }
}

class SupportProposal {
  const SupportProposal({required this.kindLabel, required this.details, required this.status});

  final String kindLabel;
  final String details;

  /// `pending` | `accepted` | `declined`
  final String status;

  factory SupportProposal.fromJson(Json j) => SupportProposal(kindLabel: str(j, 'kindLabel', str(j, 'kind')), details: str(j, 'details'), status: str(j, 'status', 'pending'));
}

class SupportTicket {
  const SupportTicket({
    required this.id,
    required this.number,
    required this.type,
    required this.reasonLabel,
    required this.subject,
    required this.status,
    this.targetLabel,
    this.orderId,
    this.proposal,
    this.resolutionLabel,
    this.resolutionNote,
    this.rating,
    this.deadlineAt,
    this.availableActions = const [],
    this.messages = const [],
    required this.createdAt,
    this.lastMessageAt,
    this.warning,
  });

  final String id;
  final String number;
  final SupportTicketType type;
  final String reasonLabel;
  final String subject;
  final SupportTicketStatus status;
  final String? targetLabel;
  final String? orderId;
  final SupportProposal? proposal;
  final String? resolutionLabel;
  final String? resolutionNote;
  final int? rating;
  final DateTime? deadlineAt;
  final List<SupportAction> availableActions;
  final List<SupportMessage> messages;
  final DateTime createdAt;
  final DateTime? lastMessageAt;

  /// Le message envoyé contenait des coordonnées : tout doit se régler sur la plateforme.
  final String? warning;

  factory SupportTicket.fromJson(Json j) {
    final target = object(j, 'target');
    final proposal = object(j, 'proposal');
    final resolution = object(j, 'resolution');
    final satisfaction = object(j, 'satisfaction');
    return SupportTicket(
      id: anyId(j),
      number: str(j, 'number'),
      type: SupportTicketType.parse(str(j, 'type')),
      reasonLabel: str(j, 'reasonLabel', str(j, 'reason')),
      subject: str(j, 'subject'),
      status: SupportTicketStatus.parse(str(j, 'status')),
      targetLabel: target == null ? null : strOrNull(target, 'label'),
      orderId: strOrNull(j, 'orderId'),
      proposal: proposal == null ? null : SupportProposal.fromJson(proposal),
      resolutionLabel: resolution == null ? null : strOrNull(resolution, 'outcomeLabel'),
      resolutionNote: resolution == null ? null : strOrNull(resolution, 'note'),
      rating: satisfaction == null ? null : integer(satisfaction, 'rating'),
      deadlineAt: DateTime.tryParse(str(j, 'deadlineAt')),
      availableActions: [for (final a in strings(j, 'availableActions')) ?SupportAction.tryParse(a)],
      messages: objects(j, 'messages').map(SupportMessage.fromJson).toList(),
      createdAt: DateTime.tryParse(str(j, 'createdAt')) ?? DateTime.now(),
      lastMessageAt: DateTime.tryParse(str(j, 'lastMessageAt')),
      warning: strOrNull(j, 'warning'),
    );
  }
}

/// Une mesure de la modération qui vise le compte ou l'une de ses boutiques.
class Sanction {
  const Sanction({required this.id, required this.type, required this.targetLabel, required this.reason, required this.state, this.endsAt, required this.startsAt});

  final String id;

  /// `hide` | `warning` | `suspension` | `block` | `promo_ban`
  final String type;
  final String targetLabel;
  final String reason;

  /// `active` | `ended` | `lifted`
  final String state;
  final DateTime? endsAt;
  final DateTime startsAt;

  String get typeLabel => switch (type) {
    'hide' => 'Masquage',
    'warning' => 'Avertissement',
    'suspension' => 'Suspension',
    'block' => 'Blocage',
    'promo_ban' => 'Promotions suspendues',
    _ => 'Mesure',
  };

  bool get isActive => state == 'active';

  factory Sanction.fromJson(Json j) => Sanction(
    id: anyId(j),
    type: str(j, 'type'),
    targetLabel: str(object(j, 'target') ?? const {}, 'label'),
    reason: str(j, 'reason'),
    state: str(j, 'state', 'active'),
    endsAt: DateTime.tryParse(str(j, 'endsAt')),
    startsAt: DateTime.tryParse(str(j, 'startsAt')) ?? DateTime.now(),
  );
}
