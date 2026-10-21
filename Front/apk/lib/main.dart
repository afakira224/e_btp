import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/app.dart';
import 'app/providers.dart';
import 'shared/api/api_client.dart';
import 'shared/api/http_api_client.dart';
import 'shared/api/mock/mock_api_client.dart';
import 'shared/config/env.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('fr');
  final prefs = await SharedPreferences.getInstance();
  // Mode simulé par défaut : l'app tourne sans back. Le front ne connaît du
  // back que ses DTO et ses formulaires, recopiés dans lib/entities.
  final ApiClient api = Env.useMock ? await MockApiClient.create() : await HttpApiClient.create(Env.apiUrl);

  runApp(ProviderScope(
    // Pas de nouvel essai automatique : une erreur s'affiche avec « Réessayer ».
    retry: (_, _) => null,
    overrides: [
      apiClientProvider.overrideWithValue(api),
      prefsProvider.overrideWithValue(prefs),
    ],
    child: const BtpApp(),
  ));
}
