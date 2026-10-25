import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/navigation.dart';
import '../../app/theme/tokens.dart';
import '../../entities/cart.dart';
import '../../entities/delivery.dart';
import '../../shared/api/api_exception.dart';
import '../../shared/ui/alert_banner.dart';
import '../../shared/ui/kit.dart';
import '../../shared/ui/responsive.dart';
import '../../shared/ui/states.dart';
import '../../shared/ui/thumbnail.dart';
import '../../shared/utils/format.dart';
import 'shared/cart_controller.dart';
import 'shared/delivery_controller.dart';

// ─────────────────────────────────────────────
//  Panier — balayer une ligne vers la gauche la retire, avec « Annuler ».
//  Chaque ligne choisit sa livraison à côté de la quantité ; le mode est
//  celui de la boutique, partagé par toutes ses lignes.
//  « Passer commande » reste désactivé, comme sur le web : le tunnel de
//  commande n'existe pas encore côté front (point ouvert du cahier).
// ─────────────────────────────────────────────
class CartPage extends ConsumerStatefulWidget {
  const CartPage({super.key});

  @override
  ConsumerState<CartPage> createState() => _CartPageState();
}

class _CartPageState extends ConsumerState<CartPage> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) showMessage(context, errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove(CartItem item) async {
    HapticFeedback.mediumImpact();
    await _run(() => ref.read(cartProvider.notifier).remove(item.productBoutiqueId));
    if (!mounted) return;
    showMessage(context, 'Article retiré', actionLabel: 'Annuler', onAction: () {
      ref.read(cartProvider.notifier).add(item.productBoutiqueId, item.quantity).catchError((Object e) {
        if (mounted) showMessage(context, errorMessage(e));
      });
    });
  }

  Future<void> _confirmClear() async {
    final ok = await confirmAction(context, title: 'Vider le panier ?', message: 'Tous les articles seront retirés.', confirmLabel: 'Vider', destructive: true);
    if (ok) await _run(ref.read(cartProvider.notifier).clear);
  }

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(cartProvider);
    final quoteAsync = ref.watch(deliveryQuoteProvider);
    // Pendant un recalcul, le devis précédent reste affiché.
    final quote = quoteAsync.value;
    final quoting = quoteAsync.isLoading;
    final t = context.tokens;

    // Par défaut, chaque boutique prend le premier mode que ses produits
    // proposent (celui du produit quand il n'en a qu'un).
    ref.listen(deliveryQuoteProvider, (_, next) {
      final q = next.value;
      if (q == null) return;
      final selection = ref.read(deliverySelectionProvider.notifier);
      selection.keepOnly(q.groups.map((g) => g.boutiqueId).toSet());
      final chosen = ref.read(deliverySelectionProvider);
      for (final g in q.groups) {
        if (g.selectedMethod == null && chosen[g.boutiqueId] == null && g.options.isNotEmpty) {
          selection.choose(g.boutiqueId, g.options.first.method);
        }
      }
    });

    return Scaffold(
      bottomNavigationBar: cart.items.isEmpty ? null : _Summary(cart: cart, quote: quote, quoting: quoting),
      body: RefreshIndicator(
        onRefresh: ref.read(cartProvider.notifier).refresh,
        child: CustomScrollView(slivers: [
          chromeSliverAppBar(
            context,
            title: 'Panier',
            actions: [
              if (cart.items.isNotEmpty) IconButton(tooltip: 'Vider le panier', icon: const Icon(Icons.delete_sweep_outlined), onPressed: _busy ? null : _confirmClear),
              const SizedBox(width: Space.s1),
            ],
          ),
          if (cart.items.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: EmptyState(
                  icon: Icons.shopping_bag_outlined,
                  title: 'Votre panier est vide',
                  text: 'Ajoutez des articles depuis le catalogue pour préparer votre commande.',
                  actionLabel: 'Parcourir le catalogue',
                  onAction: () => context.go('/catalogue'),
                ),
              ),
            )
          else ...[
            SliverPadding(
              padding: EdgeInsets.fromLTRB(context.gutter, Space.s4, context.gutter, Space.s2),
              sliver: SliverToBoxAdapter(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text('${plural(cart.totalItems, 'article')} · ${plural(cart.items.length, 'référence')}', style: TextStyle(color: t.textMuted, fontSize: 13, fontWeight: FontWeight.w500)),
                  if (cart.hasBlockingIssue) ...[
                    const SizedBox(height: Space.s3),
                    const AlertBanner(tone: AlertTone.warning, message: 'Certains articles dépassent le stock disponible. Ajustez les quantités avant de commander.'),
                  ],
                ]),
              ),
            ),
            SliverPadding(
              padding: EdgeInsets.symmetric(horizontal: context.gutter),
              sliver: SliverList.separated(
                itemCount: cart.items.length,
                separatorBuilder: (_, _) => const SizedBox(height: Space.s3),
                itemBuilder: (context, i) {
                  final item = cart.items[i];
                  return Dismissible(
                    key: ValueKey(item.productBoutiqueId),
                    direction: DismissDirection.endToStart,
                    background: Container(
                      alignment: Alignment.centerRight,
                      padding: const EdgeInsets.only(right: Space.s5),
                      decoration: BoxDecoration(color: t.danger, borderRadius: BorderRadius.circular(Radii.md)),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.delete_outline, color: t.surface),
                        const SizedBox(width: Space.s1),
                        Text('Retirer', style: TextStyle(color: t.surface, fontWeight: FontWeight.w600)),
                      ]),
                    ),
                    onDismissed: (_) => _remove(item),
                    child: _Line(
                      item: item,
                      busy: _busy,
                      delivery: quote?.groupOf(item.productBoutiqueId),
                      deliveryBusy: quoting,
                      onDelivery: (group, mode) => ref.read(deliverySelectionProvider.notifier).choose(group.boutiqueId, mode),
                      onQuantity: (q) => _run(() => ref.read(cartProvider.notifier).setQuantity(item.productBoutiqueId, q)),
                      onRemove: () => _remove(item),
                    ),
                  );
                },
              ),
            ),
            SliverPadding(
              padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, Space.s6),
              sliver: SliverToBoxAdapter(
                child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(Icons.swipe_left_outlined, size: 16, color: t.textMuted),
                  const SizedBox(width: Space.s1),
                  Text('Balayez un article vers la gauche pour le retirer', style: TextStyle(color: t.textMuted, fontSize: 12)),
                ]),
              ),
            ),
          ],
        ]),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({
    required this.item,
    required this.busy,
    required this.delivery,
    required this.deliveryBusy,
    required this.onDelivery,
    required this.onQuantity,
    required this.onRemove,
  });

  final CartItem item;
  final bool busy;

  /// Livraison de la boutique de l'article ; null avant le premier devis.
  final DeliveryGroupQuote? delivery;
  final bool deliveryBusy;
  final void Function(DeliveryGroupQuote group, DeliveryMode mode) onDelivery;
  final ValueChanged<int> onQuantity;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final name = item.productName ?? "L'article";
    return AppCard(
      padding: const EdgeInsets.all(Space.s3),
      onTap: () => context.openOffer(item.productBoutiqueId),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 84, child: ProductThumbnail(url: item.urlImages.firstOrNull, seed: item.productBoutiqueId)),
        const SizedBox(width: Space.s3),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: Text(name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, height: 1.3))),
              SizedBox(
                width: 36,
                height: 36,
                child: IconButton(
                  tooltip: 'Retirer $name',
                  padding: EdgeInsets.zero,
                  style: IconButton.styleFrom(minimumSize: const Size(36, 36)),
                  onPressed: busy ? null : onRemove,
                  icon: Icon(Icons.close, size: 20, color: t.textMuted),
                ),
              ),
            ]),
            Row(children: [
              Expanded(child: Text('${formatPrice(item.unitPrice)} l’unité', style: TextStyle(color: t.textMuted, fontSize: 12))),
              Text(formatPrice(item.lineTotal), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            ]),
            if (item.isOutOfStock)
              Text('Rupture de stock', style: TextStyle(fontSize: 12, color: t.danger, fontWeight: FontWeight.w600))
            else if (item.exceedsStock)
              Text('Plus que ${item.stock} en stock', style: TextStyle(fontSize: 12, color: t.warning, fontWeight: FontWeight.w600)),
            const SizedBox(height: Space.s2),
            Row(children: [
              QuantityStepper(
                compact: true,
                value: item.quantity,
                // Descendre sous 1 retire la ligne : on passe par la croix.
                min: 1,
                max: item.stock < item.quantity ? item.quantity : item.stock,
                itemName: name,
                onChanged: busy ? null : onQuantity,
              ),
              if (delivery case final group? when group.options.isNotEmpty) ...[
                const SizedBox(width: Space.s2),
                Expanded(
                  child: _DeliveryPicker(
                    group: group,
                    itemName: name,
                    onChanged: busy || deliveryBusy ? null : (mode) => onDelivery(group, mode),
                  ),
                ),
              ],
            ]),
            if (delivery case final group?)
              if (group.options.isEmpty && group.error != null)
                Padding(
                  padding: const EdgeInsets.only(top: Space.s1),
                  child: Text(group.error!, style: TextStyle(fontSize: 11.5, color: t.danger, height: 1.3)),
                )
              else if (group.productBoutiqueIds.length > 1)
                Padding(
                  padding: const EdgeInsets.only(top: Space.s1),
                  child: Text(
                    'Même livraison pour les ${group.productBoutiqueIds.length} articles de ${group.boutiqueNom ?? 'cette boutique'}',
                    style: TextStyle(fontSize: 11.5, color: t.textMuted, height: 1.3),
                  ),
                ),
          ]),
        ),
      ]),
    );
  }
}

/// Mode de livraison d'une ligne, à côté de la quantité : libellé court dans
/// le bouton (la place manque sur téléphone), libellé complet et frais dans
/// le menu.
class _DeliveryPicker extends StatelessWidget {
  const _DeliveryPicker({required this.group, required this.itemName, required this.onChanged});

  final DeliveryGroupQuote group;
  final String itemName;
  final ValueChanged<DeliveryMode>? onChanged;

  String _short(DeliveryOption o) => switch (o.method) {
        DeliveryMode.pickup => 'Retrait',
        DeliveryMode.free => 'Gratuite',
        DeliveryMode.flatRate => formatPrice(o.fee),
      };

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final changed = onChanged;
    return Semantics(
      label: 'Livraison de $itemName',
      child: Container(
        height: 36,
        padding: const EdgeInsets.only(left: Space.s2, right: Space.s1),
        decoration: BoxDecoration(color: t.surfaceAlt, borderRadius: BorderRadius.circular(Radii.sm)),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<DeliveryMode>(
            value: group.selectedMethod,
            isExpanded: true,
            isDense: true,
            iconSize: 20,
            borderRadius: BorderRadius.circular(Radii.sm),
            hint: Text('Livraison', style: TextStyle(fontSize: 12.5, color: t.textMuted)),
            onChanged: changed == null
                ? null
                : (mode) {
                    if (mode != null) changed(mode);
                  },
            selectedItemBuilder: (_) => [
              for (final o in group.options)
                Row(children: [
                  Icon(o.method == DeliveryMode.pickup ? Icons.storefront_outlined : Icons.local_shipping_outlined, size: 16, color: t.textMuted),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(_short(o), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: t.text)),
                  ),
                ]),
            ],
            items: [
              for (final o in group.options)
                DropdownMenuItem(
                  value: o.method,
                  child: Row(children: [
                    Expanded(child: Text(o.method.label, style: const TextStyle(fontSize: 14))),
                    const SizedBox(width: Space.s3),
                    Text(formatFee(o.fee), style: TextStyle(fontSize: 13, color: t.textMuted, fontWeight: FontWeight.w600)),
                  ]),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Récapitulatif collé en bas d'écran.
class _Summary extends StatelessWidget {
  const _Summary({required this.cart, required this.quote, required this.quoting});

  final Cart cart;
  final DeliveryQuote? quote;
  final bool quoting;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    // Frais et total tels que le serveur les a calculés pour ce panier-ci.
    final q = quote;
    final current = q != null && !quoting && q.subtotal == cart.totalAmount;
    final ready = current && q.ready;
    final livraison = ready ? formatFee(q.shippingFee) : (current ? 'à choisir' : '…');
    return BottomActionBar(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Total', style: TextStyle(color: t.textMuted, fontSize: 13)),
              Text(formatPrice(ready ? q.total : cart.totalAmount), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 22, letterSpacing: -0.4)),
            ]),
          ),
          Text('Livraison\n$livraison', textAlign: TextAlign.right, style: TextStyle(color: t.textMuted, fontSize: 11.5, height: 1.3)),
        ]),
        const SizedBox(height: Space.s3),
        // La commande n'existe pas encore côté front : plutôt qu'un bouton
        // qui ne ferait rien, on l'annonce.
        const SizedBox(width: double.infinity, child: FilledButton(onPressed: null, child: Text('Passer commande · bientôt'))),
      ]),
    );
  }
}
