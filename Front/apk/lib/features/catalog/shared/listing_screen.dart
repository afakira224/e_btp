import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/navigation.dart';
import '../../../app/theme/tokens.dart';
import '../../../entities/product.dart';
import '../../../shared/ui/kit.dart';
import '../../../shared/ui/paged.dart';
import '../../../shared/ui/responsive.dart';
import '../../../shared/utils/format.dart';
import 'catalog_api.dart';
import 'product_grid.dart';

/// Puce de filtre : un libellé, un état, une action.
class ChipItem {
  const ChipItem(this.label, {required this.active, required this.onTap, this.icon});
  final String label;
  final bool active;
  final VoidCallback onTap;
  final IconData? icon;
}

/// Rangée horizontale de puces, défilante au doigt.
class ChipRow extends StatelessWidget {
  const ChipRow({super.key, required this.chips, this.padding});

  final List<ChipItem> chips;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return SizedBox(
      height: 52,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: padding ?? EdgeInsets.symmetric(horizontal: context.gutter, vertical: Space.s2),
        itemCount: chips.length,
        separatorBuilder: (_, _) => const SizedBox(width: Space.s2),
        itemBuilder: (context, i) {
          final c = chips[i];
          return ChoiceChip(
            avatar: c.icon == null ? null : Icon(c.icon, size: 16, color: c.active ? t.primaryText : t.text),
            label: Text(c.label),
            selected: c.active,
            onSelected: (_) {
              HapticFeedback.selectionClick();
              c.onTap();
            },
            side: BorderSide(color: c.active ? t.primary : t.border),
            labelStyle: TextStyle(color: c.active ? t.primaryText : t.text, fontSize: 14, fontWeight: c.active ? FontWeight.w600 : FontWeight.w500),
          );
        },
      ),
    );
  }
}

/// Tris proposés par défaut sur une liste.
const defaultSorts = [ListingSort.popular, ListingSort.newest, ListingSort.priceAsc, ListingSort.priceDesc, ListingSort.rating];

// ─────────────────────────────────────────────
//  Corps d'une liste d'offres : en-tête facultatif, barre collante (puces,
//  nombre d'articles, tri dans une feuille du bas), grille chargée au
//  défilement par pages. Changer un critère repart de la première page.
//  Sert aux rayons, aux listes éditoriales et à l'onglet Articles d'une
//  boutique.
// ─────────────────────────────────────────────
class ListingBody extends ConsumerStatefulWidget {
  const ListingBody({
    super.key,
    required this.query,
    this.familleChips = false,
    this.chips,
    this.sorts = defaultSorts,
    this.header,
    this.tag,
    this.emptyTitle = 'Aucun produit ici',
    this.emptyText = "Les boutiques n'ont pas encore référencé d'article ici.",
    this.pageSize = 12,
    this.leadingSlivers = const [],
  });

  final ListingQuery query;

  /// Puces de domaine : Tout, Matériaux, Équipement…
  final bool familleChips;
  final List<ChipItem>? chips;

  /// Vide : pas de bouton de tri.
  final List<ListingSort> sorts;

  /// Contenu au-dessus de la barre collante (bannières de vente flash).
  final Widget? header;
  final CardTag? tag;
  final String emptyTitle;
  final String emptyText;
  final int pageSize;

  /// Slivers placés en tête (SliverOverlapInjector d'un NestedScrollView).
  final List<Widget> leadingSlivers;

  @override
  ConsumerState<ListingBody> createState() => _ListingBodyState();
}

class _ListingBodyState extends ConsumerState<ListingBody> {
  late ListingQuery _query = widget.query;
  late final PagedController<ProductBoutique> _paged = PagedController(_loader(_query), idOf: (o) => o.id);

  PageLoader<ProductBoutique> _loader(ListingQuery q) => (page) => ref.read(catalogApiProvider).search(q, page, widget.pageSize);

  @override
  void didUpdateWidget(ListingBody old) {
    super.didUpdateWidget(old);
    // Critères venus du parent (recherche dans une boutique, promotion) :
    // le domaine et le tri choisis ici sont conservés.
    if (old.query != widget.query) {
      _apply(widget.query.copyWith(sort: _query.sort, familleId: () => _query.familleId ?? widget.query.familleId));
    }
  }

  void _apply(ListingQuery q) {
    if (q == _query) return;
    setState(() => _query = q);
    _paged.reset(_loader(q));
  }

  Future<void> _chooseSort() async {
    final choice = await showChoiceSheet<ListingSort>(
      context,
      title: 'Trier par',
      selected: _query.sort,
      options: [for (final s in widget.sorts) (s, s.label)],
    );
    if (choice != null) _apply(_query.copyWith(sort: choice));
  }

  @override
  void dispose() {
    _paged.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final familles = widget.familleChips ? ref.watch(famillesProvider).value ?? const [] : const [];
    final chips = [
      if (familles.isNotEmpty) ...[
        ChipItem('Tout', active: _query.familleId == null, onTap: () => _apply(_query.copyWith(familleId: () => null))),
        for (final f in familles) ChipItem(f.nom, active: _query.familleId == f.id, onTap: () => _apply(_query.copyWith(familleId: () => f.id))),
      ],
      ...?widget.chips,
    ];

    return RefreshIndicator(
      onRefresh: _paged.refresh,
      child: LoadMoreListener(
        onReachEnd: _paged.loadMore,
        child: CustomScrollView(
          slivers: [
            ...widget.leadingSlivers,
            if (widget.header != null) SliverToBoxAdapter(child: widget.header),
            SliverPersistentHeader(
              pinned: true,
              delegate: _Toolbar(
                height: (chips.isEmpty ? 0 : 52) + 44,
                child: _ToolbarContent(
                  chips: chips,
                  paged: _paged,
                  sortLabel: widget.sorts.isEmpty ? null : _query.sort.label,
                  onSort: widget.sorts.isEmpty ? null : _chooseSort,
                ),
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: Space.s3)),
            PagedProductSliver(
              controller: _paged,
              tag: widget.tag,
              emptyTitle: widget.emptyTitle,
              emptyText: widget.emptyText,
              emptyAction: _query.familleId != null && widget.familleChips ? 'Voir tous les domaines' : null,
              onEmptyAction: _query.familleId != null && widget.familleChips ? () => _apply(_query.copyWith(familleId: () => null)) : null,
            ),
          ],
        ),
      ),
    );
  }
}

class _ToolbarContent extends StatelessWidget {
  const _ToolbarContent({required this.chips, required this.paged, this.sortLabel, this.onSort});

  final List<ChipItem> chips;
  final PagedController<ProductBoutique> paged;
  final String? sortLabel;
  final VoidCallback? onSort;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      if (chips.isNotEmpty) ChipRow(chips: chips),
      SizedBox(
        height: 44,
        child: Padding(
          padding: EdgeInsets.only(left: context.gutter, right: Space.s1),
          child: Row(children: [
            Expanded(
              child: ListenableBuilder(
                listenable: paged,
                builder: (context, _) => Text(
                  paged.loadedOnce ? plural(paged.total, 'article') : 'Chargement…',
                  style: TextStyle(color: t.textMuted, fontSize: 13, fontWeight: FontWeight.w500),
                ),
              ),
            ),
            if (onSort != null)
              TextButton.icon(
                onPressed: onSort,
                icon: const Icon(Icons.swap_vert, size: 20),
                label: Text(sortLabel!),
              ),
          ]),
        ),
      ),
    ]);
  }
}

/// Barre collante sous la barre d'application.
class _Toolbar extends SliverPersistentHeaderDelegate {
  _Toolbar({required this.height, required this.child});

  final double height;
  final Widget child;

  @override
  double get minExtent => height;
  @override
  double get maxExtent => height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    final t = context.tokens;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: t.background,
        border: Border(bottom: BorderSide(color: overlapsContent || shrinkOffset > 0 ? t.border.withValues(alpha: 0.7) : Colors.transparent)),
      ),
      child: child,
    );
  }

  @override
  bool shouldRebuild(_Toolbar old) => true;
}

/// Écran de liste complet : barre d'application avec recherche, puis le corps.
class ListingScreen extends StatelessWidget {
  const ListingScreen({
    super.key,
    required this.title,
    required this.query,
    this.familleChips = false,
    this.chips,
    this.sorts = defaultSorts,
    this.header,
    this.tag,
    this.emptyTitle = 'Aucun produit ici',
    this.emptyText = "Les boutiques n'ont pas encore référencé d'article ici.",
    this.pageSize = 12,
  });

  final String title;
  final ListingQuery query;
  final bool familleChips;
  final List<ChipItem>? chips;
  final List<ListingSort> sorts;
  final Widget? header;
  final CardTag? tag;
  final String emptyTitle;
  final String emptyText;
  final int pageSize;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
          actions: [IconButton(tooltip: 'Rechercher', icon: const Icon(Icons.search), onPressed: () => context.openSearch())],
        ),
        body: ListingBody(
          query: query,
          familleChips: familleChips,
          chips: chips,
          sorts: sorts,
          header: header,
          tag: tag,
          emptyTitle: emptyTitle,
          emptyText: emptyText,
          pageSize: pageSize,
        ),
      );
}
