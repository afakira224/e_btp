import 'package:flutter/widgets.dart';

import '../../entities/page.dart';
import '../api/api_exception.dart';

typedef PageLoader<T> = Future<PageOf<T>> Function(int page);

// ─────────────────────────────────────────────
//  Liste chargée page par page, portage de useInfiniteProducts.
//
//  Les garde-fous du web sont repris : une seule requête à la fois, la
//  liste se fige quand le serveur annonce la fin, et une réponse périmée
//  (critères changés entre-temps) est ignorée grâce au numéro de
//  génération.
// ─────────────────────────────────────────────
class PagedController<T> extends ChangeNotifier {
  PagedController(this._loader, {String Function(T item)? idOf}) : _idOf = idOf { // ignore: prefer_initializing_formals
    loadMore();
  }

  PageLoader<T> _loader;
  final String Function(T item)? _idOf;

  final List<T> items = [];
  bool isLoading = false;
  String? error;
  int total = 0;
  bool hasMore = true;
  bool loadedOnce = false;
  int _next = 1;
  int _generation = 0;
  bool _disposed = false;

  bool get isFirstLoad => isLoading && items.isEmpty;

  /// Remet la liste à zéro avec un nouveau chargeur (filtres changés).
  void reset([PageLoader<T>? loader]) {
    if (loader != null) _loader = loader;
    _generation++;
    items.clear();
    isLoading = false;
    error = null;
    total = 0;
    hasMore = true;
    loadedOnce = false;
    _next = 1;
    notifyListeners();
    loadMore();
  }

  Future<void> refresh() async => reset();

  Future<void> loadMore() async {
    if (isLoading || !hasMore || _disposed) return;
    final gen = _generation;
    isLoading = true;
    error = null;
    notifyListeners();
    try {
      final page = await _loader(_next);
      if (gen != _generation || _disposed) return;
      final seen = _idOf == null ? <String>{} : items.map(_idOf).toSet();
      items.addAll(_idOf == null ? page.items : page.items.where((i) => !seen.contains(_idOf(i))));
      total = page.total;
      hasMore = page.hasMore;
      _next++;
    } catch (e) {
      if (gen != _generation || _disposed) return;
      error = errorMessage(e);
    } finally {
      if (gen == _generation && !_disposed) {
        isLoading = false;
        loadedOnce = true;
        notifyListeners();
      }
    }
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

/// Déclenche `onReachEnd` quand le défilement approche du bas (500 px
/// d'avance) : la page suivante arrive avant que l'utilisateur ne touche le
/// fond.
class LoadMoreListener extends StatelessWidget {
  const LoadMoreListener({super.key, required this.onReachEnd, required this.child});

  final VoidCallback onReachEnd;
  final Widget child;

  @override
  Widget build(BuildContext context) => NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.metrics.axis == Axis.vertical && n.metrics.extentAfter < 500) onReachEnd();
          return false;
        },
        child: child,
      );
}
