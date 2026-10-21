import 'package:flutter/widgets.dart';

// ─────────────────────────────────────────────
//  Classes de largeur (section 4 du cahier des charges).
//  Aucune largeur fixe pour le contenu : chaque écran choisit sa mise en
//  page d'après ces classes, du petit Android de 320 dp à la tablette.
// ─────────────────────────────────────────────
enum WidthClass { compact, standard, expanded }

extension ResponsiveX on BuildContext {
  double get screenWidth => MediaQuery.sizeOf(this).width;

  WidthClass get widthClass {
    final w = screenWidth;
    if (w < 360) return WidthClass.compact;
    if (w < 600) return WidthClass.standard;
    return WidthClass.expanded;
  }

  bool get isExpanded => widthClass == WidthClass.expanded;

  /// Colonnes d'une grille de cartes produit.
  int get productColumns => switch (widthClass) {
        WidthClass.compact || WidthClass.standard => 2,
        WidthClass.expanded => screenWidth >= 900 ? 4 : 3,
      };

  /// Marge latérale de page : 16 dp, 24 dp sur grand écran.
  double get gutter => isExpanded ? 24 : 16;
}

/// Contenu centré à une largeur lisible sur grand écran.
class Readable extends StatelessWidget {
  const Readable({super.key, required this.child, this.maxWidth = 720});

  final Widget child;
  final double maxWidth;

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.topCenter,
        // Toute la largeur disponible jusqu'au maximum : le contenu ne se
        // recroqueville pas au centre sur téléphone.
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth),
          child: SizedBox(width: double.infinity, child: child),
        ),
      );
}
