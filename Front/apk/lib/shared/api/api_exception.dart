/// Erreur renvoyée par l'API, ou par le client quand le serveur est
/// injoignable (statusCode 0). Le message du back est affiché tel quel.
class ApiException implements Exception {
  const ApiException(this.message, this.statusCode);

  final String message;
  final int statusCode;

  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isNotFound => statusCode == 404;
  bool get isNetwork => statusCode == 0;

  @override
  String toString() => message;
}

/// Message lisible pour n'importe quelle erreur attrapée dans un écran.
String errorMessage(Object error) =>
    error is ApiException ? error.message : 'Une erreur est survenue. Réessayez.';
