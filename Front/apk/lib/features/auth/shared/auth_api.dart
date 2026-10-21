import '../../../entities/user.dart';
import '../../../shared/api/api_client.dart';

// Appels d'authentification — routes /auth/* du back.
class AuthApi {
  const AuthApi(this._api);

  final ApiClient _api;

  /// Profil du titulaire de la session. Lève une ApiException 401 sinon.
  Future<User> me() async => User.fromJson((await _api.get('/auth/me')).map);

  Future<User> login(String email, String password) async {
    final res = await _api.post('/auth/login', {'email': email.trim(), 'password': password});
    return User.fromJson((res.map['user'] as Map).cast<String, dynamic>());
  }

  /// Renvoie le lien de vérification que le mode simulé expose (le vrai back l'envoie par email).
  Future<String?> register({required String prenom, required String nom, required String email, required String telephone, required String password}) async {
    final res = await _api.post('/auth/register', {
      'prenom': prenom.trim(),
      'nom': nom.trim(),
      'email': email.trim(),
      'telephone': telephone.trim(),
      'password': password,
    });
    return res.data is Map ? res.map['verifyLink'] as String? : null;
  }

  Future<void> logout() => _api.post('/auth/logout');

  Future<void> logoutAll() => _api.post('/auth/logout-all');

  Future<String?> forgotPassword(String email) async {
    final res = await _api.post('/auth/forgot-password', {'email': email.trim()});
    return res.data is Map ? res.map['resetLink'] as String? : null;
  }

  Future<void> resetPassword(String token, String password) =>
      _api.put('/auth/reset-password/${Uri.encodeComponent(token)}', {'password': password, 'confirmPassword': password});

  Future<String> verifyEmail(String token) async =>
      (await _api.get('/auth/verify-email/${Uri.encodeComponent(token)}')).message;

  Future<String> resendVerification() async => (await _api.post('/auth/resend-verification')).message;

  /// PUT /auth/me — l'email ne se modifie pas : c'est l'identifiant de connexion.
  Future<User> updateProfile({required String prenom, required String nom, required String telephone}) async =>
      User.fromJson((await _api.put('/auth/me', {'prenom': prenom, 'nom': nom, 'telephone': telephone})).map);

  /// Le back ferme au passage les sessions des autres appareils.
  Future<String> changePassword(String current, String next) async => (await _api.put('/auth/change-password', {
        'currentPassword': current,
        'newPassword': next,
        'confirmNewPassword': next,
      }))
          .message;
}
