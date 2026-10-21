import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/navigation.dart';
import '../../../app/theme/tokens.dart';
import '../../../entities/product.dart';
import '../../../shared/api/api_exception.dart';
import '../../../shared/ui/badge.dart';
import '../../../shared/ui/thumbnail.dart';
import '../../../shared/utils/format.dart';
import '../../cart/shared/cart_controller.dart';
import '../../wishlist/shared/wishlist_controller.dart';

/// Note compacte : ★ 4,6 (23).
class RatingStars extends StatelessWidget {
  const RatingStars({super.key, required this.value, this.count, this.size = 12});

  final double value;
  final int? count;
  final double size;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Semantics(
      label: 'Note ${value.toStringAsFixed(1)} sur 5${count != null ? ', $count avis' : ''}',
      excludeSemantics: true,
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.star_rounded, size: size + 3, color: t.text),
        const SizedBox(width: 2),
        Text(value.toStringAsFixed(1).replaceAll('.', ','), style: TextStyle(fontSize: size, fontWeight: FontWeight.w700, color: t.text)),
        if (count != null) Text(' ($count)', style: TextStyle(fontSize: size, color: t.textMuted)),
      ]),
    );
  }
}

/// Prix payé et prix barré.
class PriceLine extends StatelessWidget {
  const PriceLine({super.key, required this.offer, this.large = false});

  final ProductBoutique offer;
  final bool large;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.end,
      spacing: Space.s2,
      children: [
        Text(
          formatPrice(offer.effectivePrice),
          style: TextStyle(fontWeight: FontWeight.w800, fontSize: large ? 26 : 15, color: t.text, letterSpacing: large ? -0.5 : 0, fontFeatures: const [FontFeature.tabularFigures()]),
        ),
        if (offer.hasDiscount)
          Padding(
            padding: EdgeInsets.only(bottom: large ? 3 : 1),
            child: Text(formatPrice(offer.price), style: TextStyle(color: t.textMuted, fontSize: large ? 14 : 11.5, decoration: TextDecoration.lineThrough)),
          ),
      ],
    );
  }
}

/// Ajout au panier ou au favori depuis une carte, avec retour haptique et
/// message. Hors session, ouvre la connexion puis revient.
mixin OfferActions<W extends ConsumerStatefulWidget> on ConsumerState<W> {
  bool busy = false;

  Future<void> runOfferAction(Future<void> Function() action, String success, {bool toCart = false}) async {
    if (!requireSession(context, ref)) return;
    setState(() => busy = true);
    try {
      await action();
      HapticFeedback.lightImpact();
      if (mounted) {
        showMessage(context, success, actionLabel: toCart ? 'Voir le panier' : null, onAction: toCart ? () => context.go('/panier') : null);
      }
    } catch (e) {
      if (mounted) showMessage(context, errorMessage(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }
}

// ─────────────────────────────────────────────
//  Carte produit des grilles et carrousels : photo pleine largeur, remise
//  et cœur sur la photo, bouton « + » rond en bas de la photo, puis nom,
//  note, prix et boutique. Toute la carte ouvre la fiche.
// ─────────────────────────────────────────────
class ProductCard extends ConsumerStatefulWidget {
  const ProductCard({super.key, required this.offer, this.tag});

  final ProductBoutique offer;

  /// Étiquette posée sur la photo : rang, date d'arrivée…
  final String? tag;

  @override
  ConsumerState<ProductCard> createState() => _ProductCardState();
}

class _ProductCardState extends ConsumerState<ProductCard> with OfferActions<ProductCard> {
  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final offer = widget.offer;
    final favorite = ref.watch(wishlistProvider.select((w) => w.has(offer.id)));
    final percent = offer.discountPercent;
    const top = BorderRadius.vertical(top: Radius.circular(Radii.md));

    return Semantics(
      container: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(Radii.md),
          boxShadow: [BoxShadow(color: t.shadow, blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Material(
          color: t.surface,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Radii.md), side: BorderSide(color: t.border.withValues(alpha: 0.6))),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () => context.openOffer(offer.id),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Stack(children: [
                ProductThumbnail(url: offer.image, seed: offer.id, borderRadius: top),
                if (offer.isOutOfStock)
                  Positioned.fill(
                    child: ColoredBox(
                      color: t.surface.withValues(alpha: 0.55),
                      child: const Center(child: BtpBadge('Rupture', tone: BadgeTone.solid)),
                    ),
                  ),
                Positioned(
                  left: Space.s2,
                  top: Space.s2,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    if (percent != null) BtpBadge('−${formatPercent(percent)}', tone: BadgeTone.accent),
                    if (offer.isNew && widget.tag == null) ...[const SizedBox(height: Space.s1), const BtpBadge('Nouveau', tone: BadgeTone.neutral)],
                  ]),
                ),
                if (widget.tag != null) Positioned(left: Space.s2, bottom: Space.s2, child: BtpBadge(widget.tag!, tone: BadgeTone.solid)),
                Positioned(
                  right: Space.s1,
                  top: Space.s1,
                  child: _RoundIcon(
                    tooltip: favorite ? 'Retirer ${offer.name} des favoris' : 'Ajouter ${offer.name} aux favoris',
                    icon: favorite ? Icons.favorite : Icons.favorite_border,
                    onTap: busy
                        ? null
                        : () => runOfferAction(() => ref.read(wishlistProvider.notifier).toggle(offer.id), favorite ? 'Retiré des favoris' : 'Ajouté aux favoris'),
                  ),
                ),
                if (!offer.isOutOfStock)
                  Positioned(
                    right: Space.s2,
                    bottom: Space.s2,
                    child: _RoundIcon(
                      tooltip: 'Ajouter ${offer.name} au panier',
                      icon: Icons.add,
                      filled: true,
                      onTap: busy ? null : () => runOfferAction(() => ref.read(cartProvider.notifier).add(offer.id), 'Ajouté au panier', toCart: true),
                    ),
                  ),
              ]),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(Space.s3, Space.s2, Space.s3, Space.s3),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(offer.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w500, fontSize: 13.5, color: t.text, height: 1.3)),
                    if (offer.rating != null) ...[const SizedBox(height: 3), RatingStars(value: offer.rating!, count: offer.reviewsCount, size: 11.5)],
                    const Spacer(),
                    PriceLine(offer: offer),
                    const SizedBox(height: 2),
                    Text(
                      offer.isLowStock ? 'Plus que ${offer.stock} en stock' : offer.shopName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11.5, color: offer.isLowStock ? t.warning : t.textMuted, fontWeight: offer.isLowStock ? FontWeight.w600 : FontWeight.w400),
                    ),
                  ]),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Bouton rond de 36 dp sur la photo, zone tactile de 44 dp.
class _RoundIcon extends StatelessWidget {
  const _RoundIcon({required this.tooltip, required this.icon, required this.onTap, this.filled = false});

  final String tooltip;
  final IconData icon;
  final VoidCallback? onTap;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        label: tooltip,
        excludeSemantics: true,
        child: InkResponse(
          onTap: onTap,
          radius: 24,
          child: SizedBox(
            width: 44,
            height: 44,
            child: Center(
              child: Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: filled ? t.primary : t.surface.withValues(alpha: 0.94),
                  shape: BoxShape.circle,
                  boxShadow: [BoxShadow(color: t.shadow, blurRadius: 6, offset: const Offset(0, 2))],
                ),
                child: Icon(icon, size: 19, color: filled ? t.primaryText : t.text),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Ligne produit horizontale : suggestions, classements, listes courtes.
class ProductRow extends StatelessWidget {
  const ProductRow({super.key, required this.offer, this.leading, this.onTap});

  final ProductBoutique offer;
  final Widget? leading;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return InkWell(
      onTap: onTap ?? () => context.openOffer(offer.id),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Space.s4, vertical: Space.s3),
        child: Row(children: [
          if (leading != null) ...[leading!, const SizedBox(width: Space.s3)],
          SizedBox(width: 64, child: ProductThumbnail(url: offer.image, seed: offer.id)),
          const SizedBox(width: Space.s3),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(offer.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14, height: 1.3)),
              const SizedBox(height: 2),
              Text(offer.shopName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.textMuted, fontSize: 12)),
              const SizedBox(height: Space.s1),
              PriceLine(offer: offer),
            ]),
          ),
          if (offer.rating != null) ...[const SizedBox(width: Space.s2), RatingStars(value: offer.rating!)],
        ]),
      ),
    );
  }
}
