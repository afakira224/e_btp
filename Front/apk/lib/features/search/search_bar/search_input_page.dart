import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/navigation.dart';
import '../../../app/theme/tokens.dart';
import '../../../entities/product.dart';
import '../../../entities/taxonomy.dart';
import '../../../shared/api/api_exception.dart';
import '../../../shared/ui/kit.dart';
import '../../../shared/ui/responsive.dart';
import '../../../shared/ui/thumbnail.dart';
import '../../../shared/utils/format.dart';
import '../../catalog/shared/catalog_api.dart';
import '../shared/search_state.dart';

const _minChars = 2;

// ─────────────────────────────────────────────
//  Saisie de recherche avec suggestions, clavier ouvert d'emblée.
//  Champ vide : recherches récentes et rayons populaires. À partir de 2
//  caractères, après 200 ms sans frappe : jusqu'à 4 rayons (cherchés côté
//  client, sans accents) et 5 produits. Une réponse dépassée est ignorée ;
//  les résultats précédents restent affichés, atténués.
// ─────────────────────────────────────────────
class SearchInputPage extends ConsumerStatefulWidget {
  const SearchInputPage({super.key, this.initial = ''});

  final String initial;

  @override
  ConsumerState<SearchInputPage> createState() => _SearchInputPageState();
}

class _SearchInputPageState extends ConsumerState<SearchInputPage> {
  late final _controller = TextEditingController(text: widget.initial);
  Timer? _debounce;
  int _generation = 0;
  String _answered = '';
  List<ProductBoutique> _products = const [];
  List<RayonSuggestion> _rayons = const [];
  String? _error;

  String get _query => _controller.text.trim();
  bool get _typing => _query.length >= _minChars;
  bool get _loading => _typing && _answered != _query;

  @override
  void initState() {
    super.initState();
    if (_typing) _fetch(_query);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String _) {
    setState(() {});
    _debounce?.cancel();
    if (!_typing) return;
    _debounce = Timer(const Duration(milliseconds: 200), () => _fetch(_query));
  }

  Future<void> _fetch(String q) async {
    final gen = ++_generation;
    final api = ref.read(catalogApiProvider);
    // L'arbre indisponible n'empêche pas de proposer des produits.
    List<Famille> familles;
    try {
      familles = await ref.read(famillesProvider.future);
    } catch (_) {
      familles = const [];
    }
    try {
      final page = await api.search(ListingQuery(q: q), 1, 5);
      if (gen != _generation || !mounted) return;
      setState(() {
        _answered = q;
        _products = page.items;
        _rayons = matchTaxonomy(familles, q);
        _error = null;
      });
    } catch (e) {
      if (gen != _generation || !mounted) return;
      setState(() {
        _answered = q;
        _error = errorMessage(e);
      });
    }
  }

  void _submit([String? term]) {
    final q = (term ?? _query).trim();
    if (q.isNotEmpty) ref.read(recentSearchesProvider.notifier).remember(q);
    context.openSearch(q);
  }

  void _openRayon(RayonSuggestion r) {
    if (_query.isNotEmpty) ref.read(recentSearchesProvider.notifier).remember(_query);
    switch (r.level) {
      case TaxonomyLevel.famille:
        context.openFamille(r.id);
      case TaxonomyLevel.categorie:
        context.openCategorie(r.id);
      case TaxonomyLevel.sousCategorie:
        context.openSousCategorie(r.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final recent = ref.watch(recentSearchesProvider);
    final categories = ref.watch(categoriesProvider).value ?? const <Categorie>[];
    final hasResults = _answered.length >= _minChars && _typing;
    final empty = hasResults && !_loading && _error == null && _products.isEmpty && _rayons.isEmpty;

    Widget label(String text, {Widget? action}) => Padding(
          padding: EdgeInsets.fromLTRB(context.gutter, Space.s4, Space.s1, Space.s2),
          child: Row(children: [
            Expanded(child: Text(text, style: Theme.of(context).textTheme.titleSmall?.copyWith(color: t.textMuted))),
            ?action,
          ]),
        );

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: SizedBox(
          height: 46,
          child: TextField(
            controller: _controller,
            autofocus: true,
            textInputAction: TextInputAction.search,
            onChanged: _onChanged,
            onSubmitted: (_) => _submit(),
            style: const TextStyle(fontSize: 16),
            decoration: InputDecoration(
              hintText: 'Ciment, carrelage, perforateur…',
              filled: true,
              fillColor: t.surfaceAlt,
              contentPadding: const EdgeInsets.symmetric(horizontal: Space.s3),
              prefixIcon: Icon(Icons.search, color: t.textMuted),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.md), borderSide: BorderSide.none),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.md), borderSide: BorderSide.none),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.md), borderSide: BorderSide(color: t.primary, width: 1.5)),
              suffixIcon: _controller.text.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Effacer la recherche',
                      icon: const Icon(Icons.cancel, size: 20),
                      onPressed: () {
                        _controller.clear();
                        _onChanged('');
                      },
                    ),
            ),
          ),
        ),
        actions: [SizedBox(width: context.gutter)],
        bottom: _loading ? const PreferredSize(preferredSize: Size.fromHeight(2), child: LinearProgressIndicator(minHeight: 2)) : null,
      ),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.only(bottom: Space.s6),
        children: [
          if (!_typing) ...[
            if (recent.isNotEmpty) ...[
              label('Recherches récentes', action: TextButton(onPressed: () => ref.read(recentSearchesProvider.notifier).clear(), child: const Text('Effacer'))),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: context.gutter),
                child: Wrap(spacing: Space.s2, runSpacing: Space.s2, children: [
                  for (final term in recent)
                    InputChip(
                      avatar: Icon(Icons.history, size: 18, color: t.textMuted),
                      label: Text(term),
                      onPressed: () => _submit(term),
                      onDeleted: () => ref.read(recentSearchesProvider.notifier).forget(term),
                      deleteButtonTooltipMessage: 'Oublier « $term »',
                    ),
                ]),
              ),
            ],
            if (categories.isNotEmpty) ...[
              label('Rayons populaires'),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: context.gutter),
                child: Wrap(spacing: Space.s2, runSpacing: Space.s2, children: [
                  for (final c in categories.take(10))
                    ActionChip(avatar: Icon(rayonIcon(c.nom), size: 18, color: t.text), label: Text(c.nom), onPressed: () => context.openCategorie(c.id)),
                ]),
              ),
            ],
          ],
          if (_error != null)
            Padding(
              padding: EdgeInsets.all(context.gutter),
              child: Text('Suggestions indisponibles : $_error Lancez la recherche avec la touche du clavier.', style: TextStyle(color: t.textMuted)),
            ),
          if (empty)
            Padding(
              padding: EdgeInsets.all(context.gutter),
              child: Text('Aucune suggestion pour « $_query ». Lancez la recherche ou essayez un terme plus général.', style: TextStyle(color: t.textMuted)),
            ),
          if (hasResults)
            AnimatedOpacity(
              opacity: _loading ? 0.55 : 1,
              duration: const Duration(milliseconds: 160),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                if (_rayons.isNotEmpty) ...[
                  label('Rayons'),
                  for (final r in _rayons)
                    ListTile(
                      leading: Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(color: t.surfaceAlt, borderRadius: BorderRadius.circular(Radii.sm)),
                        child: Icon(rayonIcon(r.label), size: 20, color: t.text),
                      ),
                      title: _Highlight(text: r.label, query: _query),
                      subtitle: Text('${r.level.label}${r.parent != null ? ' · ${r.parent}' : ''}'),
                      trailing: Icon(Icons.north_west, size: 18, color: t.textMuted),
                      onTap: () => _openRayon(r),
                    ),
                ],
                if (_products.isNotEmpty) ...[
                  label('Produits'),
                  for (final p in _products)
                    ListTile(
                      leading: SizedBox(width: 48, child: ProductThumbnail(url: p.image, seed: p.id)),
                      title: _Highlight(text: p.name, query: _query),
                      subtitle: Text(p.shopName, maxLines: 1, overflow: TextOverflow.ellipsis),
                      trailing: PriceText(offer: p),
                      onTap: () {
                        ref.read(recentSearchesProvider.notifier).remember(_query);
                        context.openOffer(p.id);
                      },
                    ),
                  Padding(
                    padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, 0),
                    child: OutlinedButton.icon(onPressed: _submit, icon: const Icon(Icons.search), label: Text('Tous les résultats pour « $_query »', overflow: TextOverflow.ellipsis)),
                  ),
                ],
              ]),
            ),
        ],
      ),
    );
  }
}

/// Prix aligné à droite d'une suggestion.
class PriceText extends StatelessWidget {
  const PriceText({super.key, required this.offer});

  final ProductBoutique offer;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, mainAxisSize: MainAxisSize.min, children: [
      Text(formatPrice(offer.effectivePrice), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
      if (offer.hasDiscount) Text(formatPrice(offer.price), style: TextStyle(fontSize: 11, color: t.textMuted, decoration: TextDecoration.lineThrough)),
    ]);
  }
}

/// Met en gras la partie du libellé qui correspond à la saisie, sans tenir
/// compte des accents ni de la casse.
class _Highlight extends StatelessWidget {
  const _Highlight({required this.text, required this.query});

  final String text;
  final String query;

  @override
  Widget build(BuildContext context) {
    // `normalize` remplace chaque caractère par un seul : les index du texte
    // replié restent ceux du texte d'origine (hors espaces multiples).
    final folded = normalize(text.replaceAll(RegExp(r'\s'), '_')).replaceAll('_', ' ');
    final needle = normalize(query);
    final start = needle.isEmpty ? -1 : folded.indexOf(needle);
    if (start < 0 || folded.length != text.length) return Text(text, maxLines: 2, overflow: TextOverflow.ellipsis);
    return Text.rich(
      TextSpan(children: [
        TextSpan(text: text.substring(0, start)),
        TextSpan(text: text.substring(start, start + needle.length), style: const TextStyle(fontWeight: FontWeight.w800)),
        TextSpan(text: text.substring(start + needle.length)),
      ]),
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
    );
  }
}
