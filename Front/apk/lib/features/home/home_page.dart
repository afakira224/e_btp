import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/navigation.dart';
import '../../app/theme/theme.dart';
import '../../app/theme/tokens.dart';
import '../../entities/product.dart';
import '../../entities/promotion.dart';
import '../../entities/shop.dart';
import '../../shared/ui/countdown.dart';
import '../../shared/ui/kit.dart';
import '../../shared/ui/paged.dart';
import '../../shared/ui/responsive.dart';
import '../../shared/ui/states.dart';
import '../../shared/utils/format.dart';
import '../auth/shared/auth_controller.dart';
import '../auth/shared/auth_widgets.dart';
import '../catalog/browse/browse_pages.dart';
import '../catalog/shared/catalog_api.dart';
import '../catalog/shared/product_card.dart';
import '../catalog/shared/product_grid.dart';
import '../shops/shops_pages.dart';
import '../wishlist/shared/wishlist_controller.dart';

final _shopsPreviewProvider = FutureProvider.autoDispose<List<Shop>>((ref) async => (await ref.watch(catalogApiProvider).shops(page: 1, limit: 8)).items);

// ─────────────────────────────────────────────
//  Accueil — vitrine mobile : recherche dans l'en-tête, raccourcis,
//  bannières, rayons en bulles, carrousels, puis « Pour vous » chargé au
//  défilement. Tirer vers le bas recharge tout.
// ─────────────────────────────────────────────
class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  late final PagedController<ProductBoutique> _recommended =
      PagedController((page) => ref.read(catalogApiProvider).search(const ListingQuery(), page, 8), idOf: (o) => o.id);

  static const _newest = (ListingQuery(sort: ListingSort.newest), 8);

  @override
  void dispose() {
    _recommended.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref
      ..invalidate(categoriesProvider)
      ..invalidate(listingPreviewProvider(_newest))
      ..invalidate(featuredProvider)
      ..invalidate(flashSalesProvider)
      ..invalidate(_shopsPreviewProvider);
    await _recommended.refresh();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final newest = ref.watch(listingPreviewProvider(_newest));
    final featured = ref.watch(featuredProvider);
    final categories = ref.watch(categoriesProvider);
    final user = ref.watch(authProvider).user;
    final favorites = ref.watch(wishlistCountProvider);

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: LoadMoreListener(
          onReachEnd: _recommended.loadMore,
          child: CustomScrollView(
            slivers: [
              chromeSliverAppBar(
                context,
                title: 'BTP',
                titleWidget: Row(children: [
                  const BrandMark(size: 36),
                  const SizedBox(width: Space.s3),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                      Text(user == null ? 'BTP Platform' : 'Bonjour ${user.prenom}',
                          maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.onChrome, fontSize: 17, fontWeight: FontWeight.w700)),
                      Text('Matériaux de construction · Conakry', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.onChromeMuted, fontSize: 12)),
                    ]),
                  ),
                ]),
                actions: [
                  IconButton(
                    tooltip: 'Mes favoris',
                    onPressed: () {
                      if (requireSession(context, ref)) context.go('/compte/favoris');
                    },
                    icon: Badge(isLabelVisible: favorites > 0, label: Text('$favorites'), child: const Icon(Icons.favorite_border)),
                  ),
                  const SizedBox(width: Space.s1),
                ],
                bottom: ChromeSearchField(onTap: () => context.openSearch()),
              ),
              const SliverToBoxAdapter(child: _Shortcuts()),
              const SliverToBoxAdapter(child: _Banners()),
              SliverToBoxAdapter(
                child: categories.when(
                  loading: () => Padding(padding: EdgeInsets.all(context.gutter), child: const Skeleton(height: 96)),
                  error: (_, _) => const SizedBox.shrink(),
                  data: (list) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    SectionHeader(title: 'Rayons', onMore: () => context.go('/catalogue')),
                    RayonBubbles(items: [for (final c in list) (c.id, c.nom, () => context.openCategorie(c.id))]),
                  ]),
                ),
              ),
              SliverToBoxAdapter(
                child: ProductRail(
                  title: 'Nouveautés',
                  subtitle: 'Tout juste mis en rayon',
                  items: newest.value?.items ?? const [],
                  loading: newest.isLoading,
                  onMore: () => context.openShared('nouveautes'),
                ),
              ),
              SliverToBoxAdapter(child: _TopSellers(items: (featured.value ?? const []).take(3).toList(), loading: featured.isLoading)),
              const SliverToBoxAdapter(child: _ShopsRail()),
              const SliverToBoxAdapter(child: SectionHeader(title: 'Pour vous')),
              PagedProductSliver(controller: _recommended, emptyTitle: 'Rien à proposer', emptyText: 'Le catalogue est vide pour le moment.'),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Raccourcis ────────────────────────────────
class _Shortcuts extends StatelessWidget {
  const _Shortcuts();

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final items = [
      (Icons.fiber_new_outlined, 'Nouveautés', () => context.openShared('nouveautes')),
      (Icons.trending_up, 'Top ventes', () => context.openShared('meilleures-ventes')),
      (Icons.local_offer_outlined, 'Promos', () => context.openShared('promotions')),
      (Icons.storefront_outlined, 'Boutiques', () => context.go('/boutiques')),
    ];
    return Padding(
      padding: EdgeInsets.fromLTRB(context.gutter, Space.s4, context.gutter, 0),
      child: Row(children: [
        for (final (icon, label, onTap) in items)
          Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(Radii.md),
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: Space.s2),
                child: Column(children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: t.surface,
                      borderRadius: BorderRadius.circular(Radii.lg),
                      border: Border.all(color: t.border.withValues(alpha: 0.7)),
                      boxShadow: [BoxShadow(color: t.shadow, blurRadius: 10, offset: const Offset(0, 3))],
                    ),
                    child: Icon(icon, color: t.text),
                  ),
                  const SizedBox(height: Space.s2),
                  Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                ]),
              ),
            ),
          ),
      ]),
    );
  }
}

// ── Bannières ─────────────────────────────────
class _Banner {
  const _Banner({required this.title, required this.text, required this.icon, required this.onTap, this.sale, this.dark = false});
  final String title;
  final String text;
  final IconData icon;
  final void Function(BuildContext) onTap;
  final Promotion? sale;
  final bool dark;
}

class _Banners extends ConsumerStatefulWidget {
  const _Banners();

  @override
  ConsumerState<_Banners> createState() => _BannersState();
}

class _BannersState extends ConsumerState<_Banners> {
  final _controller = PageController(viewportFraction: 0.9);
  Timer? _timer;
  int _index = 0;
  bool _paused = false;
  int _count = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _schedule();
  }

  void _schedule() {
    _timer?.cancel();
    if (_paused || MediaQuery.of(context).disableAnimations) return;
    _timer = Timer.periodic(const Duration(milliseconds: 6000), (_) {
      if (!_controller.hasClients || _count < 2) return;
      _controller.animateToPage((_index + 1) % _count, duration: const Duration(milliseconds: 480), curve: Curves.easeOutCubic);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final sale = ref.watch(flashSalesProvider).value?.firstOrNull;
    final signedIn = ref.watch(authProvider).isAuthenticated;
    final banners = [
      if (sale != null)
        _Banner(
          title: sale.nom,
          text: "Jusqu'à −${sale.isPercentage ? formatPercent(sale.discountValue) : formatPrice(sale.discountValue)} · se termine dans",
          icon: Icons.bolt,
          sale: sale,
          dark: true,
          onTap: (c) => c.openShared('promotions'),
        )
      else
        _Banner(title: 'Tout le chantier, au même endroit', text: 'Ciment, fer, carrelage, outillage : les dépôts de Conakry.', icon: Icons.foundation, dark: true, onTap: (c) => c.go('/catalogue')),
      _Banner(title: "Jusqu'à −20 % en déstockage", text: 'Fins de série et surplus de dépôt, quantités limitées.', icon: Icons.local_offer_outlined, onTap: (c) => c.openShared('promotions')),
      _Banner(
        title: 'Compte professionnel',
        text: 'Tarifs négociés et paiement à 30 jours pour vos chantiers.',
        icon: Icons.business_center_outlined,
        onTap: (c) => signedIn ? showMessage(c, 'Les comptes professionnels arrivent bientôt.') : c.push('/signup'),
      ),
    ];
    _count = banners.length;
    final scale = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.6);

    return Listener(
      // Le défilement automatique s'arrête dès que l'utilisateur touche.
      onPointerDown: (_) {
        _paused = true;
        _timer?.cancel();
      },
      child: Column(children: [
        const SizedBox(height: Space.s4),
        SizedBox(
          height: 156 * scale,
          child: PageView.builder(
            controller: _controller,
            padEnds: false,
            itemCount: banners.length,
            onPageChanged: (i) => setState(() => _index = i),
            itemBuilder: (context, i) {
              final b = banners[i];
              final fg = b.dark ? t.onChrome : t.text;
              final muted = b.dark ? t.onChromeMuted : t.textMuted;
              return Padding(
                padding: EdgeInsets.only(left: i == 0 ? context.gutter : Space.s2, right: i == banners.length - 1 ? context.gutter : 0),
                child: Semantics(
                  button: true,
                  label: '${i + 1} sur ${banners.length} — ${b.title}',
                  child: Material(
                    color: b.dark ? t.chrome : (i.isEven ? t.surfaceAlt : t.surface),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(Radii.lg),
                      side: b.dark ? BorderSide.none : BorderSide(color: t.border.withValues(alpha: 0.7)),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () => b.onTap(context),
                      child: Stack(children: [
                        Positioned(right: -18, bottom: -18, child: Icon(b.icon, size: 132, color: fg.withValues(alpha: 0.08))),
                        Padding(
                          padding: const EdgeInsets.all(Space.s4),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Icon(b.icon, color: fg, size: 22),
                            const SizedBox(height: Space.s2),
                            Text(b.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: fg, fontSize: 19, fontWeight: FontWeight.w700, height: 1.2, letterSpacing: -0.3)),
                            const SizedBox(height: Space.s1),
                            Text(b.text, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: muted, fontSize: 13)),
                            if (b.sale != null) ...[const SizedBox(height: Space.s1), Countdown(end: b.sale!.endDate, color: fg, compact: true)],
                          ]),
                        ),
                      ]),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: Space.s3),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          for (var i = 0; i < banners.length; i++)
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: i == _index ? 20 : 6,
              height: 6,
              decoration: BoxDecoration(color: i == _index ? t.text : t.border, borderRadius: BorderRadius.circular(3)),
            ),
        ]),
      ]),
    );
  }
}

// ── Meilleures ventes : le podium ─────────────
class _TopSellers extends StatelessWidget {
  const _TopSellers({required this.items, required this.loading});

  final List<ProductBoutique> items;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    if (!loading && items.isEmpty) return const SizedBox.shrink();
    final t = context.tokens;
    final rows = <Widget>[];
    for (var i = 0; i < items.length; i++) {
      rows.add(ProductRow(
        offer: items[i],
        leading: SizedBox(width: 26, child: Text('${i + 1}', textAlign: TextAlign.center, style: monoStyle(context, size: 20, color: t.text, weight: FontWeight.w700))),
      ));
      if (i < items.length - 1) rows.add(const Divider(indent: Space.s4));
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SectionHeader(title: 'Meilleures ventes', subtitle: 'Les plus plébiscités', onMore: () => context.openShared('meilleures-ventes')),
      Padding(
        padding: EdgeInsets.symmetric(horizontal: context.gutter),
        child: loading ? const Skeleton(height: 260) : AppCard(padding: EdgeInsets.zero, child: Column(children: rows)),
      ),
    ]);
  }
}

// ── Boutiques ─────────────────────────────────
class _ShopsRail extends ConsumerWidget {
  const _ShopsRail();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shops = ref.watch(_shopsPreviewProvider);
    final t = context.tokens;
    final list = shops.value ?? const <Shop>[];
    if (!shops.isLoading && list.isEmpty) return const SizedBox.shrink();
    final scale = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 2.0);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SectionHeader(title: 'Boutiques à découvrir', onMore: () => context.go('/boutiques')),
      SizedBox(
        height: 76 * scale,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: EdgeInsets.symmetric(horizontal: context.gutter),
          itemCount: shops.isLoading ? 3 : list.length,
          separatorBuilder: (_, _) => const SizedBox(width: Space.s3),
          itemBuilder: (context, i) => SizedBox(
            width: 230,
            child: shops.isLoading
                ? const Skeleton()
                : AppCard(
                    onTap: () => context.openShop(list[i].id),
                    padding: const EdgeInsets.all(Space.s3),
                    child: Row(children: [
                      ShopAvatar(shop: list[i], size: 44),
                      const SizedBox(width: Space.s3),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                          Text(list[i].nom, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                          if (list[i].district != null) Text(list[i].district!, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.textMuted, fontSize: 12)),
                        ]),
                      ),
                      Icon(Icons.chevron_right, color: t.textMuted),
                    ]),
                  ),
          ),
        ),
      ),
    ]);
  }
}
