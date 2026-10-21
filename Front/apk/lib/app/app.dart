import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'providers.dart';
import 'router.dart';
import 'theme/theme.dart';

class BtpApp extends ConsumerWidget {
  const BtpApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'BTP',
      debugShowCheckedModeBanner: false,
      theme: lightTheme,
      darkTheme: darkTheme,
      themeMode: ref.watch(themeModeProvider),
      routerConfig: ref.watch(routerProvider),
      locale: const Locale('fr', 'FR'),
      supportedLocales: const [Locale('fr', 'FR')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      // Le texte agrandi par l'utilisateur est respecté, jusqu'à 200 %.
      builder: (context, child) {
        final media = MediaQuery.of(context);
        return MediaQuery(
          data: media.copyWith(textScaler: media.textScaler.clamp(maxScaleFactor: 2.0)),
          child: child!,
        );
      },
    );
  }
}
