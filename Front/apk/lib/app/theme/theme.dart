import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import 'tokens.dart';

// ─────────────────────────────────────────────
//  Thème Material 3 dérivé des jetons Platinum Mist, réglé pour le mobile :
//  cibles tactiles de 48 dp, boutons principaux de 52 dp, feuilles du bas
//  arrondies à 16, transitions natives de chaque plateforme. Hiérarchie par
//  le contraste, l'espace et la typographie — ni dégradé, ni ombre forte.
// ─────────────────────────────────────────────

/// Typographie des compteurs, références et prix barrés : IBM Plex Mono.
TextStyle monoStyle(BuildContext context, {double size = 12, Color? color, FontWeight weight = FontWeight.w400}) =>
    GoogleFonts.ibmPlexMono(
      fontSize: size,
      letterSpacing: size * 0.04,
      fontWeight: weight,
      color: color ?? context.tokens.textMuted,
      fontFeatures: const [FontFeature.tabularFigures()],
    );

/// Barre d'état claire sur l'en-tête anthracite.
SystemUiOverlayStyle chromeOverlay(BtpTokens t) => SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      statusBarBrightness: Brightness.dark,
      systemNavigationBarColor: t.chrome,
      systemNavigationBarIconBrightness: Brightness.light,
    );

/// Barre d'état des écrans clairs (fiche, formulaires).
SystemUiOverlayStyle surfaceOverlay(BtpTokens t, Brightness b) => SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: b == Brightness.light ? Brightness.dark : Brightness.light,
      statusBarBrightness: b,
      systemNavigationBarColor: t.chrome,
      systemNavigationBarIconBrightness: Brightness.light,
    );

ThemeData buildTheme(BtpTokens t, Brightness brightness) {
  final base = ThemeData(brightness: brightness, useMaterial3: true);
  // google_fonts 9 expose un TextTheme de material_ui, distinct de celui de
  // Flutter : on ne lui emprunte que la famille de police.
  final text = base.textTheme.apply(fontFamily: GoogleFonts.inter().fontFamily, bodyColor: t.text, displayColor: t.text);

  final scheme = ColorScheme(
    brightness: brightness,
    primary: t.primary,
    onPrimary: t.primaryText,
    secondary: t.textMuted,
    onSecondary: t.primaryText,
    error: t.danger,
    onError: t.surface,
    surface: t.surface,
    onSurface: t.text,
    surfaceContainerHighest: t.surfaceAlt,
    surfaceContainerHigh: t.surface,
    surfaceContainer: t.surface,
    surfaceContainerLow: t.surface,
    outline: t.border,
    outlineVariant: t.border,
  );

  final shape6 = RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.sm));
  const buttonPadding = EdgeInsets.symmetric(horizontal: Space.s5, vertical: Space.s3);
  const minButton = Size(48, 52);

  OutlineInputBorder field(Color c, [double w = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(Radii.sm),
        borderSide: BorderSide(color: c, width: w),
      );

  return base.copyWith(
    colorScheme: scheme,
    scaffoldBackgroundColor: t.background,
    textTheme: text.copyWith(
      headlineLarge: text.headlineLarge?.copyWith(fontSize: 30, fontWeight: FontWeight.w700, letterSpacing: -0.8, height: 1.15),
      headlineMedium: text.headlineMedium?.copyWith(fontSize: 26, fontWeight: FontWeight.w700, letterSpacing: -0.6, height: 1.2),
      headlineSmall: text.headlineSmall?.copyWith(fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.4),
      titleLarge: text.titleLarge?.copyWith(fontSize: 19, fontWeight: FontWeight.w700, letterSpacing: -0.3),
      titleMedium: text.titleMedium?.copyWith(fontSize: 16, fontWeight: FontWeight.w600),
      titleSmall: text.titleSmall?.copyWith(fontSize: 14, fontWeight: FontWeight.w600),
      bodyLarge: text.bodyLarge?.copyWith(fontSize: 16, height: 1.45),
      bodyMedium: text.bodyMedium?.copyWith(fontSize: 14, height: 1.45),
      bodySmall: text.bodySmall?.copyWith(fontSize: 12, color: t.textMuted),
      labelLarge: text.labelLarge?.copyWith(fontSize: 15, fontWeight: FontWeight.w600),
    ),
    extensions: [t],
    // Transitions natives : glissé iOS, retour prédictif Android.
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.android: PredictiveBackPageTransitionsBuilder(),
      TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
    }),
    dividerTheme: DividerThemeData(color: t.border.withValues(alpha: 0.6), thickness: 1, space: 1),
    // Écrans poussés : barre de la couleur du fond, qui se détache au défilement.
    appBarTheme: AppBarTheme(
      backgroundColor: WidgetStateColor.resolveWith((s) => s.contains(WidgetState.scrolledUnder) ? t.surface : t.background),
      foregroundColor: t.text,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      shadowColor: t.border,
      centerTitle: false,
      systemOverlayStyle: surfaceOverlay(t, brightness),
      titleTextStyle: text.titleMedium?.copyWith(fontSize: 18, fontWeight: FontWeight.w700, color: t.text, letterSpacing: -0.2),
    ),
    // Boutons : principal plein, secondaire bordé, fantôme discret — rayon 6.
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: t.primary,
        foregroundColor: t.primaryText,
        disabledBackgroundColor: t.surfaceAlt,
        disabledForegroundColor: t.textMuted,
        shape: shape6,
        padding: buttonPadding,
        minimumSize: minButton,
        textStyle: text.labelLarge?.copyWith(fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: t.text,
        side: BorderSide(color: t.border),
        shape: shape6,
        padding: buttonPadding,
        minimumSize: minButton,
        textStyle: text.labelLarge?.copyWith(fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: t.text,
        shape: shape6,
        padding: const EdgeInsets.symmetric(horizontal: Space.s3, vertical: Space.s2),
        minimumSize: const Size(48, 44),
        textStyle: text.labelLarge?.copyWith(fontWeight: FontWeight.w600, fontSize: 14),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(minimumSize: const Size(48, 48))),
    cardTheme: CardThemeData(
      color: t.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md), side: BorderSide(color: t.border.withValues(alpha: 0.7))),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: t.surface,
      hintStyle: TextStyle(color: t.textMuted),
      contentPadding: const EdgeInsets.symmetric(horizontal: Space.s4, vertical: 15),
      border: field(t.border),
      enabledBorder: field(t.border),
      focusedBorder: field(t.primary, 1.5),
      errorBorder: field(t.danger),
      focusedErrorBorder: field(t.danger, 1.5),
      errorStyle: TextStyle(color: t.danger, fontSize: 12),
      errorMaxLines: 3,
    ),
    chipTheme: ChipThemeData(
      backgroundColor: t.surface,
      selectedColor: t.primary,
      labelStyle: TextStyle(color: t.text, fontSize: 14, fontWeight: FontWeight.w500),
      secondaryLabelStyle: TextStyle(color: t.primaryText, fontSize: 14, fontWeight: FontWeight.w600),
      side: BorderSide(color: t.border),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      showCheckmark: false,
      padding: const EdgeInsets.symmetric(horizontal: Space.s2, vertical: Space.s1),
    ),
    // Barre d'onglets anthracite, onglet actif en pastille Platinum Soft (charte §9).
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: t.chrome,
      surfaceTintColor: Colors.transparent,
      indicatorColor: t.chromeIndicator,
      indicatorShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
      elevation: 0,
      height: 66,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(
          fontSize: 11.5,
          fontWeight: s.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
          color: s.contains(WidgetState.selected) ? t.onChrome : t.onChromeMuted,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(size: 24, color: s.contains(WidgetState.selected) ? t.onChromeIndicator : t.onChromeMuted),
      ),
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: t.chrome,
      indicatorColor: t.chromeIndicator,
      indicatorShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
      selectedIconTheme: IconThemeData(color: t.onChromeIndicator),
      unselectedIconTheme: IconThemeData(color: t.onChromeMuted),
      selectedLabelTextStyle: TextStyle(color: t.onChrome, fontWeight: FontWeight.w700, fontSize: 12),
      unselectedLabelTextStyle: TextStyle(color: t.onChromeMuted, fontSize: 12),
    ),
    tabBarTheme: TabBarThemeData(
      labelColor: t.text,
      unselectedLabelColor: t.textMuted,
      indicatorColor: t.primary,
      indicatorSize: TabBarIndicatorSize.label,
      dividerColor: t.border.withValues(alpha: 0.6),
      labelStyle: text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
      unselectedLabelStyle: text.titleSmall?.copyWith(fontWeight: FontWeight.w500),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: t.surface,
      surfaceTintColor: Colors.transparent,
      modalBackgroundColor: t.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Radii.lg))),
      showDragHandle: true,
      dragHandleColor: t.border,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: t.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg)),
      titleTextStyle: text.titleLarge?.copyWith(color: t.text),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: t.chrome,
      contentTextStyle: TextStyle(color: t.onChrome, fontSize: 14),
      actionTextColor: t.chromeIndicator,
      behavior: SnackBarBehavior.floating,
      insetPadding: const EdgeInsets.fromLTRB(Space.s4, 0, Space.s4, Space.s3),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md)),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? t.primary : Colors.transparent),
      checkColor: WidgetStatePropertyAll(t.primaryText),
      side: BorderSide(color: t.borderStrong, width: 1.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
    ),
    radioTheme: RadioThemeData(fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? t.primary : t.borderStrong)),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? t.primaryText : t.textMuted),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? t.primary : t.surfaceAlt),
      trackOutlineColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? t.primary : t.border),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: t.text, linearTrackColor: t.surfaceAlt, circularTrackColor: Colors.transparent),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: t.primary,
      foregroundColor: t.primaryText,
      elevation: 2,
      highlightElevation: 3,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.lg)),
      extendedTextStyle: text.labelLarge?.copyWith(fontWeight: FontWeight.w600),
    ),
    listTileTheme: ListTileThemeData(
      iconColor: t.text,
      textColor: t.text,
      contentPadding: const EdgeInsets.symmetric(horizontal: Space.s4),
      titleTextStyle: text.bodyLarge?.copyWith(fontSize: 15, fontWeight: FontWeight.w500, color: t.text),
      subtitleTextStyle: text.bodySmall?.copyWith(fontSize: 13, color: t.textMuted),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: t.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md), side: BorderSide(color: t.border)),
    ),
    // Pastille de compteur sur la barre anthracite : claire, jamais orange
    // (l'orange ne signifie que « remise »).
    badgeTheme: BadgeThemeData(backgroundColor: t.onChrome, textColor: t.chrome),
  );
}

final lightTheme = buildTheme(BtpTokens.light, Brightness.light);
final darkTheme = buildTheme(BtpTokens.dark, Brightness.dark);
