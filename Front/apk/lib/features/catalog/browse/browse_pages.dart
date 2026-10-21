import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/navigation.dart';
import '../../../app/theme/tokens.dart';
import '../../../entities/taxonomy.dart';
import '../../../shared/api/api_exception.dart';
import '../../../shared/ui/kit.dart';
import '../../../shared/ui/responsive.dart';
import '../../../shared/ui/states.dart';
import '../../../shared/utils/format.dart';
import '../shared/catalog_api.dart';
import '../shared/listing_screen.dart';

// ─────────────────────────────────────────────
//  Catalogue — racine de l'onglet : les domaines dans une colonne à gauche,
//  les catégories du domaine choisi en tuiles à droite, comme les grandes
//  applications de commerce.
// ─────────────────────────────────────────────
class DomainesPage extends ConsumerStatefulWidget {
  const DomainesPage({super.key});

  @override
  ConsumerState<DomainesPage> createState() => _DomainesPageState();
}

class _DomainesPageState extends ConsumerState<DomainesPage> {
  int _selected = 0;

  @override
  Widget build(BuildContext context) {
    final familles = ref.watch(famillesProvider);
    return Scaffold(
      appBar: chromeAppBar(context, title: 'Catalogue', bottom: ChromeSearchField(onTap: () => context.openSearch())),
      body: familles.when(
        loading: () => Padding(padding: EdgeInsets.all(context.gutter), child: const Skeleton(height: 320)),
        error: (e, _) => Padding(padding: EdgeInsets.all(context.gutter), child: ErrorRetry(message: errorMessage(e), onRetry: () => ref.invalidate(famillesProvider))),
        data: (list) {
          if (list.isEmpty) {
            return const EmptyState(icon: Icons.category_outlined, title: 'Catalogue vide', text: "Aucun domaine n'est encore publié.");
          }
          final index = _selected.clamp(0, list.length - 1);
          return Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            _FamilleRail(familles: list, selected: index, onSelect: (i) => setState(() => _selected = i)),
            Expanded(child: _FamilleContent(key: ValueKey(list[index].id), famille: list[index])),
          ]);
        },
      ),
    );
  }
}

class _FamilleRail extends StatelessWidget {
  const _FamilleRail({required this.familles, required this.selected, required this.onSelect});

  final List<Famille> familles;
  final int selected;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final width = context.isExpanded ? 140.0 : 96.0;
    return Container(
      width: width,
      decoration: BoxDecoration(color: t.surface, border: Border(right: BorderSide(color: t.border.withValues(alpha: 0.6)))),
      child: ListView.builder(
        itemCount: familles.length,
        itemBuilder: (context, i) {
          final f = familles[i];
          final active = i == selected;
          return Semantics(
            selected: active,
            button: true,
            child: InkWell(
              onTap: () {
                HapticFeedback.selectionClick();
                onSelect(i);
              },
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: Space.s4, horizontal: Space.s2),
                decoration: BoxDecoration(
                  color: active ? t.background : null,
                  border: Border(left: BorderSide(color: active ? t.primary : Colors.transparent, width: 3)),
                ),
                child: Column(children: [
                  Icon(rayonIcon(f.nom), color: active ? t.text : t.textMuted, size: 26),
                  const SizedBox(height: Space.s1),
                  Text(
                    f.nom,
                    textAlign: TextAlign.center,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, height: 1.25, fontWeight: active ? FontWeight.w700 : FontWeight.w500, color: active ? t.text : t.textMuted),
                  ),
                ]),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _FamilleContent extends StatelessWidget {
  const _FamilleContent({super.key, required this.famille});

  final Famille famille;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final f = famille;
    final columns = context.isExpanded ? 3 : 2;
    return ListView(
      padding: const EdgeInsets.fromLTRB(Space.s3, Space.s4, Space.s3, Space.s6),
      children: [
        // Bandeau du domaine : tout voir d'un coup.
        AppCard(
          color: t.chrome,
          outlined: false,
          onTap: () => context.openFamille(f.id),
          padding: const EdgeInsets.all(Space.s4),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(f.nom, style: TextStyle(color: t.onChrome, fontSize: 17, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text('Voir tous les articles', style: TextStyle(color: t.onChromeMuted, fontSize: 13)),
              ]),
            ),
            Icon(Icons.arrow_forward, color: t.onChrome),
          ]),
        ),
        const SizedBox(height: Space.s4),
        Padding(
          padding: const EdgeInsets.only(left: Space.s1, bottom: Space.s2),
          child: Text('Catégories', style: Theme.of(context).textTheme.titleSmall?.copyWith(color: t.textMuted)),
        ),
        LayoutBuilder(builder: (context, box) {
          final width = (box.maxWidth - Space.s2 * (columns - 1)) / columns;
          return Wrap(spacing: Space.s2, runSpacing: Space.s2, children: [
            for (final c in f.categories)
              SizedBox(
                width: width,
                child: AppCard(
                  onTap: () => context.openCategorie(c.id),
                  padding: const EdgeInsets.all(Space.s3),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(color: t.surfaceAlt, borderRadius: BorderRadius.circular(Radii.sm)),
                      child: Icon(rayonIcon(c.nom), size: 22, color: t.text),
                    ),
                    const SizedBox(height: Space.s2),
                    Text(c.nom, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, height: 1.25)),
                    const SizedBox(height: 2),
                    Text(plural(c.sousCategories.length, 'rayon'), style: TextStyle(color: t.textMuted, fontSize: 12)),
                  ]),
                ),
              ),
          ]);
        }),
        const SizedBox(height: Space.s5),
        ListGroup(title: 'Sélections', children: [
          ListRow(icon: Icons.fiber_new_outlined, title: 'Nouveautés', onTap: () => context.openShared('nouveautes')),
          ListRow(icon: Icons.trending_up, title: 'Meilleures ventes', onTap: () => context.openShared('meilleures-ventes')),
          ListRow(icon: Icons.local_offer_outlined, title: 'Promotions', onTap: () => context.openShared('promotions')),
        ]),
      ],
    );
  }
}

/// Rayons d'un niveau en bulles défilantes : icône ronde et nom.
class RayonBubbles extends StatelessWidget {
  const RayonBubbles({super.key, required this.items});

  final List<(String, String, VoidCallback)> items;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    if (items.isEmpty) return const SizedBox.shrink();
    final scale = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 2.0);
    return SizedBox(
      height: 64 + 44 * scale,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, 0),
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(width: Space.s3),
        itemBuilder: (context, i) {
          final (_, label, onTap) = items[i];
          return SizedBox(
            width: 76,
            child: InkWell(
              borderRadius: BorderRadius.circular(Radii.md),
              onTap: onTap,
              child: Column(children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(color: t.surface, shape: BoxShape.circle, border: Border.all(color: t.border.withValues(alpha: 0.7))),
                  child: Icon(rayonIcon(label), color: t.text, size: 26),
                ),
                const SizedBox(height: Space.s1),
                Text(label, textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, height: 1.2)),
              ]),
            ),
          );
        },
      ),
    );
  }
}

/// Famille : ses catégories en bulles, ses produits en grille.
class FamillePage extends ConsumerWidget {
  const FamillePage({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final famille = ref.watch(familleProvider(id));
    if (famille.hasError) return _NotFound(what: 'Domaine', error: famille.error!);
    final f = famille.value;
    return ListingScreen(
      title: f?.nom ?? '',
      query: ListingQuery(familleId: id),
      header: RayonBubbles(items: [for (final c in f?.categories ?? const <Categorie>[]) (c.id, c.nom, () => context.openCategorie(c.id))]),
    );
  }
}

/// Catégorie : ses sous-catégories servent de filtres, sur place.
class CategoriePage extends ConsumerStatefulWidget {
  const CategoriePage({super.key, required this.id});

  final String id;

  @override
  ConsumerState<CategoriePage> createState() => _CategoriePageState();
}

class _CategoriePageState extends ConsumerState<CategoriePage> {
  String? _sous;

  @override
  Widget build(BuildContext context) {
    final categorie = ref.watch(categorieProvider(widget.id));
    if (categorie.hasError) return _NotFound(what: 'Catégorie', error: categorie.error!);
    final c = categorie.value;
    final sous = c?.sousCategories ?? const <SousCategorie>[];
    return ListingScreen(
      title: c?.nom ?? '',
      query: _sous == null ? ListingQuery(categoryId: widget.id) : ListingQuery(sousCategoryId: _sous),
      chips: sous.isEmpty
          ? null
          : [
              ChipItem('Tout', active: _sous == null, onTap: () => setState(() => _sous = null)),
              for (final s in sous) ChipItem(s.nom, active: _sous == s.id, onTap: () => setState(() => _sous = s.id)),
            ],
    );
  }
}

class SousCategoriePage extends ConsumerWidget {
  const SousCategoriePage({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sous = ref.watch(sousCategorieProvider(id));
    if (sous.hasError) return _NotFound(what: 'Rayon', error: sous.error!);
    return ListingScreen(title: sous.value?.nom ?? '', query: ListingQuery(sousCategoryId: id));
  }
}

class _NotFound extends StatelessWidget {
  const _NotFound({required this.what, required this.error});

  final String what;
  final Object error;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(),
        body: Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.all(context.gutter),
            child: EmptyState(
              icon: Icons.search_off_rounded,
              title: '$what introuvable',
              text: errorMessage(error),
              actionLabel: 'Retour au catalogue',
              onAction: () => Navigator.of(context).maybePop(),
            ),
          ),
        ),
      );
}
