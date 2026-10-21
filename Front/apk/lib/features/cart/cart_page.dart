import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/navigation.dart';
import '../../app/theme/tokens.dart';
import '../../entities/cart.dart';
import '../../shared/api/api_exception.dart';
import '../../shared/ui/alert_banner.dart';
import '../../shared/ui/kit.dart';
import '../../shared/ui/responsive.dart';
import '../../shared/ui/states.dart';
import '../../shared/ui/thumbnail.dart';
import '../../shared/utils/format.dart';
import 'shared/cart_controller.dart';

// ─────────────────────────────────────────────
//  Panier — balayer une ligne vers la gauche la retire, avec « Annuler ».
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
    final t = context.tokens;

    return Scaffold(
      bottomNavigationBar: cart.items.isEmpty ? null : _Summary(cart: cart),
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
  const _Line({required this.item, required this.busy, required this.onQuantity, required this.onRemove});

  final CartItem item;
  final bool busy;
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
            Text('${formatPrice(item.unitPrice)} l’unité', style: TextStyle(color: t.textMuted, fontSize: 12)),
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
              const Spacer(),
              Text(formatPrice(item.lineTotal), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            ]),
          ]),
        ),
      ]),
    );
  }
}

/// Récapitulatif collé en bas d'écran.
class _Summary extends StatelessWidget {
  const _Summary({required this.cart});

  final Cart cart;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return BottomActionBar(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Total', style: TextStyle(color: t.textMuted, fontSize: 13)),
              Text(formatPrice(cart.totalAmount), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 22, letterSpacing: -0.4)),
            ]),
          ),
          Text('Livraison calculée\nà l’étape suivante', textAlign: TextAlign.right, style: TextStyle(color: t.textMuted, fontSize: 11.5, height: 1.3)),
        ]),
        const SizedBox(height: Space.s3),
        // La commande n'existe pas encore côté front : plutôt qu'un bouton
        // qui ne ferait rien, on l'annonce.
        const SizedBox(width: double.infinity, child: FilledButton(onPressed: null, child: Text('Passer commande · bientôt'))),
      ]),
    );
  }
}
