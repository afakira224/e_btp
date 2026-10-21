import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/navigation.dart';
import '../../../app/theme/tokens.dart';
import '../../../entities/product.dart';
import '../../../entities/taxonomy.dart';
import '../../../shared/ui/kit.dart';
import '../../../shared/ui/paged.dart';
import '../../../shared/ui/responsive.dart';
import '../../../shared/ui/states.dart';
import '../../../shared/utils/format.dart';
import '../../catalog/shared/catalog_api.dart';
import '../../catalog/shared/listing_screen.dart';
import '../../catalog/shared/product_grid.dart';

// ─────────────────────────────────────────────
//  Résultats de recherche — critères lus dans l'URL (mêmes paramètres que
//  le web). Barre collante « Filtres · Trier » et filtres actifs en puces
//  retirables ; filtres dans une feuille du bas ; grille par pages de 12.
// ─────────────────────────────────────────────
class SearchResultsPage extends ConsumerStatefulWidget {
  const SearchResultsPage({super.key, required this.initial});

  final ListingQuery initial;

  @override
  ConsumerState<SearchResultsPage> createState() => _SearchResultsPageState();
}

class _SearchResultsPageState extends ConsumerState<SearchResultsPage> {
  late ListingQuery _query = widget.initial;
  PriceRange? _range;
  late final PagedController<ProductBoutique> _paged = PagedController(_loader(_query), idOf: (o) => o.id);

  PageLoader<ProductBoutique> _loader(ListingQuery q) => (page) async {
        final res = await ref.read(catalogApiProvider).search(q, page, 12);
        if (page == 1 && mounted) setState(() => _range = res.priceRange);
        return res;
      };

  void _apply(ListingQuery q) {
    if (q == _query) return;
    setState(() => _query = q);
    _paged.reset(_loader(q));
  }

  @override
  void dispose() {
    _paged.dispose();
    super.dispose();
  }

  int get _filterCount => [
        _query.familleId ?? _query.categoryId ?? _query.sousCategoryId,
        _query.minPrice,
        _query.maxPrice,
        _query.inStock ? true : null,
        _query.discounted ? true : null,
      ].whereType<Object>().length;

  Future<void> _openFilters(List<Famille> familles) async {
    final result = await showModalBottomSheet<ListingQuery>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: false,
      builder: (_) => _FiltersSheet(initial: _query, familles: familles, range: _range),
    );
    if (result != null) _apply(result);
  }

  Future<void> _chooseSort() async {
    final choice = await showChoiceSheet<ListingSort>(context, title: 'Trier par', selected: _query.sort, options: [for (final s in ListingSort.values) (s, s.label)]);
    if (choice != null) _apply(_query.copyWith(sort: choice));
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final familles = ref.watch(famillesProvider).value ?? const <Famille>[];
    final rayon = _rayonName(familles);
    final q = _query.q;

    final active = <(String, ListingQuery)>[
      if (rayon != null) (rayon, _query.copyWith(familleId: () => null, categoryId: () => null, sousCategoryId: () => null)),
      if (_query.minPrice != null) ('Dès ${formatPrice(_query.minPrice!)}', _query.copyWith(minPrice: () => null)),
      if (_query.maxPrice != null) ("Jusqu'à ${formatPrice(_query.maxPrice!)}", _query.copyWith(maxPrice: () => null)),
      if (_query.inStock) ('En stock', _query.copyWith(inStock: false)),
      if (_query.discounted) ('En promotion', _query.copyWith(discounted: false)),
    ];

    final toolbar = SizedBox(
      height: 56,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: EdgeInsets.symmetric(horizontal: context.gutter, vertical: Space.s2),
        children: [
          _ToolbarButton(icon: Icons.tune, label: _filterCount > 0 ? 'Filtres · $_filterCount' : 'Filtres', active: _filterCount > 0, onTap: () => _openFilters(familles)),
          const SizedBox(width: Space.s2),
          _ToolbarButton(icon: Icons.swap_vert, label: _query.sort.label, onTap: _chooseSort),
          for (final (label, without) in active) ...[
            const SizedBox(width: Space.s2),
            InputChip(
              label: Text(label),
              onDeleted: () => _apply(without),
              onPressed: () => _apply(without),
              deleteButtonTooltipMessage: 'Retirer le filtre $label',
              backgroundColor: t.surfaceAlt,
              side: BorderSide.none,
            ),
          ],
        ],
      ),
    );

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Material(
          color: t.surfaceAlt,
          borderRadius: BorderRadius.circular(Radii.md),
          child: InkWell(
            borderRadius: BorderRadius.circular(Radii.md),
            onTap: () => context.openShared('recherche/saisie${q == null ? '' : '?q=${Uri.encodeQueryComponent(q)}'}'),
            child: SizedBox(
              height: 44,
              child: Row(children: [
                const SizedBox(width: Space.s3),
                Icon(Icons.search, size: 20, color: t.textMuted),
                const SizedBox(width: Space.s2),
                Expanded(child: Text(q ?? 'Tous les produits', overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: t.text))),
              ]),
            ),
          ),
        ),
        actions: [SizedBox(width: context.gutter)],
      ),
      body: RefreshIndicator(
        onRefresh: _paged.refresh,
        child: LoadMoreListener(
          onReachEnd: _paged.loadMore,
          child: CustomScrollView(slivers: [
            SliverPersistentHeader(pinned: true, delegate: _PinnedBar(child: toolbar, height: 56)),
            SliverPadding(
              padding: EdgeInsets.fromLTRB(context.gutter, Space.s1, context.gutter, Space.s3),
              sliver: SliverToBoxAdapter(
                child: ListenableBuilder(
                  listenable: _paged,
                  builder: (context, _) => Text(
                    _paged.loadedOnce ? plural(_paged.total, 'résultat') : 'Recherche…',
                    style: TextStyle(color: t.textMuted, fontSize: 13, fontWeight: FontWeight.w500),
                  ),
                ),
              ),
            ),
            PagedProductSliver(
              controller: _paged,
              emptyTitle: _filterCount > 0 ? 'Aucun résultat avec ces filtres' : 'Aucun résultat${q != null ? ' pour « $q »' : ''}',
              emptyText: _filterCount > 0
                  ? "Élargissez la fourchette de prix ou retirez un filtre."
                  : "Vérifiez l'orthographe ou essayez un terme plus général (« ciment » plutôt que « CEM II 42.5 »).",
              emptyAction: _filterCount > 0 ? 'Retirer les filtres' : 'Parcourir le catalogue',
              onEmptyAction: _filterCount > 0 ? () => _apply(ListingQuery(q: q, sort: _query.sort)) : () => Navigator.of(context).maybePop(),
            ),
          ]),
        ),
      ),
    );
  }

  String? _rayonName(List<Famille> familles) {
    for (final f in familles) {
      if (f.id == _query.familleId) return f.nom;
      for (final c in f.categories) {
        if (c.id == _query.categoryId) return c.nom;
        for (final s in c.sousCategories) {
          if (s.id == _query.sousCategoryId) return s.nom;
        }
      }
    }
    return null;
  }
}

class _ToolbarButton extends StatelessWidget {
  const _ToolbarButton({required this.icon, required this.label, required this.onTap, this.active = false});

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Material(
      color: active ? t.primary : t.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999), side: BorderSide(color: active ? t.primary : t.border)),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Space.s3),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 18, color: active ? t.primaryText : t.text),
            const SizedBox(width: Space.s1),
            Text(label, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: active ? t.primaryText : t.text)),
          ]),
        ),
      ),
    );
  }
}

class _PinnedBar extends SliverPersistentHeaderDelegate {
  _PinnedBar({required this.child, required this.height});

  final Widget child;
  final double height;

  @override
  double get minExtent => height;
  @override
  double get maxExtent => height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) => DecoratedBox(
        decoration: BoxDecoration(
          color: context.tokens.background,
          border: Border(bottom: BorderSide(color: overlapsContent ? context.tokens.border.withValues(alpha: 0.7) : Colors.transparent)),
        ),
        child: child,
      );

  @override
  bool shouldRebuild(_PinnedBar old) => true;
}

// ── Feuille de filtres ────────────────────────
class _FiltersSheet extends ConsumerStatefulWidget {
  const _FiltersSheet({required this.initial, required this.familles, this.range});

  final ListingQuery initial;
  final List<Famille> familles;
  final PriceRange? range;

  @override
  ConsumerState<_FiltersSheet> createState() => _FiltersSheetState();
}

class _FiltersSheetState extends ConsumerState<_FiltersSheet> {
  late ListingQuery _draft = widget.initial;
  late final _min = TextEditingController(text: widget.initial.minPrice?.toString() ?? '');
  late final _max = TextEditingController(text: widget.initial.maxPrice?.toString() ?? '');
  int? _count;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _recount();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _min.dispose();
    _max.dispose();
    super.dispose();
  }

  /// Le bouton annonce combien de résultats donneront ces filtres.
  void _recount() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), () async {
      try {
        final page = await ref.read(catalogApiProvider).search(_withPrices(), 1, 1);
        if (mounted) setState(() => _count = page.total);
      } catch (_) {
        if (mounted) setState(() => _count = null);
      }
    });
  }

  void _set(ListingQuery q) {
    HapticFeedback.selectionClick();
    setState(() => _draft = q);
    _recount();
  }

  /// Bornes saisies, remises dans l'ordre si elles sont inversées.
  ListingQuery _withPrices() {
    var lo = int.tryParse(_min.text.replaceAll(RegExp(r'\s'), ''));
    var hi = int.tryParse(_max.text.replaceAll(RegExp(r'\s'), ''));
    if (lo != null && hi != null && lo > hi) (lo, hi) = (hi, lo);
    return _draft.copyWith(minPrice: () => lo, maxPrice: () => hi);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final fam = widget.familles
        .where((f) => f.id == _draft.familleId || f.categories.any((c) => c.id == _draft.categoryId || c.sousCategories.any((s) => s.id == _draft.sousCategoryId)))
        .firstOrNull;
    final cat = fam?.categories.where((c) => c.id == _draft.categoryId || c.sousCategories.any((s) => s.id == _draft.sousCategoryId)).firstOrNull;

    ListingQuery level({String? f, String? c, String? s}) => _draft.copyWith(familleId: () => f, categoryId: () => c, sousCategoryId: () => s);

    Widget chips(List<ChipItem> items) => Wrap(spacing: Space.s2, runSpacing: Space.s2, children: [
          for (final c in items)
            ChoiceChip(
              label: Text(c.label),
              selected: c.active,
              onSelected: (_) => c.onTap(),
              side: BorderSide(color: c.active ? t.primary : t.border),
              labelStyle: TextStyle(color: c.active ? t.primaryText : t.text, fontWeight: c.active ? FontWeight.w600 : FontWeight.w500),
            ),
        ]);

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.9,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        builder: (context, scroll) => Column(children: [
          Padding(
            padding: EdgeInsets.fromLTRB(Space.s1, Space.s2, context.gutter - Space.s2, Space.s1),
            child: Row(children: [
              IconButton(tooltip: 'Fermer', icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
              Expanded(child: Text('Filtres', style: Theme.of(context).textTheme.titleLarge)),
              TextButton(
                onPressed: () {
                  _min.clear();
                  _max.clear();
                  _set(ListingQuery(q: _draft.q, sort: _draft.sort));
                },
                child: const Text('Réinitialiser'),
              ),
            ]),
          ),
          const Divider(),
          Expanded(
            child: ListView(controller: scroll, padding: EdgeInsets.fromLTRB(context.gutter, Space.s4, context.gutter, Space.s5), children: [
              const Eyebrow('Domaine'),
              const SizedBox(height: Space.s2),
              chips([
                ChipItem('Tous', active: fam == null, onTap: () => _set(level())),
                for (final f in widget.familles) ChipItem(f.nom, active: fam?.id == f.id, onTap: () => _set(level(f: f.id))),
              ]),
              if (fam != null && fam.categories.isNotEmpty) ...[
                const SizedBox(height: Space.s5),
                const Eyebrow('Catégorie'),
                const SizedBox(height: Space.s2),
                chips([
                  ChipItem('Toutes', active: cat == null, onTap: () => _set(level(f: fam.id))),
                  for (final c in fam.categories) ChipItem(c.nom, active: cat?.id == c.id, onTap: () => _set(level(c: c.id))),
                ]),
              ],
              if (cat != null && cat.sousCategories.isNotEmpty) ...[
                const SizedBox(height: Space.s5),
                const Eyebrow('Rayon'),
                const SizedBox(height: Space.s2),
                chips([
                  ChipItem('Tous', active: _draft.sousCategoryId == null, onTap: () => _set(level(c: cat.id))),
                  for (final s in cat.sousCategories) ChipItem(s.nom, active: _draft.sousCategoryId == s.id, onTap: () => _set(level(s: s.id))),
                ]),
              ],
              const SizedBox(height: Space.s5),
              const Eyebrow('Prix (GNF)'),
              const SizedBox(height: Space.s2),
              Row(children: [
                Expanded(child: _priceField(_min, 'Minimum', widget.range == null ? '0' : widget.range!.min.round().toString())),
                const SizedBox(width: Space.s3),
                Expanded(child: _priceField(_max, 'Maximum', widget.range == null ? '' : widget.range!.max.round().toString())),
              ]),
              if (widget.range != null && widget.range!.max > 0) ...[
                const SizedBox(height: Space.s2),
                Text('De ${formatPrice(widget.range!.min)} à ${formatPrice(widget.range!.max)} dans cette sélection', style: TextStyle(color: t.textMuted, fontSize: 12)),
              ],
              const SizedBox(height: Space.s5),
              const Eyebrow('Disponibilité'),
              const SizedBox(height: Space.s1),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('En stock uniquement'),
                value: _draft.inStock,
                onChanged: (v) => _set(_draft.copyWith(inStock: v)),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('En promotion'),
                value: _draft.discounted,
                onChanged: (v) => _set(_draft.copyWith(discounted: v)),
              ),
            ]),
          ),
          BottomActionBar(
            child: SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => Navigator.of(context).pop(_withPrices()),
                child: Text(_count == null ? 'Voir les résultats' : 'Voir ${plural(_count!, 'résultat')}'),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _priceField(TextEditingController c, String label, String hint) => TextField(
        controller: c,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        decoration: InputDecoration(labelText: label, hintText: hint),
        onChanged: (_) => _recount(),
      );
}
