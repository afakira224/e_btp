import 'package:flutter/material.dart';

// ─────────────────────────────────────────────
//  Jetons de la charte Platinum Mist
//  (Front/front_web/charte-graphique-btp-platinum-mist.md).
//
//  C'est le SEUL fichier où une couleur est écrite en dur : les widgets
//  lisent `context.tokens`, jamais une valeur.
//
//  Palette : #F5F6F7 → #C1C4C8 → #7B7F85 → #2B2E33.
//  « chrome » = l'en-tête et la navigation, anthracite dans les deux modes
//  (charte §5 et §9). L'accent orange ne porte qu'une information — « il y
//  a une remise » — et rien d'autre ; succès / attention / danger gardent
//  leur sens fonctionnel (§10).
// ─────────────────────────────────────────────
@immutable
class BtpTokens extends ThemeExtension<BtpTokens> {
  const BtpTokens({
    required this.primary,
    required this.primaryText,
    required this.background,
    required this.surface,
    required this.surfaceAlt,
    required this.border,
    required this.borderStrong,
    required this.text,
    required this.textMuted,
    required this.chrome,
    required this.chromeRaised,
    required this.onChrome,
    required this.onChromeMuted,
    required this.chromeIndicator,
    required this.onChromeIndicator,
    required this.shadow,
    required this.illustration,
    required this.accent,
    required this.accentText,
    required this.accentSurface,
    required this.success,
    required this.successSurface,
    required this.warning,
    required this.warningSurface,
    required this.danger,
    required this.dangerSurface,
  });

  final Color primary;
  final Color primaryText;
  final Color background;
  final Color surface;
  final Color surfaceAlt;
  final Color border;
  final Color borderStrong;
  final Color text;
  final Color textMuted;

  /// En-tête et barre d'onglets : Platinum Dark.
  final Color chrome;

  /// Champ ou bouton posé sur le chrome (barre de recherche de l'en-tête).
  final Color chromeRaised;
  final Color onChrome;

  /// Texte secondaire sur le chrome : Platinum Soft, contraste AA.
  final Color onChromeMuted;

  /// Pastille de l'onglet actif (charte §9 « item actif »).
  final Color chromeIndicator;
  final Color onChromeIndicator;

  /// Ombre de carte (charte `--shadow-card`).
  final Color shadow;

  /// Fond des illustrations (onboarding, bienvenue) : clair dans les deux
  /// modes, les dessins sont faits pour lui.
  final Color illustration;

  final Color accent;
  final Color accentText;
  final Color accentSurface;
  final Color success;
  final Color successSurface;
  final Color warning;
  final Color warningSurface;
  final Color danger;
  final Color dangerSurface;

  static const light = BtpTokens(
    primary: Color(0xFF2B2E33),
    primaryText: Color(0xFFF5F6F7),
    background: Color(0xFFF5F6F7),
    surface: Color(0xFFFFFFFF),
    surfaceAlt: Color(0xFFE8EAEC),
    border: Color(0xFFC1C4C8),
    borderStrong: Color(0xFFA8ACB2),
    text: Color(0xFF2B2E33),
    textMuted: Color(0xFF7B7F85),
    chrome: Color(0xFF2B2E33),
    chromeRaised: Color(0xFF3A3E45),
    onChrome: Color(0xFFF5F6F7),
    onChromeMuted: Color(0xFFC1C4C8),
    chromeIndicator: Color(0xFFC1C4C8),
    onChromeIndicator: Color(0xFF2B2E33),
    shadow: Color(0x142B2E33),
    illustration: Color(0xFFECEEF0),
    accent: Color(0xFFD1481F),
    accentText: Color(0xFFFFFFFF),
    accentSurface: Color(0xFFFDEEE9),
    success: Color(0xFF1F7A4D),
    successSurface: Color(0xFFE6F2EC),
    warning: Color(0xFF8A6100),
    warningSurface: Color(0xFFFDF3E0),
    danger: Color(0xFFA32222),
    dangerSurface: Color(0xFFFBEAEA),
  );

  static const dark = BtpTokens(
    primary: Color(0xFFF5F6F7),
    primaryText: Color(0xFF2B2E33),
    background: Color(0xFF212428),
    surface: Color(0xFF2B2E33),
    surfaceAlt: Color(0xFF3A3E45),
    border: Color(0xFF4A4E55),
    borderStrong: Color(0xFF7B7F85),
    text: Color(0xFFF5F6F7),
    textMuted: Color(0xFFC1C4C8),
    chrome: Color(0xFF2B2E33),
    chromeRaised: Color(0xFF3A3E45),
    onChrome: Color(0xFFF5F6F7),
    onChromeMuted: Color(0xFFC1C4C8),
    chromeIndicator: Color(0xFFC1C4C8),
    onChromeIndicator: Color(0xFF2B2E33),
    shadow: Color(0x66000000),
    illustration: Color(0xFFECEEF0),
    accent: Color(0xFFFF7A52),
    accentText: Color(0xFF2B2E33),
    accentSurface: Color(0xFF3A2820),
    success: Color(0xFF6ED9A4),
    successSurface: Color(0xFF21382E),
    warning: Color(0xFFF0C069),
    warningSurface: Color(0xFF3A3121),
    danger: Color(0xFFF28B8B),
    dangerSurface: Color(0xFF3A2525),
  );

  @override
  BtpTokens copyWith() => this;

  @override
  BtpTokens lerp(ThemeExtension<BtpTokens>? other, double t) {
    if (other is! BtpTokens) return this;
    Color l(Color a, Color b) => Color.lerp(a, b, t)!;
    return BtpTokens(
      primary: l(primary, other.primary),
      primaryText: l(primaryText, other.primaryText),
      background: l(background, other.background),
      surface: l(surface, other.surface),
      surfaceAlt: l(surfaceAlt, other.surfaceAlt),
      border: l(border, other.border),
      borderStrong: l(borderStrong, other.borderStrong),
      text: l(text, other.text),
      textMuted: l(textMuted, other.textMuted),
      chrome: l(chrome, other.chrome),
      chromeRaised: l(chromeRaised, other.chromeRaised),
      onChrome: l(onChrome, other.onChrome),
      onChromeMuted: l(onChromeMuted, other.onChromeMuted),
      chromeIndicator: l(chromeIndicator, other.chromeIndicator),
      onChromeIndicator: l(onChromeIndicator, other.onChromeIndicator),
      shadow: l(shadow, other.shadow),
      illustration: l(illustration, other.illustration),
      accent: l(accent, other.accent),
      accentText: l(accentText, other.accentText),
      accentSurface: l(accentSurface, other.accentSurface),
      success: l(success, other.success),
      successSurface: l(successSurface, other.successSurface),
      warning: l(warning, other.warning),
      warningSurface: l(warningSurface, other.warningSurface),
      danger: l(danger, other.danger),
      dangerSurface: l(dangerSurface, other.dangerSurface),
    );
  }
}

/// Rayons de la charte (§12) : champ, bouton, badge 6 · carte 10 ·
/// feuille, modale, grande section 16.
abstract final class Radii {
  static const sm = 6.0;
  static const md = 10.0;
  static const lg = 16.0;
}

abstract final class Space {
  static const s1 = 4.0;
  static const s2 = 8.0;
  static const s3 = 12.0;
  static const s4 = 16.0;
  static const s5 = 24.0;
  static const s6 = 32.0;
  static const s7 = 48.0;
}

extension TokensX on BuildContext {
  BtpTokens get tokens => Theme.of(this).extension<BtpTokens>()!;
}
