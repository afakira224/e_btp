import 'delivery.dart';
import 'json.dart';
import 'product.dart';
import 'shop.dart';

// ─────────────────────────────────────────────
//  Commande — recopie de Back/src/shared/interfaces/Order.interfaces.ts,
//  ShopOrder.interfaces.ts et des énumérations de order.model.ts et
//  shopOrder.model.ts.
//
//  Une commande est découpée en une sous-commande par boutique : chacune
//  avance à son rythme. Le statut de la commande se déduit de ses
//  sous-commandes. `availableActions` est calculé par le serveur pour le
//  client : l'écran n'affiche que ces boutons, le serveur revérifie tout.
// ─────────────────────────────────────────────

/// Ton d'un statut : ce que la couleur du badge veut dire.
enum StatusTone { neutral, progress, warning, success, danger }

enum OrderStatus {
  awaitingPayment('awaiting_payment', 'En attente de paiement', 'À payer', StatusTone.warning),
  paymentFailed('payment_failed', 'Paiement échoué', 'Paiement échoué', StatusTone.danger),
  inProgress('in_progress', 'En cours', 'En cours', StatusTone.progress),
  completed('completed', 'Terminée', 'Terminées', StatusTone.success),
  partiallyCompleted('partially_completed', 'Partiellement terminée', 'Partiellement terminées', StatusTone.success),
  cancelled('cancelled', 'Annulée', 'Annulées', StatusTone.danger),
  // Commandes passées avant les sous-commandes : lisibles, plus créées.
  pending('pending', 'En attente', 'En attente', StatusTone.warning),
  confirmed('confirmed', 'Confirmée', 'Confirmées', StatusTone.progress),
  shipped('shipped', 'Expédiée', 'Expédiées', StatusTone.progress),
  delivered('delivered', 'Livrée', 'Livrées', StatusTone.success);

  const OrderStatus(this.value, this.label, this.filterLabel, this.tone);
  final String value;
  final String label;

  /// Un filtre désigne un ensemble : au pluriel.
  final String filterLabel;
  final StatusTone tone;

  static OrderStatus parse(String v) => OrderStatus.values.firstWhere((s) => s.value == v, orElse: () => OrderStatus.inProgress);

  /// Filtres de « Mes commandes » (un statut par requête, comme le back).
  static const filters = [inProgress, awaitingPayment, completed, cancelled];

  bool get isOpen => this == awaitingPayment || this == inProgress || this == pending || this == confirmed || this == shipped;
}

enum OrderPaymentStatus {
  onDelivery('on_delivery', 'À payer à la remise'),
  pending('pending', 'Paiement en attente'),
  paid('paid', 'Payée'),
  failed('failed', 'Paiement échoué');

  const OrderPaymentStatus(this.value, this.label);
  final String value;
  final String label;

  static OrderPaymentStatus parse(String v) => OrderPaymentStatus.values.firstWhere((s) => s.value == v, orElse: () => OrderPaymentStatus.onDelivery);
}

enum PaymentMethod {
  onDelivery('on_delivery', 'À la livraison ou au retrait', 'Vous réglez chaque boutique à la remise de sa commande, sur présentation de votre code.'),
  online('online', 'En ligne', 'Réglez tout maintenant, en une fois. Les boutiques reçoivent la commande dès le paiement confirmé ; 30 minutes pour payer.');

  const PaymentMethod(this.value, this.label, this.hint);
  final String value;
  final String label;
  final String hint;

  static PaymentMethod parse(String v) => PaymentMethod.values.firstWhere((m) => m.value == v, orElse: () => PaymentMethod.onDelivery);
}

/// Mode résumé de la commande : celui de toutes ses livraisons, ou `mixed`
/// quand les boutiques diffèrent. `standard` et `express` sont ceux des
/// commandes d'avant les modes par boutique.
enum DeliveryMethod {
  pickup('pickup', 'Retrait en boutique'),
  free('free', 'Livraison gratuite'),
  flatRate('flat_rate', 'Livraison à prix fixe'),
  standard('standard', 'Livraison standard'),
  express('express', 'Livraison express'),
  mixed('mixed', 'Livraisons par boutique');

  const DeliveryMethod(this.value, this.label);
  final String value;
  final String label;

  static DeliveryMethod parse(String v) =>
      DeliveryMethod.values.firstWhere((m) => m.value == v, orElse: () => DeliveryMethod.standard);
}

// ── Sous-commande ───────────────────────────
enum ShopOrderStatus {
  awaitingPayment('awaiting_payment', 'En attente de paiement', StatusTone.warning),
  pending('pending', 'À confirmer par la boutique', StatusTone.warning),
  confirmed('confirmed', 'En préparation', StatusTone.progress),
  shipped('shipped', 'En livraison', StatusTone.progress),
  readyForPickup('ready_for_pickup', 'Prête au retrait', StatusTone.progress),
  deliveryFailed('delivery_failed', 'Livraison échouée', StatusTone.warning),
  delivered('delivered', 'Livrée', StatusTone.success),
  returnRequested('return_requested', 'Retour demandé', StatusTone.warning),
  disputed('disputed', 'Litige', StatusTone.warning),
  completed('completed', 'Terminée', StatusTone.success),
  cancelled('cancelled', 'Annulée', StatusTone.danger),
  refused('refused', 'Refusée par la boutique', StatusTone.danger),
  expired('expired', 'Expirée', StatusTone.danger),
  failed('failed', 'Échec de livraison', StatusTone.danger),
  returned('returned', 'Retournée', StatusTone.danger);

  const ShopOrderStatus(this.value, this.label, this.tone);
  final String value;
  final String label;
  final StatusTone tone;

  static ShopOrderStatus parse(String v) => ShopOrderStatus.values.firstWhere((s) => s.value == v, orElse: () => ShopOrderStatus.pending);

  static const negativeEnd = [cancelled, refused, expired, failed, returned];
  bool get isNegativeEnd => negativeEnd.contains(this);
  bool get isTerminal => this == completed || isNegativeEnd;

  /// Le code de remise sert jusqu'à la remise : le client le donne au livreur ou au comptoir.
  bool get showsPickupCode => this == confirmed || this == shipped || this == readyForPickup || this == deliveryFailed;
}

/// Ce que le client peut faire sur une sous-commande (les autres actions
/// sont celles de la boutique ou de l'administration).
enum ShopOrderAction {
  cancel('cancel', 'Annuler', 'Annuler cette partie de la commande ?', true),
  requestReturn('return', 'Demander un retour', 'Que se passe-t-il avec cette commande ?', false);

  const ShopOrderAction(this.value, this.label, this.question, this.danger);
  final String value;
  final String label;
  final String question;
  final bool danger;

  static ShopOrderAction? tryParse(String v) => ShopOrderAction.values.where((a) => a.value == v).firstOrNull;

  Map<String, String> get reasons => this == cancel ? cancellationReasons : returnReasons;
  bool get reasonRequired => this == requestReturn;
}

const cancellationReasons = {'changed_mind': "Changement d'avis", 'ordering_error': 'Erreur de commande', 'too_slow': 'Délai trop long', 'other': 'Autre'};

const returnReasons = {'not_as_described': 'Produit non conforme', 'damaged': 'Produit abîmé', 'incomplete': 'Commande incomplète', 'not_received': 'Commande non reçue'};

/// Un retour pour « produit abîmé » exige une photo : il se demande depuis le site.
const returnReasonsNeedingPhoto = {'damaged'};

enum ShopOrderPaymentStatus {
  unpaid('unpaid', 'À payer'),
  paid('paid', 'Payée'),
  voided('void', 'Rien à payer'),
  refundPending('refund_pending', 'Remboursement en cours'),
  refunded('refunded', 'Remboursée'),
  partiallyRefunded('partially_refunded', 'Partiellement remboursée');

  const ShopOrderPaymentStatus(this.value, this.label);
  final String value;
  final String label;

  static ShopOrderPaymentStatus parse(String v) => ShopOrderPaymentStatus.values.firstWhere((s) => s.value == v, orElse: () => ShopOrderPaymentStatus.unpaid);
}

/// Une livraison de la commande, figée au checkout : une par boutique.
class OrderDelivery {
  const OrderDelivery({required this.boutiqueId, this.boutiqueNom, this.method, this.methodValue = '', this.fee = 0, this.pickupAdresse});

  final String boutiqueId;
  final String? boutiqueNom;
  final DeliveryMode? method;
  final String methodValue;
  final double fee;
  final String? pickupAdresse;

  bool get isPickup => method == DeliveryMode.pickup;
  String get label => method?.label ?? DeliveryMethod.parse(methodValue).label;

  factory OrderDelivery.fromJson(Json j) => OrderDelivery(
    boutiqueId: str(j, 'boutiqueId'),
    boutiqueNom: strOrNull(j, 'boutiqueNom'),
    method: DeliveryMode.tryParse(strOrNull(j, 'method')),
    methodValue: str(j, 'method'),
    fee: number(j, 'fee'),
    pickupAdresse: strOrNull(j, 'pickupAdresse'),
  );
}

class ShopOrderItem {
  const ShopOrderItem({required this.productBoutiqueId, this.productName, this.urlImages = const [], required this.price, required this.quantity, required this.lineTotal});

  final String productBoutiqueId;
  final String? productName;
  final List<String> urlImages;
  final double price;
  final int quantity;
  final double lineTotal;

  String get name => productName ?? 'Article';

  factory ShopOrderItem.fromJson(Json j) => ShopOrderItem(
    productBoutiqueId: str(j, 'productBoutiqueId'),
    productName: strOrNull(j, 'productName'),
    urlImages: strings(j, 'urlImages'),
    price: number(j, 'price'),
    quantity: integer(j, 'quantity'),
    lineTotal: number(j, 'lineTotal'),
  );
}

class ShopOrderStep {
  const ShopOrderStep({required this.status, required this.changedAt, this.actor = '', this.reasonLabel, this.note});

  final ShopOrderStatus status;
  final DateTime changedAt;
  final String actor;
  final String? reasonLabel;
  final String? note;

  String get actorLabel => switch (actor) {
    'client' => 'Vous',
    'shop' => 'La boutique',
    'admin' => "L'équipe de la plateforme",
    'system' => 'Automatique',
    _ => '',
  };

  factory ShopOrderStep.fromJson(Json j) => ShopOrderStep(
    status: ShopOrderStatus.parse(str(j, 'status')),
    changedAt: DateTime.tryParse(str(j, 'changedAt')) ?? DateTime.now(),
    actor: str(j, 'actor'),
    reasonLabel: strOrNull(j, 'reasonLabel'),
    note: strOrNull(j, 'note'),
  );
}

class ShopOrderReturn {
  const ShopOrderReturn({required this.reasonLabel, this.details, required this.requestedAt, this.shopResponse, this.resolution, this.resolutionNote});

  final String reasonLabel;
  final String? details;
  final DateTime requestedAt;
  final String? shopResponse;
  final String? resolution;
  final String? resolutionNote;

  factory ShopOrderReturn.fromJson(Json j) => ShopOrderReturn(
    reasonLabel: str(j, 'reasonLabel', str(j, 'reason')),
    details: strOrNull(j, 'details'),
    requestedAt: DateTime.tryParse(str(j, 'requestedAt')) ?? DateTime.now(),
    shopResponse: strOrNull(j, 'shopResponse'),
    resolution: strOrNull(j, 'resolution'),
    resolutionNote: strOrNull(j, 'resolutionNote'),
  );
}

class ShopOrder {
  const ShopOrder({
    required this.id,
    required this.orderId,
    required this.reference,
    required this.boutiqueId,
    this.boutiqueNom,
    this.items = const [],
    this.subtotal = 0,
    this.discountAmount = 0,
    this.deliveryFee = 0,
    required this.amount,
    required this.delivery,
    this.paymentStatus = ShopOrderPaymentStatus.unpaid,
    this.refundedAmount = 0,
    required this.status,
    this.statusHistory = const [],
    this.pickupCode,
    this.returnRequest,
    this.deadlineAt,
    this.availableActions = const [],
  });

  final String id;
  final String orderId;
  final String reference;
  final String boutiqueId;
  final String? boutiqueNom;
  final List<ShopOrderItem> items;
  final double subtotal;
  final double discountAmount;
  final double deliveryFee;
  final double amount;
  final OrderDelivery delivery;
  final ShopOrderPaymentStatus paymentStatus;
  final double refundedAmount;
  final ShopOrderStatus status;
  final List<ShopOrderStep> statusHistory;

  /// À donner à la remise : il prouve que le colis est bien arrivé.
  final String? pickupCode;
  final ShopOrderReturn? returnRequest;
  final DateTime? deadlineAt;
  final List<ShopOrderAction> availableActions;

  String get shopName => boutiqueNom ?? delivery.boutiqueNom ?? 'Boutique';
  int get totalItems => items.fold(0, (sum, i) => sum + i.quantity);

  factory ShopOrder.fromJson(Json j) {
    final shop = object(j, 'boutique') ?? const {};
    final delivery = object(j, 'delivery');
    final payment = object(j, 'payment') ?? const {};
    final ret = object(j, 'return');
    return ShopOrder(
      id: anyId(j),
      orderId: str(j, 'orderId'),
      reference: str(j, 'reference'),
      boutiqueId: str(shop, 'id', str(j, 'boutiqueId')),
      boutiqueNom: strOrNull(shop, 'nom') ?? strOrNull(j, 'boutiqueNom'),
      items: objects(j, 'items').map(ShopOrderItem.fromJson).toList(),
      subtotal: number(j, 'subtotal'),
      discountAmount: number(j, 'discountAmount'),
      deliveryFee: number(j, 'deliveryFee'),
      amount: number(j, 'amount'),
      delivery: delivery == null ? OrderDelivery(boutiqueId: str(shop, 'id')) : OrderDelivery.fromJson(delivery),
      paymentStatus: ShopOrderPaymentStatus.parse(str(payment, 'status')),
      refundedAmount: number(payment, 'refundedAmount'),
      status: ShopOrderStatus.parse(str(j, 'status')),
      statusHistory: objects(j, 'statusHistory').map(ShopOrderStep.fromJson).toList(),
      pickupCode: strOrNull(j, 'pickupCode'),
      returnRequest: ret == null ? null : ShopOrderReturn.fromJson(ret),
      deadlineAt: DateTime.tryParse(str(j, 'deadlineAt')),
      availableActions: [for (final a in strings(j, 'availableActions')) ?ShopOrderAction.tryParse(a)],
    );
  }
}

// ── Commande ────────────────────────────────
class OrderItem {
  const OrderItem({this.productBoutique, this.boutique, this.productName, required this.price, required this.quantity, required this.lineTotal});

  /// Absente si l'offre a été supprimée depuis.
  final ProductBoutique? productBoutique;
  final Shop? boutique;
  final String? productName;
  final double price;
  final int quantity;
  final double lineTotal;

  String get name => productBoutique?.name ?? productName ?? 'Article';

  factory OrderItem.fromJson(Json j) {
    final pb = object(j, 'productBoutique');
    final shop = object(j, 'boutique');
    final product = object(j, 'product');
    return OrderItem(
      productBoutique: pb == null ? null : ProductBoutique.fromJson(pb),
      boutique: shop == null ? null : Shop.fromJson(shop),
      productName: product == null ? null : strOrNull(product, 'name'),
      price: number(j, 'price'),
      quantity: integer(j, 'quantity'),
      lineTotal: number(j, 'lineTotal'),
    );
  }
}

class OrderStep {
  const OrderStep({required this.status, required this.changedAt, this.note});

  final OrderStatus status;
  final DateTime changedAt;
  final String? note;

  factory OrderStep.fromJson(Json j) => OrderStep(
        status: OrderStatus.parse(str(j, 'status')),
        changedAt: DateTime.tryParse(str(j, 'changedAt')) ?? DateTime.now(),
        note: strOrNull(j, 'note'),
      );
}

/// Adresse figée dans la commande : elle survit à la modification de l'adresse d'origine.
class ShippingAddress {
  const ShippingAddress({this.destinataire, required this.telephone, required this.adresse, required this.ville, this.commune, this.pays = 'Guinée'});

  final String? destinataire;
  final String telephone;
  final String adresse;
  final String ville;
  final String? commune;
  final String pays;

  factory ShippingAddress.fromJson(Json j) => ShippingAddress(
        destinataire: strOrNull(j, 'destinataire'),
        telephone: str(j, 'telephone'),
        adresse: str(j, 'adresse'),
        ville: str(j, 'ville'),
        commune: strOrNull(j, 'commune'),
        pays: str(j, 'pays', 'Guinée'),
      );
}

class Order {
  const Order({
    required this.id,
    required this.reference,
    required this.status,
    this.statusHistory = const [],
    this.paymentMethod = PaymentMethod.onDelivery,
    this.paymentStatus = OrderPaymentStatus.onDelivery,
    this.paymentExpiresAt,
    this.parts = const [],
    this.items = const [],
    required this.totalItems,
    required this.subtotal,
    this.discountAmount = 0,
    this.promotionCode,
    this.shippingFee = 0,
    required this.amount,
    required this.deliveryMethod,
    this.deliveries = const [],
    this.shippingAddress,
    required this.createdAt,
  });

  final String id;
  final String reference;
  final OrderStatus status;
  final List<OrderStep> statusHistory;
  final PaymentMethod paymentMethod;
  final OrderPaymentStatus paymentStatus;

  /// Échéance d'un paiement en ligne pas encore confirmé.
  final DateTime? paymentExpiresAt;

  /// Une sous-commande par boutique, chacune avec son statut et ses actions.
  final List<ShopOrder> parts;
  final List<OrderItem> items;
  final int totalItems;
  final double subtotal;
  final double discountAmount;
  final String? promotionCode;
  final double shippingFee;

  /// subtotal − discountAmount + shippingFee.
  final double amount;
  final DeliveryMethod deliveryMethod;
  final List<OrderDelivery> deliveries;
  final ShippingAddress? shippingAddress;
  final DateTime createdAt;

  /// Paiement en ligne lancé et pas encore réglé : on peut le relancer.
  bool get awaitsPayment => status == OrderStatus.awaitingPayment && paymentStatus == OrderPaymentStatus.pending;

  /// `CMD-horodatage-n` → `CMD-n` pour les listes.
  String get shortReference {
    final parts = reference.split('-');
    return parts.length < 3 ? reference : '${parts.first}-${parts.last}';
  }

  factory Order.fromJson(Json j) {
    final addr = object(j, 'shippingAddress');
    return Order(
      id: anyId(j),
      reference: str(j, 'reference'),
      status: OrderStatus.parse(str(j, 'status')),
      statusHistory: objects(j, 'statusHistory').map(OrderStep.fromJson).toList(),
      paymentMethod: PaymentMethod.parse(str(j, 'paymentMethod')),
      paymentStatus: OrderPaymentStatus.parse(str(j, 'paymentStatus')),
      paymentExpiresAt: DateTime.tryParse(str(j, 'paymentExpiresAt')),
      parts: objects(j, 'parts').map(ShopOrder.fromJson).toList(),
      items: objects(j, 'items').map(OrderItem.fromJson).toList(),
      totalItems: integer(j, 'totalItems'),
      subtotal: number(j, 'subtotal'),
      discountAmount: number(j, 'discountAmount'),
      promotionCode: strOrNull(j, 'promotionCode'),
      shippingFee: number(j, 'shippingFee'),
      amount: number(j, 'amount'),
      deliveryMethod: DeliveryMethod.parse(str(j, 'deliveryMethod')),
      deliveries: objects(j, 'deliveries').map(OrderDelivery.fromJson).toList(),
      shippingAddress: addr == null ? null : ShippingAddress.fromJson(addr),
      createdAt: DateTime.tryParse(str(j, 'createdAt')) ?? DateTime.now(),
    );
  }
}
