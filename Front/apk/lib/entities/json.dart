// Lecture tolérante du JSON : un champ absent ou d'un autre type ne fait
// pas planter le décodage — un ajout côté back ne casse pas l'application.

typedef Json = Map<String, dynamic>;

String str(Json j, String key, [String fallback = '']) {
  final v = j[key];
  return v == null ? fallback : v.toString();
}

String? strOrNull(Json j, String key) {
  final v = j[key];
  if (v == null) return null;
  final s = v.toString();
  return s.isEmpty ? null : s;
}

int integer(Json j, String key, [int fallback = 0]) {
  final v = j[key];
  if (v is int) return v;
  if (v is num) return v.round();
  if (v is String) return int.tryParse(v) ?? fallback;
  return fallback;
}

double? numOrNull(Json j, String key) {
  final v = j[key];
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v);
  return null;
}

double number(Json j, String key, [double fallback = 0]) => numOrNull(j, key) ?? fallback;

bool boolean(Json j, String key, [bool fallback = false]) {
  final v = j[key];
  return v is bool ? v : fallback;
}

List<Json> objects(Json j, String key) {
  final v = j[key];
  if (v is! List) return const [];
  return v.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList();
}

List<String> strings(Json j, String key) {
  final v = j[key];
  if (v is! List) return const [];
  return v.map((e) => e.toString()).toList();
}

Json? object(Json j, String key) {
  final v = j[key];
  return v is Map ? v.cast<String, dynamic>() : null;
}

/// Identifiant d'un DTO (`id`) ou d'un document Mongoose brut (`_id`).
String anyId(Json j) => str(j, 'id', str(j, '_id'));
