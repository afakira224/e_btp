import 'json.dart';
import 'product.dart';
import 'shop.dart';

// ─────────────────────────────────────────────
//  Commande — recopie de Back/src/shared/interfaces/Order.interfaces.ts et
//  des énumérations de Back/src/models/order.model.ts.
// ─────────────────────────────────────────────

enum OrderStatus {
  pending('pending', 'En attente', 'En attente'),
  confirmed('confirmed', 'Confirmée', 'Confirmées'),
  shipped('shipped', 'Expédiée', 'Expédiées'),
  delivered('delivered', 'Livrée', 'Livrées'),
  cancelled('cancelled', 'Annulée', 'Annulées');

  const OrderStatus(this.value, this.label, this.filterLabel);
  final String value;
  final String label;

  /// Un filtre désigne un ensemble : au pluriel.
  final String filterLabel;

  static OrderStatus parse(String v) =>
      OrderStatus.values.firstWhere((s) => s.value == v, orElse: () => OrderStatus.pending);

  /// Parcours normal ; l'annulation en sort.
  static const flow = [pending, confirmed, shipped, delivered];

  bool get inProgress => this != delivered && this != cancelled;
}

/// Mode résumé de la commande (Back/src/models/delivery.model.ts) : celui de
/// toutes ses livraisons, ou `mixed` quand les boutiques diffèrent.
/// `standard` et `express` sont ceux des commandes d'avant les modes par boutique.
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

class OrderItem {
  const OrderItem({this.productBoutique, this.boutique, this.productName, required this.price, required this.quantity, required this.lineTotal});

  /// Absente si l'offre a été supprimée depuis.
  final ProductBoutique? productBoutique;
  final Shop? boutique;
  final String? productName;
  final double price;
  final int quantity;
  final double lineTotal;

  String get name => productName ?? productBoutique?.product?.name ?? 'Article retiré du catalogue';

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

class ShippingAddress {
  const ShippingAddress({this.destinataire, required this.telephone, required this.adresse, required this.ville, this.commune, this.pays = 'Guinée'});

  final String? destinataire;

  /// Téléphone du destinataire, saisi par le client : affichable.
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
    this.items = const [],
    required this.totalItems,
    required this.subtotal,
    this.discountAmount = 0,
    this.promotionCode,
    this.shippingFee = 0,
    required this.amount,
    required this.deliveryMethod,
    this.shippingAddress,
    required this.createdAt,
  });

  final String id;
  final String reference;
  final OrderStatus status;
  final List<OrderStep> statusHistory;
  final List<OrderItem> items;
  final int totalItems;
  final double subtotal;
  final double discountAmount;
  final String? promotionCode;
  final double shippingFee;

  /// subtotal − discountAmount + shippingFee.
  final double amount;
  final DeliveryMethod deliveryMethod;
  final ShippingAddress? shippingAddress;
  final DateTime createdAt;

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
      items: objects(j, 'items').map(OrderItem.fromJson).toList(),
      totalItems: integer(j, 'totalItems'),
      subtotal: number(j, 'subtotal'),
      discountAmount: number(j, 'discountAmount'),
      promotionCode: strOrNull(j, 'promotionCode'),
      shippingFee: number(j, 'shippingFee'),
      amount: number(j, 'amount'),
      deliveryMethod: DeliveryMethod.parse(str(j, 'deliveryMethod')),
      shippingAddress: addr == null ? null : ShippingAddress.fromJson(addr),
      createdAt: DateTime.tryParse(str(j, 'createdAt')) ?? DateTime.now(),
    );
  }
}
