import 'package:flutter/material.dart';

import '../../../app/theme/tokens.dart';
import '../../../entities/product.dart';
import '../../../shared/ui/kit.dart';
import '../../../shared/ui/paged.dart';
import '../../../shared/ui/responsive.dart';
import '../../../shared/ui/states.dart';
import 'product_card.dart';

/// Étiquette posée sur la photo d'une carte : rang, date d'arrivée…
typedef CardTag = String? Function(ProductBoutique offer, int index);

/// Hauteur du bloc texte d'une carte, à taille de texte normale.
const _cardBody = 142.0;

double _textScale(BuildContext context) => MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 2.0);

/// Délégué de grille adapté à la largeur ET à la taille du texte : une
/// carte ne déborde pas, même avec le texte agrandi à 200 %.
SliverGridDelegate productGridDelegate(BuildContext context) {
  final columns = context.productColumns;
  final width = (context.screenWidth - context.gutter * 2 - Space.s3 * (columns - 1)) / columns;
  return SliverGridDelegateWithFixedCrossAxisCount(
    crossAxisCount: columns,
    mainAxisSpacing: Space.s3,
    crossAxisSpacing: Space.s3,
    mainAxisExtent: width + _cardBody * _textScale(context),
  );
}

/// Grille d'une liste déjà chargée.
class ProductSliverGrid extends StatelessWidget {
  const ProductSliverGrid({super.key, required this.items, this.tag});

  final List<ProductBoutique> items;
  final CardTag? tag;

  @override
  Widget build(BuildContext context) => SliverPadding(
        padding: EdgeInsets.symmetric(horizontal: context.gutter),
        sliver: SliverGrid(
          gridDelegate: productGridDelegate(context),
          delegate: SliverChildBuilderDelegate((context, i) => ProductCard(offer: items[i], tag: tag?.call(items[i], i)), childCount: items.length),
        ),
      );
}

/// Grille chargée au défilement, avec ses états : premier chargement,
/// vide, erreur avec « Réessayer », fin de liste.
class PagedProductSliver extends StatelessWidget {
  const PagedProductSliver({
    super.key,
    required this.controller,
    required this.emptyTitle,
    required this.emptyText,
    this.emptyAction,
    this.onEmptyAction,
    this.tag,
  });

  final PagedController<ProductBoutique> controller;
  final String emptyTitle;
  final String emptyText;
  final String? emptyAction;
  final VoidCallback? onEmptyAction;
  final CardTag? tag;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: controller,
        builder: (context, _) {
          final c = controller;
          final pad = EdgeInsets.symmetric(horizontal: context.gutter);
          if (c.error != null && c.items.isEmpty) {
            return SliverPadding(padding: pad, sliver: SliverToBoxAdapter(child: ErrorRetry(message: c.error!, onRetry: c.loadMore)));
          }
          if (!c.loadedOnce || c.isFirstLoad) {
            return SliverPadding(
              padding: pad,
              sliver: SliverGrid(
                gridDelegate: productGridDelegate(context),
                delegate: SliverChildBuilderDelegate((_, _) => const Skeleton(), childCount: context.productColumns * 3),
              ),
            );
          }
          if (c.items.isEmpty) {
            return SliverPadding(
              padding: pad,
              sliver: SliverToBoxAdapter(child: EmptyState(icon: Icons.search_off_rounded, title: emptyTitle, text: emptyText, actionLabel: emptyAction, onAction: onEmptyAction)),
            );
          }
          return SliverMainAxisGroup(slivers: [
            ProductSliverGrid(items: c.items, tag: tag),
            SliverPadding(
              padding: EdgeInsets.fromLTRB(context.gutter, Space.s4, context.gutter, Space.s6),
              sliver: SliverToBoxAdapter(child: _Footer(controller: c)),
            ),
          ]);
        },
      );
}

class _Footer extends StatelessWidget {
  const _Footer({required this.controller});

  final PagedController<ProductBoutique> controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    final t = context.tokens;
    if (c.error != null) return ErrorRetry(message: c.error!, onRetry: c.loadMore);
    if (c.isLoading) return const Center(child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2)));
    if (c.hasMore) {
      // Doublure du défilement automatique pour le lecteur d'écran.
      return Center(child: TextButton(onPressed: c.loadMore, child: const Text('Afficher plus')));
    }
    return Row(children: [
      Expanded(child: Divider(color: t.border)),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: Space.s3),
        child: Text('${c.total} article${c.total > 1 ? 's' : ''}', style: TextStyle(color: t.textMuted, fontSize: 12)),
      ),
      Expanded(child: Divider(color: t.border)),
    ]);
  }
}

/// Carrousel horizontal de cartes produit (accueil, fiche produit).
class ProductCarousel extends StatelessWidget {
  const ProductCarousel({super.key, required this.items, this.loading = false, this.tag});

  final List<ProductBoutique> items;
  final bool loading;
  final CardTag? tag;

  @override
  Widget build(BuildContext context) {
    const width = 156.0;
    final height = width + _cardBody * _textScale(context) + Space.s3;
    final count = loading ? 4 : items.length;
    if (!loading && items.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: height,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: EdgeInsets.fromLTRB(context.gutter, 0, context.gutter, Space.s3),
        itemCount: count,
        separatorBuilder: (_, _) => const SizedBox(width: Space.s3),
        itemBuilder: (context, i) => SizedBox(
          width: width,
          child: loading ? const Skeleton() : ProductCard(offer: items[i], tag: tag?.call(items[i], i)),
        ),
      ),
    );
  }
}

/// Section de produits : titre, « Tout voir », carrousel.
class ProductRail extends StatelessWidget {
  const ProductRail({super.key, required this.title, this.subtitle, required this.items, this.loading = false, this.onMore, this.tag});

  final String title;
  final String? subtitle;
  final List<ProductBoutique> items;
  final bool loading;
  final VoidCallback? onMore;
  final CardTag? tag;

  @override
  Widget build(BuildContext context) {
    if (!loading && items.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SectionHeader(title: title, subtitle: subtitle, onMore: onMore),
      ProductCarousel(items: items, loading: loading, tag: tag),
    ]);
  }
}
