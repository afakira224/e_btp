import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../entities/delivery.dart';
import '../../../entities/json.dart';
import '../../../entities/order.dart';
import '../../../shared/api/api_client.dart';

// ─────────────────────────────────────────────
//  Passer commande — POST /orders/:userId, depuis le panier.
//
//  Le corps ne porte que des choix (un mode par boutique, une adresse, un
//  mode de paiement, un code) : prix, remises et frais sont recalculés par
//  le serveur. Un prix monté depuis l'ajout au panier répond 409 et le
//  panier est rafraîchi.
// ─────────────────────────────────────────────

/// Aperçu d'un code sur le panier, aux prix du moment ; le checkout le recalcule.
class CouponPreview {
  const CouponPreview({required this.code, required this.label, required this.discount, this.shopName});

  final String code;
  final String label;
  final double discount;

  /// Code d'une boutique : il ne vaut que sur ses articles.
  final String? shopName;

  factory CouponPreview.fromJson(Json j) {
    final promo = object(j, 'promotion') ?? const {};
    return CouponPreview(code: str(promo, 'code'), label: str(promo, 'nom'), discount: number(j, 'discountAmount'), shopName: strOrNull(object(j, 'boutique') ?? const {}, 'nom'));
  }
}

/// Commande créée ; payée en ligne, le serveur renvoie aussi la page du prestataire.
class PlacedOrder {
  const PlacedOrder({required this.order, this.redirectUrl, required this.message});

  final Order order;
  final String? redirectUrl;
  final String message;
}

class CheckoutApi {
  const CheckoutApi(this._api);

  final ApiClient _api;

  Future<CouponPreview> previewCoupon(String userId, String code) async => CouponPreview.fromJson((await _api.post('/promotions/apply', {'userId': userId, 'code': code})).map);

  Future<PlacedOrder> placeOrder(String userId, {required Map<String, DeliveryMode> deliveries, String? addressId, String? telephone, required PaymentMethod paymentMethod, String? code}) async {
    final response = await _api.post('/orders/${Uri.encodeComponent(userId)}', {
      'deliveries': [
        for (final e in deliveries.entries) {'boutiqueId': e.key, 'method': e.value.value},
      ],
      'addressId': ?addressId,
      'telephone': ?telephone,
      'paymentMethod': paymentMethod.value,
      'code': ?code,
    });
    final data = response.map;
    return PlacedOrder(order: Order.fromJson(data), redirectUrl: strOrNull(object(data, 'payment') ?? const {}, 'redirectUrl'), message: response.message);
  }
}

final checkoutApiProvider = Provider((ref) => CheckoutApi(ref.watch(apiClientProvider)));

/// Page de paiement : celle de l'application quand le prestataire est le
/// prestataire simulé du back (`…/paiement/:orderId`), sinon une page externe.
String? inAppPaymentOrderId(String? redirectUrl) {
  final uri = Uri.tryParse(redirectUrl ?? '');
  if (uri == null) return null;
  final s = uri.pathSegments;
  return s.length == 2 && s.first == 'paiement' ? s[1] : null;
}
