import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../entities/user.dart';
import '../../../shared/api/api_exception.dart';
import 'auth_api.dart';

enum AuthStatus { pending, authenticated, anonymous }

@immutable
class AuthState {
  const AuthState(this.status, [this.user]);

  final AuthStatus status;
  final User? user;

  bool get isAuthenticated => status == AuthStatus.authenticated;
}

final authApiProvider = Provider((ref) => AuthApi(ref.watch(apiClientProvider)));

// ─────────────────────────────────────────────
//  Source de vérité de l'identité.
//
//  Avec une session par cookie, l'app ne détient aucun jeton : seule la
//  réponse de /auth/me dit si l'on est connecté. Tant qu'elle n'est pas
//  arrivée, le statut reste « pending » et les gardes n'éjectent personne.
// ─────────────────────────────────────────────
class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    _load();
    return const AuthState(AuthStatus.pending);
  }

  Future<void> _load() async {
    try {
      final user = await ref.read(authApiProvider).me();
      state = AuthState(AuthStatus.authenticated, user);
    } on ApiException {
      // 401 = visiteur sans session : ce n'est pas une panne.
      state = const AuthState(AuthStatus.anonymous);
    } catch (_) {
      state = const AuthState(AuthStatus.anonymous);
    }
  }

  void setUser(User user) => state = AuthState(AuthStatus.authenticated, user);

  Future<void> refresh() => _load();

  Future<void> logout() async {
    try {
      await ref.read(authApiProvider).logout();
    } catch (_) {
      // Même en échec, on cesse de considérer l'utilisateur comme connecté.
    }
    state = const AuthState(AuthStatus.anonymous);
  }

  /// La session est déjà détruite côté serveur (logout-all, reset) : on
  /// remet seulement l'état local en anonyme.
  void signedOutElsewhere() => state = const AuthState(AuthStatus.anonymous);
}

final authProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);

/// Identifiant de l'utilisateur connecté, ou chaîne vide.
final currentUserIdProvider = Provider<String>((ref) => ref.watch(authProvider).user?.id ?? '');
