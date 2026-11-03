import 'json.dart';

// ─────────────────────────────────────────────
//  Demande d'ouverture de boutique — recopie de ShopRequestResponseDto
//  (Back/src/shared/interfaces/ShopRequest.interfaces.ts).
//
//  Un client la dépose depuis son compte ; l'administration l'approuve (la
//  boutique est créée, le compte devient gérant) ou la refuse, motif à
//  l'appui. La boutique se gère ensuite depuis l'espace boutique du site web.
// ─────────────────────────────────────────────

enum ShopRequestStatus {
  pending('pending', 'En attente'),
  approved('approved', 'Approuvée'),
  rejected('rejected', 'Refusée'),
  cancelled('cancelled', 'Annulée');

  const ShopRequestStatus(this.value, this.label);
  final String value;
  final String label;

  static ShopRequestStatus parse(String v) => ShopRequestStatus.values.firstWhere((s) => s.value == v, orElse: () => ShopRequestStatus.pending);
}

const sellerTypes = {'particulier': 'Particulier', 'entreprise': 'Entreprise'};

const sellerExperiences = {'debutant': "Je démarre (moins d'un an)", '1_3_ans': 'De 1 à 3 ans', '3_10_ans': 'De 3 à 10 ans', 'plus_10_ans': 'Plus de 10 ans'};

const catalogSizes = {'moins_50': 'Moins de 50 produits', '50_200': 'De 50 à 200 produits', 'plus_200': 'Plus de 200 produits'};

class ShopRequest {
  const ShopRequest({
    required this.id,
    required this.nom,
    required this.description,
    this.familles = const [],
    required this.sellerType,
    this.rccm,
    required this.experience,
    required this.catalogSize,
    required this.hasPhysicalStore,
    required this.adresse,
    this.email,
    this.message,
    required this.status,
    this.rejectionReason,
    this.reviewedAt,
    this.shopId,
    required this.createdAt,
  });

  final String id;
  final String nom;
  final String description;

  /// Domaines du catalogue ; le nom est présent quand le back les a chargés.
  final List<String> familles;
  final String sellerType;
  final String? rccm;
  final String experience;
  final String catalogSize;
  final bool hasPhysicalStore;
  final String adresse;
  final String? email;
  final String? message;
  final ShopRequestStatus status;
  final String? rejectionReason;
  final DateTime? reviewedAt;

  /// Boutique ouverte à l'approbation.
  final String? shopId;
  final DateTime createdAt;

  factory ShopRequest.fromJson(Json j) => ShopRequest(
    id: anyId(j),
    nom: str(j, 'nom'),
    description: str(j, 'description'),
    familles: objects(j, 'familles').map((f) => str(f, 'nom', str(f, 'id'))).toList(),
    sellerType: str(j, 'sellerType', 'particulier'),
    rccm: strOrNull(j, 'rccm'),
    experience: str(j, 'experience', 'debutant'),
    catalogSize: str(j, 'catalogSize', 'moins_50'),
    hasPhysicalStore: boolean(j, 'hasPhysicalStore'),
    adresse: str(j, 'adresse'),
    email: strOrNull(j, 'email'),
    message: strOrNull(j, 'message'),
    status: ShopRequestStatus.parse(str(j, 'status')),
    rejectionReason: strOrNull(j, 'rejectionReason'),
    reviewedAt: DateTime.tryParse(str(j, 'reviewedAt')),
    shopId: strOrNull(j, 'shopId'),
    createdAt: DateTime.tryParse(str(j, 'createdAt')) ?? DateTime.now(),
  );
}
