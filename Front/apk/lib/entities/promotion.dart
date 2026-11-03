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
    this.boutiqueNom,
    this.flashLeft,
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

  /// Vente flash d'une boutique (absente pour celles de la plateforme).
  final String? boutiqueNom;

  /// Vente flash : unités encore vendues au prix flash.
  final int? flashLeft;

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
    boutiqueNom: strOrNull(object(j, 'boutique') ?? const {}, 'nom'),
    flashLeft: j['flashLeft'] == null ? null : integer(j, 'flashLeft'),
  );
}

/// Campagne de la plateforme (« Rentrée chantier ») : les boutiques y
/// inscrivent leurs offres avec au moins la remise demandée.
class Campaign {
  const Campaign({
    required this.id,
    required this.slug,
    required this.nom,
    this.description,
    required this.startDate,
    required this.endDate,
    required this.minDiscount,
    required this.state,
    this.offerCount = 0,
  });

  final String id;
  final String slug;
  final String nom;
  final String? description;
  final DateTime startDate;
  final DateTime endDate;
  final double minDiscount;

  /// `upcoming` | `running` | `ended`
  final String state;
  final int offerCount;

  bool get isRunning => state == 'running';
  String get stateLabel => switch (state) {
    'upcoming' => 'À venir',
    'running' => 'En cours',
    _ => 'Terminée',
  };

  factory Campaign.fromJson(Json j) => Campaign(
    id: anyId(j),
    slug: str(j, 'slug'),
    nom: str(j, 'nom'),
    description: strOrNull(j, 'description'),
    startDate: DateTime.tryParse(str(j, 'startDate')) ?? DateTime.now(),
    endDate: DateTime.tryParse(str(j, 'endDate')) ?? DateTime.now(),
    minDiscount: number(j, 'minDiscount'),
    state: str(j, 'state', 'running'),
    offerCount: integer(j, 'offerCount'),
  );
}
