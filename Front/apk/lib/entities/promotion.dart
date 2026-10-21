import 'json.dart';

// Promotion — recopie de Back/src/shared/interfaces/Promotion.interfaces.ts.
class Promotion {
  const Promotion({
    required this.id,
    required this.nom,
    this.description,
    required this.type,
    required this.discountType,
    required this.discountValue,
    required this.startDate,
    required this.endDate,
    this.productBoutiqueIds = const [],
    this.maxDiscount,
  });

  final String id;
  final String nom;
  final String? description;

  /// `coupon` | `flash_sale`
  final String type;

  /// `percentage` | `fixed`
  final String discountType;
  final double discountValue;
  final DateTime startDate;
  final DateTime endDate;
  final List<String> productBoutiqueIds;
  final double? maxDiscount;

  bool get isPercentage => discountType == 'percentage';

  factory Promotion.fromJson(Json j) => Promotion(
        id: anyId(j),
        nom: str(j, 'nom'),
        description: strOrNull(j, 'description'),
        type: str(j, 'type'),
        discountType: str(j, 'discountType', 'percentage'),
        discountValue: number(j, 'discountValue'),
        startDate: DateTime.tryParse(str(j, 'startDate')) ?? DateTime.now(),
        endDate: DateTime.tryParse(str(j, 'endDate')) ?? DateTime.now(),
        productBoutiqueIds: strings(j, 'productBoutiqueIds'),
        maxDiscount: numOrNull(j, 'maxDiscount'),
      );
}
