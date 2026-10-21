// ─────────────────────────────────────────────
//  Règles de saisie — recopie de Back/src/shared/forms/auth.form.ts
//  (express-validator), mêmes bornes, mêmes messages. Toute divergence
//  produirait un 422 que l'utilisateur ne comprendrait pas.
// ─────────────────────────────────────────────

const specialCharacters = r'!@#$%^&*';

String? requiredEmail(String? value) {
  final v = value?.trim() ?? '';
  if (v.isEmpty) return "L'email est requis.";
  if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v)) return 'Email invalide.';
  return null;
}

String? requiredText(String? value, String message) => (value == null || value.trim().isEmpty) ? message : null;

/// Nom et prénom : 2 à 50 caractères.
String? personName(String? value) {
  final v = value?.trim() ?? '';
  return (v.length < 2 || v.length > 50) ? 'Entre 2 et 50 caractères.' : null;
}

/// Téléphone : 9 à 12 caractères.
String? phone(String? value) {
  final v = value?.trim() ?? '';
  return (v.length < 9 || v.length > 12) ? 'Entre 9 et 12 caractères.' : null;
}

String? newPassword(String? value) {
  final v = value ?? '';
  if (v.length < 8) return 'Minimum 8 caractères.';
  if (!RegExp('[A-Z]').hasMatch(v)) return 'Au moins une majuscule.';
  if (!RegExp('[0-9]').hasMatch(v)) return 'Au moins un chiffre.';
  if (!RegExp(r'[!@#$%^&*]').hasMatch(v)) return 'Au moins un caractère spécial ($specialCharacters).';
  return null;
}

String? Function(String?) confirmation(String Function() other) =>
    (value) => (value ?? '').isEmpty
        ? 'La confirmation est requise.'
        : value != other()
            ? 'Les mots de passe ne correspondent pas.'
            : null;

/// Détail des règles, pour la liste cochée en direct.
List<(String, bool)> passwordChecks(String value) => [
      ('8 caractères', value.length >= 8),
      ('Une majuscule', RegExp('[A-Z]').hasMatch(value)),
      ('Un chiffre', RegExp('[0-9]').hasMatch(value)),
      ('Un caractère spécial $specialCharacters', RegExp(r'[!@#$%^&*]').hasMatch(value)),
    ];

/// Champ facultatif borné : null = valide.
String? maxLength(String? value, int max) => (value ?? '').trim().length > max ? 'Maximum $max caractères.' : null;
