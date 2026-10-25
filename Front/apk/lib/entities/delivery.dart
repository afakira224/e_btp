import '../shared/utils/format.dart';
import 'json.dart';

// ─────────────────────────────────────────────
//  Livraison — recopie de Back/src/models/delivery.model.ts et du devis
//  POST /cart/:userId/delivery-quote (Delivery.interfaces.ts).
//
//  L'application n'est jamais la source des frais : elle affiche ceux que
//  le serveur calcule et n'envoie que des modes, jamais de montant.
//  Une livraison par boutique : ses articles partent ensemble, le prix fixe
//  est facturé une fois.
// ─────────────────────────────────────────────

/// Les trois modes qu'une boutique ou un produit peut proposer, dans l'ordre d'affichage du back.
enum DeliveryMode {
  pickup('pickup', 'Retrait en boutique', 'Retrait'),
  free('free', 'Livraison gratuite', 'Livrée'),
  flatRate('flat_rate', 'Livraison à prix fixe', 'Livrée');

  const DeliveryMode(this.value, this.label, this.shortLabel);
  final String value;
  final String label;

  /// Libellé court, pour un sélecteur étroit.
  final String shortLabel;

  static DeliveryMode? tryParse(String? v) => DeliveryMode.values.where((m) => m.value == v).firstOrNull;
}

/// « Gratuit » plutôt que « 0 GNF » : c'est ce que le client veut lire.
String formatFee(double fee) => fee > 0 ? formatPrice(fee) : 'Gratuit';

/// Un mode proposé et ses frais, calculés par le serveur.
class DeliveryOption {
  const DeliveryOption({required this.method, required this.fee});

  final DeliveryMode method;
  final double fee;
}

/// La livraison d'une boutique : ses articles et les modes qu'ils acceptent tous.
class DeliveryGroupQuote {
  const DeliveryGroupQuote({
    required this.boutiqueId,
    this.boutiqueNom,
    this.pickupAdresse,
    this.productBoutiqueIds = const [],
    this.options = const [],
    this.selectedMethod,
    this.fee,
    this.error,
  });

  final String boutiqueId;
  final String? boutiqueNom;
  final String? pickupAdresse;
  final List<String> productBoutiqueIds;
  final List<DeliveryOption> options;

  /// Null tant qu'aucun mode valide n'est retenu.
  final DeliveryMode? selectedMethod;
  final double? fee;

  /// Ce qui empêche cette livraison de partir.
  final String? error;

  factory DeliveryGroupQuote.fromJson(Json j) => DeliveryGroupQuote(
        boutiqueId: str(j, 'boutiqueId'),
        boutiqueNom: strOrNull(j, 'boutiqueNom'),
        pickupAdresse: strOrNull(j, 'pickupAdresse'),
        productBoutiqueIds: objects(j, 'items').map((i) => str(i, 'productBoutiqueId')).toList(),
        options: [
          for (final o in objects(j, 'options'))
            if (DeliveryMode.tryParse(strOrNull(o, 'method')) case final method?) DeliveryOption(method: method, fee: number(o, 'fee')),
        ],
        selectedMethod: DeliveryMode.tryParse(strOrNull(j, 'selectedMethod')),
        fee: numOrNull(j, 'fee'),
        error: strOrNull(j, 'error'),
      );
}

class DeliveryQuote {
  const DeliveryQuote({this.groups = const [], this.shippingFee = 0, this.ready = false, this.subtotal = 0, this.total = 0});

  final List<DeliveryGroupQuote> groups;
  final double shippingFee;

  /// Toutes les livraisons ont un mode valide : la commande peut partir.
  final bool ready;
  final double subtotal;
  final double total;

  /// La livraison qui emporte cet article.
  DeliveryGroupQuote? groupOf(String productBoutiqueId) =>
      groups.where((g) => g.productBoutiqueIds.contains(productBoutiqueId)).firstOrNull;

  factory DeliveryQuote.fromJson(Json j) => DeliveryQuote(
        groups: objects(j, 'groups').map(DeliveryGroupQuote.fromJson).toList(),
        shippingFee: number(j, 'shippingFee'),
        ready: boolean(j, 'ready'),
        subtotal: number(j, 'subtotal'),
        total: number(j, 'total'),
      );
}
