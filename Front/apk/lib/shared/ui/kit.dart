import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/theme/theme.dart';
import '../../app/theme/tokens.dart';
import '../utils/format.dart';
import 'responsive.dart';

// ─────────────────────────────────────────────
//  Kit mobile de la charte Platinum Mist : les briques communes à tous les
//  écrans. Aucune couleur en dur — tout passe par `context.tokens`.
// ─────────────────────────────────────────────

/// Carte de la charte (§7) : surface, bordure fine, ombre légère, rayon 10.
class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.onTap, this.padding = const EdgeInsets.all(Space.s4), this.radius = Radii.md, this.color, this.outlined = true});

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final double radius;
  final Color? color;
  final bool outlined;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(radius),
      side: outlined ? BorderSide(color: t.border.withValues(alpha: 0.7)) : BorderSide.none,
    );
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        boxShadow: [BoxShadow(color: t.shadow, blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: Material(
        color: color ?? t.surface,
        shape: shape,
        clipBehavior: Clip.antiAlias,
        child: onTap == null ? Padding(padding: padding, child: child) : InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
      ),
    );
  }
}

/// Groupe de lignes façon « Réglages » : un titre discret, une carte, des
/// lignes séparées par un filet.
class ListGroup extends StatelessWidget {
  const ListGroup({super.key, this.title, required this.children, this.footer, this.margin});

  final String? title;
  final List<Widget> children;
  final String? footer;
  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final rows = <Widget>[];
    for (var i = 0; i < children.length; i++) {
      rows.add(children[i]);
      if (i < children.length - 1) rows.add(const Divider(indent: Space.s4));
    }
    return Padding(
      padding: margin ?? EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (title != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.s1, 0, Space.s1, Space.s2),
            child: Text(title!, style: Theme.of(context).textTheme.titleSmall?.copyWith(color: t.textMuted)),
          ),
        AppCard(padding: EdgeInsets.zero, child: Column(children: rows)),
        if (footer != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.s1, Space.s2, Space.s1, 0),
            child: Text(footer!, style: TextStyle(color: t.textMuted, fontSize: 12)),
          ),
      ]),
    );
  }
}

/// Ligne d'un [ListGroup] : icône dans une pastille, titre, sous-titre,
/// valeur à droite et chevron quand la ligne mène ailleurs.
class ListRow extends StatelessWidget {
  const ListRow({
    super.key,
    this.icon,
    this.leading,
    required this.title,
    this.subtitle,
    this.value,
    this.trailing,
    this.onTap,
    this.destructive = false,
    this.chevron,
  });

  final IconData? icon;
  final Widget? leading;
  final String title;
  final String? subtitle;
  final String? value;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool destructive;

  /// Par défaut : chevron dès que la ligne est touchable.
  final bool? chevron;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final fg = destructive ? t.danger : t.text;
    final showChevron = chevron ?? (onTap != null && trailing == null && !destructive);
    return InkWell(
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 56),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Space.s4, vertical: Space.s3),
          child: Row(children: [
            if (leading != null) ...[leading!, const SizedBox(width: Space.s3)],
            if (icon != null) ...[
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(color: destructive ? t.dangerSurface : t.surfaceAlt, borderRadius: BorderRadius.circular(Radii.sm)),
                child: Icon(icon, size: 20, color: fg),
              ),
              const SizedBox(width: Space.s3),
            ],
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Text(title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: fg)),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(subtitle!, style: TextStyle(fontSize: 13, color: t.textMuted, height: 1.3)),
                ],
              ]),
            ),
            if (value != null) ...[
              const SizedBox(width: Space.s2),
              // Largeur bornée, hors flex : la valeur reste collée à droite.
              ConstrainedBox(
                constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.42),
                child: Text(value!, textAlign: TextAlign.right, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.textMuted, fontSize: 14)),
              ),
            ],
            if (trailing != null) ...[const SizedBox(width: Space.s2), trailing!],
            if (showChevron) ...[const SizedBox(width: Space.s1), Icon(Icons.chevron_right, color: t.textMuted, size: 22)],
          ]),
        ),
      ),
    );
  }
}

/// Titre de section avec « Tout voir ».
class SectionHeader extends StatelessWidget {
  const SectionHeader({super.key, required this.title, this.subtitle, this.onMore, this.moreLabel = 'Tout voir', this.padding});

  final String title;
  final String? subtitle;
  final VoidCallback? onMore;
  final String moreLabel;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Padding(
      padding: padding ?? EdgeInsets.fromLTRB(context.gutter, Space.s5, Space.s1, Space.s3),
      child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            if (subtitle != null) Text(subtitle!, style: TextStyle(color: t.textMuted, fontSize: 13)),
          ]),
        ),
        if (onMore != null)
          TextButton(
            onPressed: onMore,
            child: Row(mainAxisSize: MainAxisSize.min, children: [Text(moreLabel), const Icon(Icons.chevron_right, size: 20)]),
          ),
      ]),
    );
  }
}

/// Barre d'action collée en bas d'écran, au-dessus de la zone système.
class BottomActionBar extends StatelessWidget {
  const BottomActionBar({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: t.surface,
        border: Border(top: BorderSide(color: t.border.withValues(alpha: 0.7))),
        boxShadow: [BoxShadow(color: t.shadow, blurRadius: 16, offset: const Offset(0, -4))],
      ),
      child: SafeArea(
        top: false,
        child: Padding(padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, Space.s3), child: child),
      ),
    );
  }
}

/// Sélecteur de quantité − 3 +, borné.
class QuantityStepper extends StatelessWidget {
  const QuantityStepper({super.key, required this.value, this.min = 1, required this.max, required this.onChanged, this.compact = false, this.itemName});

  final int value;
  final int min;
  final int max;
  final ValueChanged<int>? onChanged;
  final bool compact;
  final String? itemName;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final size = compact ? 36.0 : 48.0;
    final of = itemName == null ? '' : ' de $itemName';
    Widget button(IconData icon, String tooltip, VoidCallback? onTap) => SizedBox(
          width: size,
          height: size,
          child: IconButton(
            tooltip: tooltip,
            padding: EdgeInsets.zero,
            style: IconButton.styleFrom(minimumSize: Size(size, size)),
            onPressed: onTap == null
                ? null
                : () {
                    HapticFeedback.selectionClick();
                    onTap();
                  },
            icon: Icon(icon, size: compact ? 18 : 20),
          ),
        );
    return Container(
      decoration: BoxDecoration(color: t.surfaceAlt, borderRadius: BorderRadius.circular(Radii.sm)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        button(Icons.remove, 'Diminuer la quantité$of', onChanged == null || value <= min ? null : () => onChanged!(value - 1)),
        ConstrainedBox(
          constraints: BoxConstraints(minWidth: compact ? 24 : 32),
          child: Semantics(
            liveRegion: true,
            label: 'Quantité : $value',
            excludeSemantics: true,
            child: Text('$value', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700, fontSize: compact ? 14 : 16)),
          ),
        ),
        button(Icons.add, 'Augmenter la quantité$of', onChanged == null || value >= max ? null : () => onChanged!(value + 1)),
      ]),
    );
  }
}

/// Bouton rond posé sur une image (retour, partage, favori).
class CircleAction extends StatelessWidget {
  const CircleAction({super.key, required this.icon, required this.tooltip, required this.onPressed, this.color, this.size = 40});

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final Color? color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: t.surface.withValues(alpha: 0.94),
        shape: BoxShape.circle,
        boxShadow: [BoxShadow(color: t.shadow, blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: IconButton(
        tooltip: tooltip,
        padding: EdgeInsets.zero,
        style: IconButton.styleFrom(minimumSize: Size(size, size)),
        onPressed: onPressed,
        icon: Icon(icon, size: size * 0.5, color: color ?? t.text),
      ),
    );
  }
}

/// Pastille d'état (stock, statut) : jamais seule, toujours avec un libellé.
class StatusDot extends StatelessWidget {
  const StatusDot({super.key, required this.color, this.size = 8});

  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => Container(width: size, height: size, decoration: BoxDecoration(color: color, shape: BoxShape.circle));
}

/// Champ de recherche posé sur l'en-tête anthracite : un appui ouvre la saisie.
class ChromeSearchField extends StatelessWidget {
  const ChromeSearchField({super.key, required this.onTap, this.hint = 'Ciment, carrelage, perforateur…', this.text});

  final VoidCallback onTap;
  final String hint;

  /// Recherche en cours, affichée à la place de l'indication.
  final String? text;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Semantics(
      button: true,
      label: text == null ? 'Rechercher un produit, un rayon' : 'Modifier la recherche $text',
      excludeSemantics: true,
      child: Material(
        color: t.chromeRaised,
        borderRadius: BorderRadius.circular(Radii.md),
        child: InkWell(
          borderRadius: BorderRadius.circular(Radii.md),
          onTap: onTap,
          child: SizedBox(
            height: 46,
            child: Row(children: [
              const SizedBox(width: Space.s3),
              Icon(Icons.search, color: t.onChromeMuted, size: 22),
              const SizedBox(width: Space.s2),
              Expanded(
                child: Text(
                  text ?? hint,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: text == null ? t.onChromeMuted : t.onChrome, fontSize: 15),
                ),
              ),
              const SizedBox(width: Space.s3),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Barre d'application anthracite des racines d'onglet (charte §5 : header
/// #2B2E33), avec un éventuel contenu dessous (recherche).
SliverAppBar chromeSliverAppBar(
  BuildContext context, {
  required String title,
  Widget? titleWidget,
  List<Widget>? actions,
  Widget? bottom,
  double bottomHeight = 62,
  bool pinned = true,
  Widget? leading,
}) {
  final t = context.tokens;
  return SliverAppBar(
    pinned: pinned,
    backgroundColor: t.chrome,
    foregroundColor: t.onChrome,
    surfaceTintColor: Colors.transparent,
    scrolledUnderElevation: 0,
    systemOverlayStyle: chromeOverlay(t),
    leading: leading,
    titleSpacing: context.gutter,
    title: titleWidget ?? Text(title, style: TextStyle(color: t.onChrome, fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.4)),
    actionsIconTheme: IconThemeData(color: t.onChrome),
    actions: actions,
    bottom: bottom == null
        ? null
        : PreferredSize(
            preferredSize: Size.fromHeight(bottomHeight),
            child: Padding(padding: EdgeInsets.fromLTRB(context.gutter, 0, context.gutter, Space.s3), child: bottom),
          ),
  );
}

/// Même en-tête, pour un écran sans défilement de bandeau.
AppBar chromeAppBar(BuildContext context, {required String title, List<Widget>? actions, Widget? bottom, double bottomHeight = 62, Widget? leading}) {
  final t = context.tokens;
  return AppBar(
    backgroundColor: t.chrome,
    foregroundColor: t.onChrome,
    surfaceTintColor: Colors.transparent,
    scrolledUnderElevation: 0,
    systemOverlayStyle: chromeOverlay(t),
    leading: leading,
    titleSpacing: context.gutter,
    title: Text(title, style: TextStyle(color: t.onChrome, fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.4)),
    actionsIconTheme: IconThemeData(color: t.onChrome),
    actions: actions,
    bottom: bottom == null
        ? null
        : PreferredSize(
            preferredSize: Size.fromHeight(bottomHeight),
            child: Padding(padding: EdgeInsets.fromLTRB(context.gutter, 0, context.gutter, Space.s3), child: bottom),
          ),
  );
}

/// Feuille du bas à choix unique (tri, thème…). Renvoie la valeur choisie.
Future<T?> showChoiceSheet<T>(BuildContext context, {required String title, required List<(T, String)> options, required T selected, List<IconData>? icons}) =>
    showModalBottomSheet<T>(
      context: context,
      useSafeArea: true,
      builder: (context) {
        final t = context.tokens;
        return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: EdgeInsets.fromLTRB(context.gutter, 0, context.gutter, Space.s2),
            child: Text(title, style: Theme.of(context).textTheme.titleLarge),
          ),
          for (var i = 0; i < options.length; i++)
            ListTile(
              leading: icons == null ? null : Icon(icons[i], color: t.textMuted),
              title: Text(options[i].$2, style: TextStyle(fontWeight: options[i].$1 == selected ? FontWeight.w700 : FontWeight.w500)),
              trailing: options[i].$1 == selected ? Icon(Icons.check, color: t.text) : null,
              selected: options[i].$1 == selected,
              selectedColor: t.text,
              onTap: () => Navigator.pop(context, options[i].$1),
            ),
          const SizedBox(height: Space.s3),
        ]);
      },
    );

/// Confirmation d'une action irréversible.
Future<bool> confirmAction(BuildContext context, {required String title, String? message, required String confirmLabel, bool destructive = false}) async {
  final t = context.tokens;
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: message == null ? null : Text(message, style: TextStyle(color: t.textMuted)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text('Annuler', style: TextStyle(color: t.textMuted))),
        FilledButton(
          style: destructive ? FilledButton.styleFrom(backgroundColor: t.danger, foregroundColor: t.surface, minimumSize: const Size(48, 44)) : FilledButton.styleFrom(minimumSize: const Size(48, 44)),
          onPressed: () => Navigator.pop(context, true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return ok ?? false;
}

/// Icône d'un rayon, devinée d'après son nom.
IconData rayonIcon(String name) {
  final n = normalize(name);
  bool has(List<String> words) => words.any(n.contains);
  if (has(['ciment', 'beton', 'mortier', 'gros oeuvre', 'agglo', 'parpaing', 'materiau'])) return Icons.foundation;
  if (has(['fer', 'acier', 'armature', 'ferraill'])) return Icons.view_week_outlined;
  if (has(['carrel', 'revet', 'sol', 'faience'])) return Icons.grid_view_rounded;
  if (has(['electri', 'cabl', 'eclair', 'lampe'])) return Icons.bolt;
  if (has(['plomb', 'sanitaire', 'tuyau', 'robinet', 'eau'])) return Icons.plumbing;
  if (has(['peint', 'enduit', 'vernis'])) return Icons.format_paint_outlined;
  if (has(['outil', 'perceu', 'perfora', 'machine', 'equipement'])) return Icons.handyman_outlined;
  if (has(['bois', 'menuis', 'porte', 'fenetre'])) return Icons.carpenter;
  if (has(['toit', 'couvert', 'tole'])) return Icons.roofing;
  if (has(['quincaill', 'visserie', 'clou', 'vis'])) return Icons.hardware_outlined;
  if (has(['secur', 'protect', 'epi', 'casque'])) return Icons.health_and_safety_outlined;
  if (has(['jardin', 'exterieur'])) return Icons.yard_outlined;
  return Icons.category_outlined;
}
