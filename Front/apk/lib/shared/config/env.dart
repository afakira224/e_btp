// ─────────────────────────────────────────────
//  Configuration de compilation.
//
//  Équivalents des variables VITE_* du front web, passées par
//  `--dart-define` :
//    flutter run --dart-define=USE_MOCK=false --dart-define=API_URL=https://…
//
//  Par défaut l'application tourne en mode simulé : elle n'a besoin ni du
//  back ni d'une base pour être essayée.
// ─────────────────────────────────────────────
abstract final class Env {
  /// Données simulées, comme VITE_USE_MOCK sur le web.
  static const bool useMock = bool.fromEnvironment('USE_MOCK', defaultValue: true);

  /// URL de base de l'API. 10.0.2.2 = la machine hôte vue de l'émulateur Android.
  static const String apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://10.0.2.2:5000/api/v1',
  );

  /// Domaine du site web : liens partagés et liens reçus par email.
  static const String webUrl = String.fromEnvironment(
    'WEB_URL',
    defaultValue: 'https://btp-platform.gn',
  );

  static const String appVersion = String.fromEnvironment('APP_VERSION', defaultValue: '1.0.0');
}
