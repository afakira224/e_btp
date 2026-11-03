import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../../app/navigation.dart';
import '../../../app/theme/theme.dart';
import '../../../app/theme/tokens.dart';
import '../../../entities/product.dart';
import '../../../shared/api/api_exception.dart';
import '../../../shared/config/env.dart';
import '../../../shared/ui/badge.dart';
import '../../../shared/ui/countdown.dart';
import '../../../shared/ui/kit.dart';
import '../../../shared/ui/responsive.dart';
import '../../../shared/ui/states.dart';
import '../../../shared/ui/thumbnail.dart';
import '../../../shared/utils/format.dart';
import '../../auth/shared/auth_controller.dart';
import '../../cart/shared/cart_controller.dart';
import '../../shops/shops_pages.dart';
import '../../wishlist/shared/wishlist_controller.dart';
import '../shared/catalog_api.dart';
import '../shared/product_card.dart';
import '../shared/product_grid.dart';
import '../shared/sponsored_rail.dart';

final _recentlyViewedProvider = FutureProvider.autoDispose.family<List<ProductBoutique>, String>((ref, key) {
  final userId = key.split(':').first;
  return userId.isEmpty ? Future.value(const []) : ref.watch(catalogApiProvider).recentlyViewed(userId);
});

// ─────────────────────────────────────────────
//  Fiche produit — l'identifiant est celui de l'offre (GET
//  /product-boutiques/:id) : un même produit vendu par deux dépôts a deux
//  fiches et deux prix. Photo plein cadre, barre d'achat collée en bas.
// ─────────────────────────────────────────────
class ProductPage extends ConsumerWidget {
  const ProductPage({super.key, required this.id, this.src});

  final String id;

  /// D'où vient la visite : `boost:<id>` depuis une place sponsorisée.
  final String? src;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offer = ref.watch(offerProvider((id, src)));
    return offer.when(
      loading: () => Scaffold(
        appBar: AppBar(),
        body: ListView(padding: EdgeInsets.all(context.gutter), children: const [
          AspectRatio(aspectRatio: 1, child: Skeleton(radius: Radii.lg)),
          SizedBox(height: Space.s4),
          Skeleton(height: 28, width: 220),
          SizedBox(height: Space.s3),
          Skeleton(height: 36, width: 160),
        ]),
      ),
      error: (e, _) => Scaffold(
        appBar: AppBar(),
        body: Center(
          child: EmptyState(icon: Icons.search_off_rounded, title: 'Produit introuvable', text: errorMessage(e), actionLabel: 'Retour au catalogue', onAction: () => context.go('/catalogue')),
        ),
      ),
      data: (o) => _ProductView(offer: o),
    );
  }
}

class _ProductView extends ConsumerWidget {
  const _ProductView({required this.offer});

  final ProductBoutique offer;

  Future<void> _toggleFavorite(BuildContext context, WidgetRef ref, bool favorite) async {
    if (!requireSession(context, ref)) return;
    try {
      await ref.read(wishlistProvider.notifier).toggle(offer.id);
      HapticFeedback.lightImpact();
      if (context.mounted) showMessage(context, favorite ? 'Retiré des favoris' : 'Ajouté aux favoris');
    } catch (e) {
      if (context.mounted) showMessage(context, errorMessage(e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final favorite = ref.watch(wishlistProvider.select((w) => w.has(offer.id)));
    final userId = ref.watch(currentUserIdProvider);
    final similar = ref.watch(suggestionsProvider(offer.id));
    final shopOffers = offer.boutique == null ? null : ref.watch(shopOffersProvider(offer.boutique!.id));
    final recent = ref.watch(_recentlyViewedProvider('$userId:${offer.id}'));
    final images = offer.urlImages.isNotEmpty ? offer.urlImages : (offer.product?.urlImages ?? const <String>[]);
    final galleryHeight = (context.isExpanded ? 420.0 : context.screenWidth).clamp(260.0, 520.0);

    final specs = [
      if (offer.famille != null) ('Domaine', offer.famille!.nom),
      if (offer.categorie != null) ('Catégorie', offer.categorie!.nom),
      if (offer.sousCategorie != null) ('Rayon', offer.sousCategorie!.nom),
      ('Vendu par', offer.shopName),
      ('Référence', offer.id),
    ];

    return Scaffold(
      bottomNavigationBar: _BuyBar(offer: offer),
      body: CustomScrollView(slivers: [
        SliverAppBar(
          pinned: true,
          stretch: true,
          expandedHeight: galleryHeight,
          backgroundColor: t.surface,
          leadingWidth: 64,
          leading: Center(child: CircleAction(icon: Icons.arrow_back, tooltip: 'Retour', onPressed: () => Navigator.of(context).maybePop())),
          actions: [
            CircleAction(
              icon: Icons.ios_share,
              tooltip: 'Partager',
              onPressed: () => SharePlus.instance.share(ShareParams(text: '${offer.name} — ${formatPrice(offer.effectivePrice)}\n${Env.webUrl}/produits/${offer.id}')),
            ),
            const SizedBox(width: Space.s2),
            CircleAction(
              icon: favorite ? Icons.favorite : Icons.favorite_border,
              tooltip: favorite ? 'Retirer des favoris' : 'Ajouter aux favoris',
              onPressed: () => _toggleFavorite(context, ref, favorite),
            ),
            SizedBox(width: context.gutter),
          ],
          flexibleSpace: FlexibleSpaceBar(
            stretchModes: const [StretchMode.zoomBackground],
            background: _Gallery(offer: offer, images: images),
          ),
        ),
        SliverToBoxAdapter(
          child: Readable(
            maxWidth: 760,
            child: Padding(
              padding: EdgeInsets.fromLTRB(context.gutter, Space.s4, context.gutter, 0),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(offer.name, style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: Space.s2),
                Wrap(spacing: Space.s4, runSpacing: Space.s1, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  if (offer.rating != null) RatingStars(value: offer.rating!, count: offer.reviewsCount, size: 13),
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    StatusDot(color: offer.isOutOfStock ? t.danger : (offer.isLowStock ? t.warning : t.success)),
                    const SizedBox(width: Space.s2),
                    Text(
                      offer.isOutOfStock ? 'Rupture de stock' : (offer.isLowStock ? 'Plus que ${offer.stock} en stock' : 'En stock'),
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: t.text),
                    ),
                  ]),
                ]),
                const SizedBox(height: Space.s4),
                PriceLine(offer: offer, large: true),
                if (offer.discountPercent != null) ...[
                  const SizedBox(height: Space.s1),
                  Wrap(spacing: Space.s2, runSpacing: Space.s1, crossAxisAlignment: WrapCrossAlignment.center, children: [
                    BtpBadge('${offer.isFlashSale ? '⚡ ' : ''}−${formatPercent(offer.discountPercent!)}', tone: BadgeTone.accent),
                    if (offer.saving > 0) Text('Vous économisez ${formatPrice(offer.saving)}', style: TextStyle(color: t.accent, fontWeight: FontWeight.w600, fontSize: 13)),
                  ]),
                ],
                _PromotionInfo(offer: offer),
                if (offer.usefulTiers.isNotEmpty) ...[
                  const SizedBox(height: Space.s4),
                  ListGroup(
                    title: 'Prix par quantité',
                    footer: 'Le prix baisse dès la quantité atteinte, dans le panier comme à la commande.',
                    children: [
                      ListRow(title: "À l'unité", value: formatPrice(offer.effectivePrice)),
                      for (final tier in offer.usefulTiers) ListRow(title: 'Dès ${tier.minQuantity} unités · −${formatPercent(tier.percent)}', value: '${formatPrice(tier.unitPrice)} / u.'),
                    ],
                  ),
                ],
                const SizedBox(height: Space.s5),
                if (offer.boutique != null)
                  AppCard(
                    onTap: () => context.openShop(offer.boutique!.id),
                    padding: const EdgeInsets.all(Space.s3),
                    child: Row(children: [
                      ShopAvatar(shop: offer.boutique!, size: 44),
                      const SizedBox(width: Space.s3),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('Vendu par', style: TextStyle(color: t.textMuted, fontSize: 12)),
                          Text(offer.shopName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                          if (offer.boutique!.district != null) Text(offer.boutique!.district!, style: TextStyle(color: t.textMuted, fontSize: 12)),
                        ]),
                      ),
                      Text('Boutique', style: TextStyle(color: t.text, fontWeight: FontWeight.w600, fontSize: 13)),
                      Icon(Icons.chevron_right, color: t.textMuted),
                    ]),
                  ),
                if (offer.description.isNotEmpty) ...[
                  const SizedBox(height: Space.s5),
                  Text('Description', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: Space.s2),
                  _ExpandableText(offer.description),
                ],
                const SizedBox(height: Space.s5),
                ListGroup(
                  title: 'Caractéristiques',
                  children: [for (final (k, v) in specs) ListRow(title: k, value: v)],
                ),
                if (offer.tags.isNotEmpty) ...[
                  const SizedBox(height: Space.s4),
                  Wrap(spacing: Space.s2, runSpacing: Space.s2, children: [for (final tag in offer.tags) BtpBadge(tag, tone: BadgeTone.muted)]),
                ],
                const SizedBox(height: Space.s3),
                // Annonce trompeuse, produit interdit, prix abusif : l'équipe examine.
                TextButton.icon(
                  style: TextButton.styleFrom(padding: EdgeInsets.zero, foregroundColor: t.textMuted),
                  onPressed: () {
                    if (!requireSession(context, ref)) return;
                    context.push('/compte/support/nouvelle?${Uri(queryParameters: {'type': 'listing_report', 'cible': offer.id, 'libelle': offer.name}).query}');
                  },
                  icon: const Icon(Icons.flag_outlined, size: 18),
                  label: const Text('Signaler cette annonce'),
                ),
              ]),
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: SponsoredRail(slot: SponsoredSlot('similar', offerId: offer.id), title: 'Sponsorisé, dans le même rayon'),
        ),
        SliverToBoxAdapter(child: ProductRail(title: 'Produits similaires', items: similar.value ?? const [], loading: similar.isLoading)),
        if (shopOffers != null)
          SliverToBoxAdapter(
            child: ProductRail(
              title: 'Chez ${offer.shopName}',
              items: (shopOffers.value ?? const []).where((o) => o.id != offer.id).toList(),
              loading: shopOffers.isLoading,
              onMore: () => context.openShop(offer.boutique!.id),
            ),
          ),
        if (userId.isNotEmpty)
          SliverToBoxAdapter(child: ProductRail(title: 'Récemment vus', items: (recent.value ?? const []).where((o) => o.id != offer.id).toList())),
        const SliverToBoxAdapter(child: SizedBox(height: Space.s5)),
      ]),
    );
  }
}

/// Galerie plein cadre : glisser pour changer de photo, compteur « 1/3 ».
class _Gallery extends StatefulWidget {
  const _Gallery({required this.offer, required this.images});

  final ProductBoutique offer;
  final List<String> images;

  @override
  State<_Gallery> createState() => _GalleryState();
}

class _GalleryState extends State<_Gallery> {
  int _page = 0;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final images = widget.images;
    final count = images.isEmpty ? 1 : images.length;
    return Stack(fit: StackFit.expand, children: [
      PageView.builder(
        itemCount: count,
        onPageChanged: (i) => setState(() => _page = i),
        itemBuilder: (_, i) => ProductThumbnail(url: images.isEmpty ? null : images[i], seed: widget.offer.id, borderRadius: BorderRadius.zero),
      ),
      if (count > 1)
        Positioned(
          right: Space.s4,
          bottom: Space.s4,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: Space.s2, vertical: 3),
            decoration: BoxDecoration(color: t.chrome.withValues(alpha: 0.8), borderRadius: BorderRadius.circular(999)),
            child: Text('${_page + 1}/$count', style: monoStyle(context, size: 12, color: t.onChrome, weight: FontWeight.w600)),
          ),
        ),
      if (widget.offer.isNew)
        const Positioned(left: Space.s4, bottom: Space.s4, child: BtpBadge('Nouveau', tone: BadgeTone.solid)),
    ]);
  }
}

/// Texte replié sur 4 lignes, « Lire la suite » pour le déplier.
class _ExpandableText extends StatefulWidget {
  const _ExpandableText(this.text);

  final String text;

  @override
  State<_ExpandableText> createState() => _ExpandableTextState();
}

class _ExpandableTextState extends State<_ExpandableText> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final style = TextStyle(color: t.text, height: 1.55, fontSize: 15);
    return LayoutBuilder(builder: (context, box) {
      final painter = TextPainter(
        text: TextSpan(text: widget.text, style: style),
        maxLines: 4,
        textDirection: TextDirection.ltr,
        textScaler: MediaQuery.textScalerOf(context),
      )..layout(maxWidth: box.maxWidth);
      final long = painter.didExceedMaxLines;
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        AnimatedSize(
          duration: const Duration(milliseconds: 200),
          alignment: Alignment.topCenter,
          child: Text(widget.text, style: style, maxLines: _open ? null : 4, overflow: _open ? TextOverflow.visible : TextOverflow.ellipsis),
        ),
        if (long)
          TextButton(
            style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(48, 40)),
            onPressed: () => setState(() => _open = !_open),
            child: Text(_open ? 'Réduire' : 'Lire la suite'),
          ),
      ]);
    });
  }
}

/// La promotion du prix : son nom, sa fin (compte à rebours pour une vente flash).
class _PromotionInfo extends StatelessWidget {
  const _PromotionInfo({required this.offer});

  final ProductBoutique offer;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final promo = offer.pricing?.promotion;
    final end = offer.promotionEnd;
    if (promo == null || offer.discountPercent == null) return const SizedBox.shrink();
    if (offer.isFlashSale && end != null) {
      return Padding(
        padding: const EdgeInsets.only(top: Space.s3),
        child: AppCard(
          color: t.chrome,
          outlined: false,
          padding: const EdgeInsets.all(Space.s3),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Icon(Icons.bolt, color: t.onChrome, size: 18),
              const SizedBox(width: Space.s1),
              Expanded(child: Text(promo.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.onChrome, fontWeight: FontWeight.w700))),
            ]),
            const SizedBox(height: Space.s2),
            Text('Se termine dans', style: TextStyle(color: t.onChromeMuted, fontSize: 12)),
            const SizedBox(height: Space.s1),
            Countdown(end: end, color: t.onChrome, boxColor: t.chromeRaised, compact: true),
          ]),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(top: Space.s2),
      child: Text(
        '${promo.label}${end != null ? " · jusqu'au ${formatDate(end)}" : ''}',
        style: TextStyle(color: t.textMuted, fontSize: 13),
      ),
    );
  }
}

/// Barre d'achat collée en bas : quantité bornée de 1 au stock, ajout.
class _BuyBar extends ConsumerStatefulWidget {
  const _BuyBar({required this.offer});

  final ProductBoutique offer;

  @override
  ConsumerState<_BuyBar> createState() => _BuyBarState();
}

class _BuyBarState extends ConsumerState<_BuyBar> {
  int _quantity = 1;
  bool _sending = false;

  Future<void> _add() async {
    if (!requireSession(context, ref)) return;
    setState(() => _sending = true);
    try {
      await ref.read(cartProvider.notifier).add(widget.offer.id, _quantity);
      HapticFeedback.mediumImpact();
      if (mounted) {
        showMessage(context, _quantity > 1 ? '$_quantity articles ajoutés au panier' : 'Ajouté au panier', actionLabel: 'Voir le panier', onAction: () => context.go('/panier'));
      }
    } catch (e) {
      if (mounted) showMessage(context, errorMessage(e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final o = widget.offer;
    final unit = o.unitPriceFor(_quantity);
    final next = o.usefulTiers.where((tier) => tier.minQuantity > _quantity).firstOrNull;
    // Prix par quantité : le palier atteint et le suivant.
    final hint = o.isOutOfStock || o.usefulTiers.isEmpty
        ? null
        : [
            if (unit < o.effectivePrice) '${formatPrice(unit)} l’unité à cette quantité',
            if (next != null) '${formatPrice(next.unitPrice)} dès ${next.minQuantity}',
          ].join(' · ');
    return BottomActionBar(
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (hint != null && hint.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: Space.s2),
            child: Text(hint, textAlign: TextAlign.center, style: TextStyle(color: t.textMuted, fontSize: 12.5)),
          ),
        Row(children: [
        QuantityStepper(value: _quantity, max: o.stock < 1 ? 1 : o.stock, onChanged: o.isOutOfStock ? null : (q) => setState(() => _quantity = q)),
        const SizedBox(width: Space.s3),
        Expanded(
          child: FilledButton(
            onPressed: (o.isOutOfStock || _sending) ? null : _add,
            child: _sending
                ? SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: t.primaryText))
                : FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(o.isOutOfStock ? 'Indisponible' : 'Ajouter · ${formatPrice(unit * _quantity)}', maxLines: 1),
                  ),
          ),
        ),
        ]),
      ]),
    );
  }
}
