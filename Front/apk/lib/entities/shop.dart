import 'json.dart';

// ─────────────────────────────────────────────
//  Boutique — recopie de ShopResponseDto
//  (Back/src/shared/interfaces/Shop.interfaces.ts), à une exception près.
//
//  RÈGLE MÉTIER : le téléphone d'une boutique ne doit JAMAIS être affiché.
//  Le back l'envoie (GET /shops, GET /shops/:id, boutique imbriquée dans les
//  offres et les commandes) : il est volontairement absent de cette classe,
//  et `fromJson` ne lit que les champs listés ci-dessous. Ne pas l'ajouter.
//
//  `GET /shops` renvoie le document Mongoose brut (`_id`) et non le DTO
//  (`id`) : `anyId` accepte les deux.
// ─────────────────────────────────────────────
class Shop {
  const Shop({
    required this.id,
    required this.nom,
    this.ownerId = '',
    this.description,
    this.logo,
    this.email,
    this.adresse,
    this.createdAt,
  });

  final String id;
  final String nom;
  final String ownerId;
  final String? description;
  final String? logo;
  final String? email;
  final String? adresse;
  final DateTime? createdAt;

  /// Quartier : premier segment de l'adresse (« Matam, Conakry » → « Matam »).
  String? get district {
    final first = adresse?.split(',').first.trim();
    return (first == null || first.isEmpty) ? null : first;
  }

  /// « Dépôt Matam » → « DM ».
  String get initials => nom
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty)
      .take(2)
      .map((w) => w[0].toUpperCase())
      .join();

  /// Liste blanche : seuls ces champs sont repris, le téléphone est écarté.
  factory Shop.fromJson(Json j) => Shop(
        id: anyId(j),
        nom: str(j, 'nom'),
        ownerId: str(j, 'ownerId'),
        description: strOrNull(j, 'description'),
        logo: strOrNull(j, 'logo'),
        email: strOrNull(j, 'email'),
        adresse: strOrNull(j, 'adresse'),
        createdAt: DateTime.tryParse(str(j, 'createdAt')),
      );
}
