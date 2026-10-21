/// Page d'une liste paginée. Le back renvoie `{ items|shops|orders, total,
/// page, totalPages }` ; « il y en a d'autres » se déduit de `page < totalPages`.
class PageOf<T> {
  const PageOf({required this.items, required this.total, required this.page, required this.hasMore});

  final List<T> items;
  final int total;
  final int page;
  final bool hasMore;

  static PageOf<T> empty<T>() => PageOf<T>(items: const [], total: 0, page: 1, hasMore: false);
}
