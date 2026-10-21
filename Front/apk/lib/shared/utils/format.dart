import 'package:intl/intl.dart';

// ─────────────────────────────────────────────
//  Formats français, identiques au web (section 12 du cahier des charges).
// ─────────────────────────────────────────────

final _gnf = NumberFormat.decimalPattern('fr');

/// Francs guinéens, sans décimale, espace insécable entre les milliers.
String formatPrice(num amount) => '${_gnf.format(amount.round())} GNF';

/// Espace fine insécable avant « % » : jamais coupé en fin de ligne.
String formatPercent(num value) => '${value.round()} %';

/// « 24 septembre 2026 »
String formatDate(DateTime date) => DateFormat('d MMMM y', 'fr').format(date.toLocal());

/// « 24 sept., 14:30 » — pour les étapes d'une commande.
String formatDateTime(DateTime date) => DateFormat('d MMM, HH:mm', 'fr').format(date.toLocal());

/// « septembre 2026 »
String formatMonthYear(DateTime date) => DateFormat('MMMM y', 'fr').format(date.toLocal());

/// « Jusqu'au samedi 26 septembre à 02:01 »
String formatLongDateTime(DateTime date) => DateFormat("EEEE d MMMM 'à' HH:mm", 'fr').format(date.toLocal());

/// « aujourd'hui », « hier », « il y a 3 jours », « il y a 2 semaines »…
String arrivedAgo(DateTime date) {
  final days = DateTime.now().difference(date).inDays;
  if (days <= 0) return "aujourd'hui";
  if (days == 1) return 'hier';
  if (days == 2) return 'avant-hier';
  if (days < 7) return 'il y a $days jours';
  if (days < 60) {
    final weeks = days ~/ 7;
    return weeks == 1 ? 'la semaine dernière' : 'il y a $weeks semaines';
  }
  final months = days ~/ 30;
  return months == 1 ? 'le mois dernier' : 'il y a $months mois';
}

String plural(int count, String singular, [String? pluralForm]) =>
    '$count ${count > 1 ? (pluralForm ?? '${singular}s') : singular}';

/// Forme de comparaison : minuscules, sans accents ni espaces superflus.
String normalize(String value) {
  const from = 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ';
  const to = 'aaaaaaceeeeiiiinooooouuuuyyoa';
  final lower = value.toLowerCase();
  final buffer = StringBuffer();
  for (final rune in lower.runes) {
    final char = String.fromCharCode(rune);
    final index = from.indexOf(char);
    buffer.write(index >= 0 ? to[index] : char);
  }
  return buffer.toString().replaceAll(RegExp(r'\s+'), ' ').trim();
}
