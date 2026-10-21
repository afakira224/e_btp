import 'package:flutter/material.dart';

import '../../../app/navigation.dart';
import '../../../app/theme/tokens.dart';

/// Barre de recherche de l'Accueil et du Catalogue : un appui ouvre l'écran
/// de saisie, avec le clavier déjà ouvert.
class SearchEntry extends StatelessWidget {
  const SearchEntry({super.key});

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Semantics(
      button: true,
      label: 'Rechercher un produit, un rayon',
      excludeSemantics: true,
      child: Material(
        color: t.background,
        shape: RoundedRectangleBorder(side: BorderSide(color: t.border), borderRadius: BorderRadius.circular(Radii.sm)),
        child: InkWell(
          borderRadius: BorderRadius.circular(Radii.sm),
          onTap: () => context.openSearch(),
          child: SizedBox(
            height: 44,
            child: Row(children: [
              const SizedBox(width: Space.s3),
              Icon(Icons.search, color: t.textMuted, size: 20),
              const SizedBox(width: Space.s2),
              Expanded(child: Text('Ciment, carrelage, perforateur…', overflow: TextOverflow.ellipsis, style: TextStyle(color: t.textMuted))),
            ]),
          ),
        ),
      ),
    );
  }
}
