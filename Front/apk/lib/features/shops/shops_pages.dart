import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/navigation.dart';
import '../../app/theme/theme.dart';
import '../../app/theme/tokens.dart';
import '../../entities/shop.dart';
import '../../shared/api/api_exception.dart';
import '../../shared/ui/kit.dart';
import '../../shared/ui/paged.dart';
import '../../shared/ui/responsive.dart';
import '../../shared/ui/states.dart';
import '../../shared/ui/thumbnail.dart';
import '../../shared/utils/format.dart';
import '../catalog/shared/catalog_api.dart';
import '../catalog/shared/listing_screen.dart';

// ─────────────────────────────────────────────
//  RÈGLE ABSOLUE : le numéro de téléphone d'une boutique n'est jamais
//  affiché, nulle part, sous aucune forme — ni texte, ni bouton d'appel, ni
//  lien tel:. Le modèle Shop ne porte d'ailleurs pas ce champ.
// ─────────────────────────────────────────────

/// Logo de la boutique, ou ses initiales sur fond anthracite.
class ShopAvatar extends StatelessWidget {
  const ShopAvatar({super.key, required this.shop, this.size = 48, this.onChrome = false});

  final Shop shop;
  final double size;

  /// Posé sur l'en-tête anthracite : fond clair, initiales foncées.
  final bool onChrome;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final bg = onChrome ? t.onChrome : t.chrome;
    final fg = onChrome ? t.chrome : t.onChrome;
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        clipBehavior: Clip.antiAlias,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(size > 56 ? Radii.lg : Radii.md)),
        child: shop.logo != null
            ? Image.network(shop.logo!, fit: BoxFit.cover, width: size, height: size, errorBuilder: (_, _, _) => Text(shop.initials, style: TextStyle(color: fg, fontWeight: FontWeight.w800, fontSize: size * 0.34)))
            : Text(shop.initials, style: TextStyle(color: fg, fontWeight: FontWeight.w800, fontSize: size * 0.34)),
      ),
    );
  }
}

// ── Annuaire ──────────────────────────────────
class ShopsPage extends ConsumerStatefulWidget {
  const ShopsPage({super.key});

  @override
  ConsumerState<ShopsPage> createState() => _ShopsPageState();
}

class _ShopsPageState extends ConsumerState<ShopsPage> {
  final _search = TextEditingController();
  Timer? _debounce;
  String _committed = '';
  late final PagedController<Shop> _paged = PagedController(_loader(''), idOf: (s) => s.id);

  PageLoader<Shop> _loader(String q) => (page) => ref.read(catalogApiProvider).shops(search: q.isEmpty ? null : q, page: page);

  void _onChanged(String value) {
    setState(() {});
    _debounce?.cancel();
    // 300 ms sans frappe avant d'interroger le serveur.
    _debounce = Timer(const Duration(milliseconds: 300), () {
      final q = value.trim();
      if (q == _committed) return;
      _committed = q;
      _paged.reset(_loader(q));
    });
  }

  void _clear() {
    _search.clear();
    _onChanged('');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    _paged.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final none = OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.md), borderSide: BorderSide.none);
    final field = SizedBox(
      height: 46,
      child: TextField(
        controller: _search,
        onChanged: _onChanged,
        textInputAction: TextInputAction.search,
        style: TextStyle(color: t.onChrome, fontSize: 15),
        cursorColor: t.onChrome,
        decoration: InputDecoration(
          hintText: 'Rechercher une boutique',
          hintStyle: TextStyle(color: t.onChromeMuted),
          filled: true,
          fillColor: t.chromeRaised,
          contentPadding: const EdgeInsets.symmetric(horizontal: Space.s3),
          prefixIcon: Icon(Icons.search, color: t.onChromeMuted),
          border: none,
          enabledBorder: none,
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(Radii.md), borderSide: BorderSide(color: t.onChromeMuted)),
          suffixIcon: _search.text.isEmpty ? null : IconButton(tooltip: 'Effacer', icon: Icon(Icons.cancel, color: t.onChromeMuted, size: 20), onPressed: _clear),
        ),
      ),
    );

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _paged.refresh,
        child: LoadMoreListener(
          onReachEnd: _paged.loadMore,
          child: ListenableBuilder(
            listenable: _paged,
            builder: (context, _) {
              final c = _paged;
              final columns = context.isExpanded ? 2 : 1;
              return CustomScrollView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                slivers: [
                  chromeSliverAppBar(context, title: 'Boutiques', bottom: field),
                  SliverPadding(
                    padding: EdgeInsets.fromLTRB(context.gutter, Space.s4, context.gutter, Space.s2),
                    sliver: SliverToBoxAdapter(
                      child: Text(
                        c.loadedOnce && c.error == null ? plural(c.total, 'dépôt partenaire', 'dépôts partenaires') : 'Chargement…',
                        style: TextStyle(color: t.textMuted, fontSize: 13, fontWeight: FontWeight.w500),
                      ),
                    ),
                  ),
                  if (c.error != null && c.items.isEmpty)
                    SliverPadding(padding: EdgeInsets.symmetric(horizontal: context.gutter), sliver: SliverToBoxAdapter(child: ErrorRetry(message: c.error!, onRetry: c.loadMore)))
                  else if (!c.loadedOnce)
                    SliverPadding(
                      padding: EdgeInsets.symmetric(horizontal: context.gutter),
                      sliver: SliverList.separated(itemCount: 4, separatorBuilder: (_, _) => const SizedBox(height: Space.s3), itemBuilder: (_, _) => const Skeleton(height: 150)),
                    )
                  else if (c.items.isEmpty)
                    SliverToBoxAdapter(
                      child: _committed.isEmpty
                          ? const EmptyState(icon: Icons.storefront_outlined, title: 'Aucune boutique', text: 'Les premiers dépôts partenaires arrivent bientôt.')
                          : EmptyState(
                              icon: Icons.search_off_rounded,
                              title: 'Aucune boutique « $_committed »',
                              text: 'La recherche porte sur le nom de la boutique. Essayez un mot plus court.',
                              actionLabel: 'Voir toutes les boutiques',
                              onAction: _clear,
                            ),
                    )
                  else ...[
                    SliverPadding(
                      padding: EdgeInsets.symmetric(horizontal: context.gutter),
                      sliver: SliverGrid(
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: columns,
                          mainAxisSpacing: Space.s3,
                          crossAxisSpacing: Space.s3,
                          mainAxisExtent: _shopCardExtent(context, columns),
                        ),
                        delegate: SliverChildBuilderDelegate((context, i) => _ShopCard(shop: c.items[i]), childCount: c.items.length),
                      ),
                    ),
                    SliverPadding(
                      padding: EdgeInsets.all(context.gutter),
                      sliver: SliverToBoxAdapter(
                        child: Center(
                          child: c.isLoading
                              ? const CircularProgressIndicator(strokeWidth: 2)
                              : (c.error != null ? ErrorRetry(message: c.error!, onRetry: c.loadMore) : const SizedBox.shrink()),
                        ),
                      ),
                    ),
                  ],
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

/// Hauteur d'une carte boutique : bandeau d'identité (suit la taille du
/// texte) + rangée de 4 vignettes carrées (suit la largeur de la carte).
double _shopCardExtent(BuildContext context, int columns) {
  final scale = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 2.0);
  final card = (context.screenWidth - context.gutter * 2 - Space.s3 * (columns - 1)) / columns;
  final thumb = (card - Space.s3 * 2 - Space.s2 * 3) / 4;
  return Space.s3 * 2 + 52 * scale + Space.s3 + thumb + 2;
}

/// Carte boutique : identité, nombre d'articles et aperçu de ses
/// meilleures ventes (une seule requête `search?boutiqueId=…&limit=4`).
class _ShopCard extends ConsumerWidget {
  const _ShopCard({required this.shop});

  final Shop shop;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final preview = ref.watch(listingPreviewProvider((ListingQuery(boutiqueId: shop.id), 4)));
    final items = preview.value?.items ?? const [];
    return AppCard(
      onTap: () => context.openShop(shop.id),
      padding: const EdgeInsets.all(Space.s3),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          ShopAvatar(shop: shop, size: 48),
          const SizedBox(width: Space.s3),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(shop.nom, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              Text(
                [if (shop.district != null) shop.district!, if (preview.value != null) plural(preview.value!.total, 'article')].join(' · '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: t.textMuted, fontSize: 13),
              ),
            ]),
          ),
          Icon(Icons.chevron_right, color: t.textMuted),
        ]),
        const Spacer(),
        ExcludeSemantics(
          child: Row(children: [
            for (var i = 0; i < 4; i++) ...[
              Expanded(
                child: preview.isLoading
                    ? const AspectRatio(aspectRatio: 1, child: Skeleton(radius: Radii.sm))
                    : i < items.length
                        ? ProductThumbnail(url: items[i].image, seed: items[i].id)
                        : AspectRatio(aspectRatio: 1, child: DecoratedBox(decoration: BoxDecoration(color: t.surfaceAlt.withValues(alpha: 0.5), borderRadius: BorderRadius.circular(Radii.sm)))),
              ),
              if (i < 3) const SizedBox(width: Space.s2),
            ],
          ]),
        ),
      ]),
    );
  }
}

// ── Page d'une boutique ───────────────────────
class ShopPage extends ConsumerWidget {
  const ShopPage({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shop = ref.watch(shopProvider(id));
    return shop.when(
      loading: () => Scaffold(appBar: chromeAppBar(context, title: ''), body: Padding(padding: EdgeInsets.all(context.gutter), child: const Skeleton(height: 260))),
      error: (e, _) => Scaffold(
        appBar: AppBar(),
        body: Center(
          child: EmptyState(
            icon: Icons.storefront_outlined,
            title: 'Boutique introuvable',
            text: errorMessage(e),
            actionLabel: 'Voir toutes les boutiques',
            onAction: () => Navigator.of(context).maybePop(),
          ),
        ),
      ),
      data: (s) => _ShopView(shop: s),
    );
  }
}

class _ShopView extends ConsumerStatefulWidget {
  const _ShopView({required this.shop});

  final Shop shop;

  @override
  ConsumerState<_ShopView> createState() => _ShopViewState();
}

class _ShopViewState extends ConsumerState<_ShopView> {
  final _search = TextEditingController();
  Timer? _debounce;
  String _q = '';
  bool _promo = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onSearch(String value) {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () => setState(() => _q = value.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final s = widget.shop;
    final scale = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.6);
    // Les chiffres décrivent la boutique, pas la sélection en cours.
    final all = ref.watch(listingPreviewProvider((ListingQuery(boutiqueId: s.id), 1)));
    final promo = ref.watch(listingPreviewProvider((ListingQuery(boutiqueId: s.id, discounted: true), 1)));

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        body: NestedScrollView(
          headerSliverBuilder: (context, _) => [
            SliverOverlapAbsorber(
              handle: NestedScrollView.sliverOverlapAbsorberHandleFor(context),
              sliver: SliverAppBar(
                pinned: true,
                expandedHeight: kToolbarHeight + 48 + 136 * scale,
                backgroundColor: t.chrome,
                foregroundColor: t.onChrome,
                surfaceTintColor: Colors.transparent,
                systemOverlayStyle: chromeOverlay(t),
                title: Text(s.nom, style: TextStyle(color: t.onChrome, fontWeight: FontWeight.w700, fontSize: 18)),
                flexibleSpace: FlexibleSpaceBar(
                  collapseMode: CollapseMode.pin,
                  background: SafeArea(
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(context.gutter, kToolbarHeight, context.gutter, 48 + Space.s3),
                      child: Column(mainAxisAlignment: MainAxisAlignment.end, crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          ShopAvatar(shop: s, size: 60, onChrome: true),
                          const SizedBox(width: Space.s3),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text('Dépôt partenaire', style: TextStyle(color: t.onChromeMuted, fontSize: 12)),
                              if (s.district != null) Text(s.district!, style: TextStyle(color: t.onChrome, fontWeight: FontWeight.w600, fontSize: 15)),
                            ]),
                          ),
                        ]),
                        const SizedBox(height: Space.s4),
                        Row(children: [
                          _Stat(value: all.value == null ? '—' : '${all.value!.total}', label: 'Articles'),
                          _Stat(value: promo.value == null ? '—' : '${promo.value!.total}', label: 'En promo'),
                          if (s.createdAt != null) _Stat(value: '${s.createdAt!.year}', label: 'Depuis'),
                        ]),
                      ]),
                    ),
                  ),
                ),
                bottom: TabBar(
                  labelColor: t.onChrome,
                  unselectedLabelColor: t.onChromeMuted,
                  indicatorColor: t.onChrome,
                  indicatorSize: TabBarIndicatorSize.tab,
                  dividerColor: Colors.transparent,
                  tabs: const [Tab(text: 'Articles'), Tab(text: 'Infos')],
                ),
              ),
            ),
          ],
          body: TabBarView(children: [
            Builder(
              builder: (context) => ListingBody(
                key: const PageStorageKey('articles'),
                leadingSlivers: [SliverOverlapInjector(handle: NestedScrollView.sliverOverlapAbsorberHandleFor(context))],
                query: ListingQuery(boutiqueId: s.id, q: _q.isEmpty ? null : _q, discounted: _promo),
                familleChips: true,
                chips: [ChipItem('En promotion', icon: Icons.local_offer_outlined, active: _promo, onTap: () => setState(() => _promo = !_promo))],
                header: Padding(
                  padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, 0),
                  child: TextField(
                    controller: _search,
                    onChanged: _onSearch,
                    textInputAction: TextInputAction.search,
                    decoration: InputDecoration(
                      hintText: 'Rechercher dans la boutique',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: _search.text.isEmpty
                          ? null
                          : IconButton(
                              tooltip: 'Effacer',
                              icon: const Icon(Icons.cancel, size: 20),
                              onPressed: () {
                                _search.clear();
                                _onSearch('');
                              },
                            ),
                    ),
                  ),
                ),
                emptyTitle: _q.isNotEmpty || _promo ? 'Aucun article trouvé' : 'Rien en rayon pour le moment',
                emptyText: _q.isNotEmpty || _promo ? 'Retirez un filtre ou cherchez un terme plus général.' : 'Les premiers articles apparaîtront ici dès leur publication.',
              ),
            ),
            Builder(
              builder: (context) => CustomScrollView(
                key: const PageStorageKey('infos'),
                slivers: [
                  SliverOverlapInjector(handle: NestedScrollView.sliverOverlapAbsorberHandleFor(context)),
                  SliverPadding(padding: EdgeInsets.all(context.gutter), sliver: SliverToBoxAdapter(child: _ShopInfo(shop: s))),
                ],
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Expanded(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(value, style: monoStyle(context, size: 18, color: t.onChrome, weight: FontWeight.w700)),
        Text(label, style: TextStyle(color: t.onChromeMuted, fontSize: 12)),
      ]),
    );
  }
}

/// Onglet Infos : coordonnées (adresse, e-mail) — jamais de téléphone.
class _ShopInfo extends StatelessWidget {
  const _ShopInfo({required this.shop});

  final Shop shop;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final s = shop;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (s.description != null) ...[
        ListGroup(title: 'À propos', children: [
          Padding(padding: const EdgeInsets.all(Space.s4), child: Text(s.description!, style: TextStyle(color: t.text, height: 1.5))),
        ]),
        const SizedBox(height: Space.s5),
      ],
      ListGroup(
        title: 'Coordonnées',
        footer: 'Pour toute question sur une commande, écrivez à la boutique.',
        children: [
          if (s.adresse != null)
            ListRow(
              icon: Icons.place_outlined,
              title: 'Adresse',
              subtitle: s.adresse,
              trailing: Icon(Icons.directions_outlined, color: t.text),
              onTap: () => launchUrl(Uri.parse('https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(s.adresse!)}'), mode: LaunchMode.externalApplication),
            ),
          if (s.email != null)
            ListRow(
              icon: Icons.mail_outline,
              title: 'E-mail',
              subtitle: s.email,
              trailing: Icon(Icons.open_in_new, color: t.text, size: 20),
              onTap: () => launchUrl(Uri(scheme: 'mailto', path: s.email)),
            ),
          if (s.adresse == null && s.email == null) const ListRow(icon: Icons.info_outline, title: 'Coordonnées non renseignées'),
        ],
      ),
      if (s.createdAt != null) ...[
        const SizedBox(height: Space.s5),
        ListGroup(children: [ListRow(icon: Icons.event_outlined, title: 'Sur la plateforme depuis', value: formatMonthYear(s.createdAt!))]),
      ],
    ]);
  }
}
