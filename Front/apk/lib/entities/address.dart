import 'json.dart';

// Adresse de livraison — recopie de Back/src/shared/interfaces/Address.interfaces.ts.
// Le téléphone est celui du destinataire, saisi par le client lui-même.
class Address {
  const Address({
    required this.id,
    this.label,
    this.destinataire,
    required this.telephone,
    required this.adresse,
    required this.ville,
    this.commune,
    this.pays = 'Guinée',
    this.isDefault = false,
  });

  final String id;
  final String? label;
  final String? destinataire;
  final String telephone;
  final String adresse;
  final String ville;
  final String? commune;
  final String pays;
  final bool isDefault;

  String get displayLabel => (label == null || label!.isEmpty) ? 'Adresse' : label!;

  /// « commune, ville » — puis le pays s'il n'est pas la Guinée.
  String get locality =>
      [commune, ville, pays != 'Guinée' ? pays : null].where((s) => s != null && s.isNotEmpty).join(', ');

  factory Address.fromJson(Json j) => Address(
        id: anyId(j),
        label: strOrNull(j, 'label'),
        destinataire: strOrNull(j, 'destinataire'),
        telephone: str(j, 'telephone'),
        adresse: str(j, 'adresse'),
        ville: str(j, 'ville'),
        commune: strOrNull(j, 'commune'),
        pays: str(j, 'pays', 'Guinée'),
        isDefault: boolean(j, 'isDefault'),
      );
}

/// Ce que le client saisit ; le reste est géré par le serveur.
/// Recopie des règles de Back/src/shared/forms/address.form.ts.
class AddressInput {
  const AddressInput({
    this.label,
    this.destinataire,
    required this.telephone,
    required this.adresse,
    required this.ville,
    this.commune,
    this.pays = 'Guinée',
    this.isDefault = false,
  });

  final String? label;
  final String? destinataire;
  final String telephone;
  final String adresse;
  final String ville;
  final String? commune;
  final String pays;
  final bool isDefault;

  Json toJson() => {
        if (label != null) 'label': label,
        if (destinataire != null) 'destinataire': destinataire,
        'telephone': telephone,
        'adresse': adresse,
        'ville': ville,
        if (commune != null) 'commune': commune,
        'pays': pays,
        'isDefault': isDefault,
      };
}
