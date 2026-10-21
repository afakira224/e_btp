import 'json.dart';

// ─────────────────────────────────────────────
//  Utilisateur — recopie de la réponse de /auth/me et /auth/login
//  (Back/src/models/user.model.ts : document brut, `_id`).
// ─────────────────────────────────────────────

enum EntityType {
  user('user', 'Particulier'),
  shop('shop', 'Boutique'),
  admin('admin', 'Administrateur'),
  userSociete('user_societe', 'Société');

  const EntityType(this.value, this.label);
  final String value;
  final String label;

  static EntityType parse(String value) =>
      EntityType.values.firstWhere((e) => e.value == value, orElse: () => EntityType.user);
}

class User {
  const User({
    required this.id,
    required this.nom,
    required this.prenom,
    required this.email,
    this.telephone,
    this.avatar,
    required this.role,
    required this.isEmailVerified,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String nom;
  final String prenom;
  final String email;

  /// Téléphone du titulaire du compte : le sien, il peut l'afficher.
  final String? telephone;
  final String? avatar;
  final EntityType role;
  final bool isEmailVerified;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  String get fullName => '$prenom $nom'.trim();
  String get initials =>
      '${prenom.isEmpty ? '' : prenom[0]}${nom.isEmpty ? '' : nom[0]}'.toUpperCase();

  factory User.fromJson(Json j) => User(
        id: anyId(j),
        nom: str(j, 'nom'),
        prenom: str(j, 'prenom'),
        email: str(j, 'email'),
        telephone: strOrNull(j, 'telephone'),
        avatar: strOrNull(j, 'avatar'),
        role: EntityType.parse(str(j, 'role', 'user')),
        isEmailVerified: boolean(j, 'isEmailVerified'),
        createdAt: DateTime.tryParse(str(j, 'createdAt')),
        updatedAt: DateTime.tryParse(str(j, 'updatedAt')),
      );
}
