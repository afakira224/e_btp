// ─────────────────────────────────────────────
//  Point d'entrée unique des appels réseau.
//
//  Deux implémentations, même interface, même enveloppe BaseResponse du
//  back ({ success, message, statusCode, data }), mêmes ApiException :
//  HttpApiClient (Dio + cookie de session) et MockApiClient (données
//  simulées). Les features ne savent pas laquelle est active.
//
//  Le seul lien avec le back est ce contrat HTTP : aucun code partagé.
// ─────────────────────────────────────────────
class ApiResponse {
  const ApiResponse({
    required this.success,
    required this.message,
    required this.statusCode,
    this.data,
  });

  final bool success;
  final String message;
  final int statusCode;

  /// Contenu JSON décodé (Map, List, null…).
  final Object? data;

  Map<String, dynamic> get map => (data as Map).cast<String, dynamic>();
  List<dynamic> get list => (data as List?) ?? const [];
}

abstract interface class ApiClient {
  Future<ApiResponse> get(String path);
  Future<ApiResponse> post(String path, [Object? body]);
  Future<ApiResponse> put(String path, [Object? body]);
  Future<ApiResponse> patch(String path, [Object? body]);
  Future<ApiResponse> delete(String path);
}

/// Construit une chaîne de requête en ignorant les valeurs vides.
String query(Map<String, Object?> params) {
  final entries = params.entries
      .where((e) => e.value != null && e.value.toString().isNotEmpty)
      .map((e) => '${Uri.encodeQueryComponent(e.key)}=${Uri.encodeQueryComponent(e.value.toString())}');
  final joined = entries.join('&');
  return joined.isEmpty ? '' : '?$joined';
}
