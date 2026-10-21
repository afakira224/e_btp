import 'json.dart';

// ─────────────────────────────────────────────
//  Taxonomie Famille > Catégorie > Sous-catégorie — recopie de
//  Back/src/shared/interfaces/{Famille,Categorie,SousCategorie}.interfaces.ts.
// ─────────────────────────────────────────────

class SousCategorie {
  const SousCategorie({required this.id, required this.nom, this.description, this.ordre = 0, this.actif = true});

  final String id;
  final String nom;
  final String? description;
  final int ordre;
  final bool actif;

  factory SousCategorie.fromJson(Json j) => SousCategorie(
        id: anyId(j),
        nom: str(j, 'nom'),
        description: strOrNull(j, 'description'),
        ordre: integer(j, 'ordre'),
        actif: boolean(j, 'actif', true),
      );
}

class Categorie {
  const Categorie({
    required this.id,
    required this.familleId,
    required this.nom,
    this.description,
    this.sousCategories = const [],
    this.ordre = 0,
    this.actif = true,
  });

  final String id;
  final String familleId;
  final String nom;
  final String? description;
  final List<SousCategorie> sousCategories;
  final int ordre;
  final bool actif;

  factory Categorie.fromJson(Json j) => Categorie(
        id: anyId(j),
        familleId: str(j, 'familleId'),
        nom: str(j, 'nom'),
        description: strOrNull(j, 'description'),
        sousCategories: objects(j, 'sousCategories').map(SousCategorie.fromJson).toList(),
        ordre: integer(j, 'ordre'),
        actif: boolean(j, 'actif', true),
      );
}

class Famille {
  const Famille({
    required this.id,
    required this.nom,
    this.description,
    this.categories = const [],
    this.ordre = 0,
    this.actif = true,
  });

  final String id;
  final String nom;
  final String? description;
  final List<Categorie> categories;
  final int ordre;
  final bool actif;

  factory Famille.fromJson(Json j) => Famille(
        id: anyId(j),
        nom: str(j, 'nom'),
        description: strOrNull(j, 'description'),
        categories: objects(j, 'categories').map(Categorie.fromJson).toList(),
        ordre: integer(j, 'ordre'),
        actif: boolean(j, 'actif', true),
      );
}
