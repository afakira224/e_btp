import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../entities/taxonomy.dart';
import '../../../shared/utils/format.dart';
import '../../catalog/shared/catalog_api.dart';

// ─────────────────────────────────────────────
//  Recherches récentes : une commodité de l'appareil, pas une donnée de
//  compte (le back n'a pas d'historique de recherche). 6 au plus, sans
//  doublon à accents ou casse près — clé `btp.recentSearches` comme le web.
// ─────────────────────────────────────────────
class RecentSearches extends Notifier<List<String>> {
  static const _key = 'btp.recentSearches';
  static const _max = 6;

  @override
  List<String> build() => ref.read(prefsProvider).getStringList(_key) ?? const [];

  void remember(String term) {
    final trimmed = term.trim();
    if (trimmed.length < 2) return;
    final key = normalize(trimmed);
    state = [trimmed, ...state.where((e) => normalize(e) != key)].take(_max).toList();
    ref.read(prefsProvider).setStringList(_key, state);
  }

  void forget(String term) {
    state = state.where((e) => e != term).toList();
    ref.read(prefsProvider).setStringList(_key, state);
  }

  void clear() {
    state = const [];
    ref.read(prefsProvider).remove(_key);
  }
}

final recentSearchesProvider = NotifierProvider<RecentSearches, List<String>>(RecentSearches.new);

enum TaxonomyLevel {
  famille('Domaine'),
  categorie('Catégorie'),
  sousCategorie('Sous-catégorie');

  const TaxonomyLevel(this.label);
  final String label;
}

class RayonSuggestion {
  const RayonSuggestion(this.id, this.label, this.level, [this.parent]);
  final String id;
  final String label;
  final TaxonomyLevel level;
  final String? parent;
}

/// Rayons dont le nom contient la saisie, sans tenir compte des accents ; un
/// nom qui commence par la saisie passe devant : « ca » propose
/// « Carrelage » avant « Électricité & câblage ».
List<RayonSuggestion> matchTaxonomy(List<Famille> familles, String query, {int limit = 4}) {
  final needle = normalize(query);
  if (needle.isEmpty) return const [];
  final found = <(int, RayonSuggestion)>[];
  void consider(RayonSuggestion s) {
    final name = normalize(s.label);
    final pos = name.indexOf(needle);
    if (pos < 0) return;
    found.add((pos == 0 ? 0 : (name[pos - 1] == ' ' ? 1 : 2), s));
  }

  for (final f in familles.where((f) => f.actif)) {
    consider(RayonSuggestion(f.id, f.nom, TaxonomyLevel.famille));
    for (final c in f.categories.where((c) => c.actif)) {
      consider(RayonSuggestion(c.id, c.nom, TaxonomyLevel.categorie, f.nom));
      for (final s in c.sousCategories.where((s) => s.actif)) {
        consider(RayonSuggestion(s.id, s.nom, TaxonomyLevel.sousCategorie, c.nom));
      }
    }
  }
  found.sort((a, b) => a.$1 != b.$1 ? a.$1 - b.$1 : a.$2.label.compareTo(b.$2.label));
  return found.take(limit).map((e) => e.$2).toList();
}

/// Critères de recherche ⇄ paramètres d'URL, mêmes noms que le web
/// (`q`, `famille`, `categorie`, `sousCategorie`, `prixMin`, `prixMax`,
/// `enStock`, `promo`, `tri`) : un lien partagé rouvre la même recherche.
ListingQuery parseSearchParams(Map<String, String> p) {
  final sort = ListingSort.values.where((s) => s.value == p['tri']).firstOrNull ?? ListingSort.popular;
  final sous = p['sousCategorie'];
  final cat = sous == null ? p['categorie'] : null;
  final fam = sous == null && cat == null ? p['famille'] : null;
  final q = p['q']?.trim();
  return ListingQuery(
    q: (q == null || q.isEmpty) ? null : q,
    sousCategoryId: sous,
    categoryId: cat,
    familleId: fam,
    minPrice: int.tryParse(p['prixMin'] ?? ''),
    maxPrice: int.tryParse(p['prixMax'] ?? ''),
    inStock: p['enStock'] == '1',
    discounted: p['promo'] == '1',
    sort: sort,
  );
}

Map<String, String> toSearchParams(ListingQuery q) => {
      if (q.q != null) 'q': q.q!,
      if (q.familleId != null) 'famille': q.familleId!,
      if (q.categoryId != null) 'categorie': q.categoryId!,
      if (q.sousCategoryId != null) 'sousCategorie': q.sousCategoryId!,
      if (q.minPrice != null) 'prixMin': '${q.minPrice}',
      if (q.maxPrice != null) 'prixMax': '${q.maxPrice}',
      if (q.inStock) 'enStock': '1',
      if (q.discounted) 'promo': '1',
      if (q.sort != ListingSort.popular) 'tri': q.sort.value,
    };
