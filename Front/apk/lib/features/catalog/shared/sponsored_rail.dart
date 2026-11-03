import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/tokens.dart';
import '../../../shared/ui/responsive.dart';
import 'catalog_api.dart';
import 'product_grid.dart';

// ─────────────────────────────────────────────
//  Places sponsorisées d'une page (GET /sponsored) : quelques produits
//  qu'une boutique paie pour montrer, chacun marqué « Sponsorisé » avec
//  son « Pourquoi je vois ceci ? ». Rien ne s'affiche quand aucun boost
//  ne vise la page, ni pendant le chargement ou en cas d'erreur : une place
//  vendue ne retarde jamais le reste.
// ─────────────────────────────────────────────
class SponsoredRail extends ConsumerWidget {
  const SponsoredRail({super.key, required this.slot, this.title = 'Sélection sponsorisée', this.padding});

  final SponsoredSlot slot;
  final String title;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(sponsoredProvider(slot)).value ?? const [];
    if (items.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: padding ?? const EdgeInsets.only(top: Space.s4),
      child: ProductRail(title: title, items: items),
    );
  }
}

/// Variante en tête de grille (sliver) : les rayons et la recherche.
class SponsoredSliver extends ConsumerWidget {
  const SponsoredSliver({super.key, required this.slot});

  final SponsoredSlot slot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(sponsoredProvider(slot)).value ?? const [];
    if (items.isEmpty) return const SliverToBoxAdapter(child: SizedBox.shrink());
    return SliverMainAxisGroup(
      slivers: [
        ProductSliverGrid(items: items),
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: context.gutter, vertical: Space.s3),
            child: const Divider(height: 1),
          ),
        ),
      ],
    );
  }
}
