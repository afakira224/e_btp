import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../entities/json.dart';
import '../../../entities/page.dart';
import '../../../entities/product.dart';
import '../../../entities/promotion.dart';
import '../../../entities/shop.dart';
import '../../../entities/taxonomy.dart';
import '../../../shared/api/api_client.dart';

// ─────────────────────────────────────────────
//  Lectures du catalogue, communes à toutes les features.
//  Les chemins reprennent ceux du back (Back/src/routers/router.router.ts).
// ─────────────────────────────────────────────

/// Tris acceptés par GET /product-boutiques/search.
enum ListingSort {
  popular('popular', 'Popularité'),
  newest('newest', 'Nouveautés'),
  priceAsc('price_asc', 'Prix croissant'),
  priceDesc('price_desc', 'Prix décroissant'),
  rating('rating', 'Mieux notés');

  const ListingSort(this.value, this.label);
  final String value;
  final String label;
}

/// Critères d'une liste d'offres : tous les paramètres de la recherche du back.
class ListingQuery {
  const ListingQuery({
    this.sort = ListingSort.popular,
    this.q,
    this.familleId,
    this.categoryId,
    this.sousCategoryId,
    this.minPrice,
    this.maxPrice,
    this.inStock = false,
    this.discounted = false,
    this.boutiqueId,
  });

  final ListingSort sort;
  final String? q;
  final String? familleId;
  final String? categoryId;
  final String? sousCategoryId;
  final int? minPrice;
  final int? maxPrice;
  final bool inStock;
  final bool discounted;
  final String? boutiqueId;

  Map<String, Object?> toParams() => {
        'q': q,
        'familleId': familleId,
        'categoryId': categoryId,
        'sousCategoryId': sousCategoryId,
        'minPrice': minPrice,
        'maxPrice': maxPrice,
        'inStock': inStock ? 'true' : null,
        'discounted': discounted ? 'true' : null,
        'boutiqueId': boutiqueId,
        'sort': sort.value,
      };

  /// Clé stable : une liste repart de zéro quand elle change.
  String get key => toParams().toString();

  ListingQuery copyWith({
    ListingSort? sort,
    String? Function()? q,
    String? Function()? familleId,
    String? Function()? categoryId,
    String? Function()? sousCategoryId,
    int? Function()? minPrice,
    int? Function()? maxPrice,
    bool? inStock,
    bool? discounted,
  }) =>
      ListingQuery(
        sort: sort ?? this.sort,
        q: q != null ? q() : this.q,
        familleId: familleId != null ? familleId() : this.familleId,
        categoryId: categoryId != null ? categoryId() : this.categoryId,
        sousCategoryId: sousCategoryId != null ? sousCategoryId() : this.sousCategoryId,
        minPrice: minPrice != null ? minPrice() : this.minPrice,
        maxPrice: maxPrice != null ? maxPrice() : this.maxPrice,
        inStock: inStock ?? this.inStock,
        discounted: discounted ?? this.discounted,
        boutiqueId: boutiqueId,
      );

  // Égalité de valeur : les providers « family » s'en servent comme clé.
  @override
  bool operator ==(Object other) => other is ListingQuery && other.key == key;

  @override
  int get hashCode => key.hashCode;
}

class PriceRange {
  const PriceRange(this.min, this.max);
  final double min;
  final double max;
}

class SearchPage extends PageOf<ProductBoutique> {
  const SearchPage({required super.items, required super.total, required super.page, required super.hasMore, this.priceRange});
  final PriceRange? priceRange;
}

class CatalogApi {
  const CatalogApi(this._api);

  final ApiClient _api;

  Future<List<Famille>> familles() async => (await _api.get('/familles')).list.cast<Map>().map((e) => Famille.fromJson(e.cast())).toList();

  Future<List<Categorie>> categories() async =>
      (await _api.get('/categories')).list.cast<Map>().map((e) => Categorie.fromJson(e.cast())).toList();

  Future<Famille> famille(String id) async => Famille.fromJson((await _api.get('/familles/${Uri.encodeComponent(id)}')).map);
  Future<Categorie> categorie(String id) async => Categorie.fromJson((await _api.get('/categories/${Uri.encodeComponent(id)}')).map);
  Future<SousCategorie> sousCategorie(String id) async =>
      SousCategorie.fromJson((await _api.get('/sous-categories/${Uri.encodeComponent(id)}')).map);

  /// GET /product-boutiques/search — texte, taxonomie, prix, stock, remise, tri.
  Future<SearchPage> search(ListingQuery query, int page, int limit) async {
    final res = await _api.get('/product-boutiques/search${query_({...query.toParams(), 'page': page, 'limit': limit})}');
    final data = res.data is Map ? res.map : <String, dynamic>{};
    final range = object(data, 'priceRange');
    final current = integer(data, 'page', page);
    return SearchPage(
      items: objects(data, 'items').map(ProductBoutique.fromJson).toList(),
      total: integer(data, 'total'),
      page: current,
      hasMore: current < integer(data, 'totalPages'),
      priceRange: range == null ? null : PriceRange(number(range, 'min'), number(range, 'max')),
    );
  }

  Future<List<ProductBoutique>> _offers(String path) async {
    final res = await _api.get(path);
    final data = res.data;
    final list = data is Map ? objects(data.cast<String, dynamic>(), 'items') : (data as List? ?? const []).cast<Map>().map((e) => e.cast<String, dynamic>()).toList();
    return list.map(ProductBoutique.fromJson).toList();
  }

  /// Détail d'une offre. Le back l'ajoute aux « récemment vus » d'un utilisateur connecté.
  Future<ProductBoutique> offer(String id) async => ProductBoutique.fromJson((await _api.get('/product-boutiques/${Uri.encodeComponent(id)}')).map);

  /// Cascade de pertinence du back : sous-catégorie > catégorie > famille.
  Future<List<ProductBoutique>> suggestions(String id, {int limit = 8}) => _offers('/product-boutiques/${Uri.encodeComponent(id)}/suggestions?limit=$limit');

  Future<List<ProductBoutique>> shopOffers(String shopId) => _offers('/product-boutiques?boutiqueId=${Uri.encodeComponent(shopId)}&page=1&limit=10');

  /// Meilleures ventes de l'accueil : offres mises en avant, les plus commentées d'abord.
  Future<List<ProductBoutique>> featured() async {
    final list = await _offers('/product-boutiques?isFeatured=true&page=1&limit=10');
    return list..sort((a, b) => (b.reviewsCount ?? 0).compareTo(a.reviewsCount ?? 0));
  }

  Future<List<ProductBoutique>> recentlyViewed(String userId) => _offers('/product-boutiques/recently-viewed/${Uri.encodeComponent(userId)}');

  /// Ventes flash en cours, la plus proche de sa fin d'abord.
  Future<List<Promotion>> flashSales() async =>
      (await _api.get('/promotions/flash/active')).list.cast<Map>().map((e) => Promotion.fromJson(e.cast())).toList();

  /// GET /shops renvoie `{ shops, total, page, totalPages }` en documents bruts.
  Future<PageOf<Shop>> shops({String? search, required int page, int limit = 12}) async {
    final data = (await _api.get('/shops${query_({'search': search, 'page': page, 'limit': limit})}')).map;
    final current = integer(data, 'page', page);
    return PageOf(
      items: objects(data, 'shops').map(Shop.fromJson).toList(),
      total: integer(data, 'total'),
      page: current,
      hasMore: current < integer(data, 'totalPages'),
    );
  }

  Future<Shop> shop(String id) async => Shop.fromJson((await _api.get('/shops/${Uri.encodeComponent(id)}')).map);
}

// Alias local : `query` est aussi un nom de paramètre courant.
String query_(Map<String, Object?> params) => query(params);

final catalogApiProvider = Provider((ref) => CatalogApi(ref.watch(apiClientProvider)));

/// L'arbre des domaines change rarement : lu une fois et gardé.
final famillesProvider = FutureProvider<List<Famille>>((ref) => ref.watch(catalogApiProvider).familles());
final categoriesProvider = FutureProvider<List<Categorie>>((ref) => ref.watch(catalogApiProvider).categories());

final familleProvider = FutureProvider.autoDispose.family<Famille, String>((ref, id) => ref.watch(catalogApiProvider).famille(id));
final categorieProvider = FutureProvider.autoDispose.family<Categorie, String>((ref, id) => ref.watch(catalogApiProvider).categorie(id));
final sousCategorieProvider = FutureProvider.autoDispose.family<SousCategorie, String>((ref, id) => ref.watch(catalogApiProvider).sousCategorie(id));
final offerProvider = FutureProvider.autoDispose.family<ProductBoutique, String>((ref, id) => ref.watch(catalogApiProvider).offer(id));
final suggestionsProvider = FutureProvider.autoDispose.family<List<ProductBoutique>, String>((ref, id) => ref.watch(catalogApiProvider).suggestions(id));
final shopOffersProvider = FutureProvider.autoDispose.family<List<ProductBoutique>, String>((ref, id) => ref.watch(catalogApiProvider).shopOffers(id));
final shopProvider = FutureProvider.autoDispose.family<Shop, String>((ref, id) => ref.watch(catalogApiProvider).shop(id));
final flashSalesProvider = FutureProvider.autoDispose<List<Promotion>>((ref) => ref.watch(catalogApiProvider).flashSales());
final featuredProvider = FutureProvider.autoDispose<List<ProductBoutique>>((ref) => ref.watch(catalogApiProvider).featured());

/// Première page d'une liste : aperçus (accueil, cartes boutique, décomptes).
final listingPreviewProvider = FutureProvider.autoDispose.family<SearchPage, (ListingQuery, int)>(
  (ref, args) => ref.watch(catalogApiProvider).search(args.$1, 1, args.$2),
);
