import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../shared/api/api_client.dart';

// ─────────────────────────────────────────────
//  Dépendances racine, fournies par main() après l'initialisation
//  asynchrone (client HTTP ou simulé, préférences).
// ─────────────────────────────────────────────
final apiClientProvider = Provider<ApiClient>((ref) => throw UnimplementedError('fourni par main()'));
final prefsProvider = Provider<SharedPreferences>((ref) => throw UnimplementedError('fourni par main()'));

/// Thème : suit le système tant que l'utilisateur n'a rien choisi
/// (clé `btp.theme`, comme sur le web).
class ThemeModeController extends Notifier<ThemeMode> {
  static const _key = 'btp.theme';

  @override
  ThemeMode build() => switch (ref.read(prefsProvider).getString(_key)) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      };

  void set(ThemeMode mode) {
    state = mode;
    final prefs = ref.read(prefsProvider);
    if (mode == ThemeMode.system) {
      prefs.remove(_key);
    } else {
      prefs.setString(_key, mode == ThemeMode.dark ? 'dark' : 'light');
    }
  }
}

final themeModeProvider = NotifierProvider<ThemeModeController, ThemeMode>(ThemeModeController.new);

/// Présentation (onboarding) déjà vue sur cet appareil : clé `btp.onboarded`.
/// Elle ne s'affiche qu'au premier lancement ; Paramètres permet de la revoir.
class OnboardingController extends Notifier<bool> {
  static const _key = 'btp.onboarded';

  @override
  bool build() => ref.read(prefsProvider).getBool(_key) ?? false;

  void complete() {
    state = true;
    ref.read(prefsProvider).setBool(_key, true);
  }
}

final onboardedProvider = NotifierProvider<OnboardingController, bool>(OnboardingController.new);
