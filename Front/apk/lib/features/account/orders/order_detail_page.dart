import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/navigation.dart';
import '../../../app/theme/theme.dart';
import '../../../app/theme/tokens.dart';
import '../../../entities/order.dart';
import '../../../shared/api/api_exception.dart';
import '../../../shared/ui/kit.dart';
import '../../../shared/ui/responsive.dart';
import '../../../shared/ui/states.dart';
import '../../../shared/ui/thumbnail.dart';
import '../../../shared/utils/format.dart';
import '../../cart/shared/cart_controller.dart';
import '../shared/account_api.dart';
import '../shared/order_widgets.dart';

// ─────────────────────────────────────────────
//  Détail d'une commande. Pas d'annulation par le client : le back réserve
//  le changement de statut au dépôt et à l'administrateur.
// ─────────────────────────────────────────────
class OrderDetailPage extends ConsumerWidget {
  const OrderDetailPage({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final order = ref.watch(orderProvider(id));
    return order.when(
      loading: () => Scaffold(appBar: AppBar(title: const Text('Commande')), body: Padding(padding: EdgeInsets.all(context.gutter), child: const Skeleton(height: 420))),
      error: (e, _) => Scaffold(
        appBar: AppBar(),
        body: Center(
          child: EmptyState(icon: Icons.receipt_long_outlined, title: 'Commande introuvable', text: errorMessage(e), actionLabel: 'Réessayer', onAction: () => ref.invalidate(orderProvider(id))),
        ),
      ),
      data: (o) => _OrderView(order: o),
    );
  }
}

class _OrderView extends ConsumerStatefulWidget {
  const _OrderView({required this.order});

  final Order order;

  @override
  ConsumerState<_OrderView> createState() => _OrderViewState();
}

class _OrderViewState extends ConsumerState<_OrderView> {
  bool _reordering = false;

  /// Remet au panier ce qui est encore disponible, dans la limite du stock,
  /// puis ouvre le panier pour vérifier.
  Future<void> _reorder(List<OrderItem> available) async {
    setState(() => _reordering = true);
    try {
      for (final item in available) {
        final offer = item.productBoutique!;
        await ref.read(cartProvider.notifier).add(offer.id, item.quantity < offer.stock ? item.quantity : offer.stock);
      }
      HapticFeedback.mediumImpact();
      if (mounted) context.go('/panier');
    } catch (e) {
      if (mounted) showMessage(context, errorMessage(e));
    } finally {
      if (mounted) setState(() => _reordering = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final o = widget.order;
    final available = o.items.where((i) => i.productBoutique != null && i.productBoutique!.stock > 0).toList();
    final shops = {for (final i in o.items) if (i.boutique != null) i.boutique!.id: i.boutique!}.values.toList();
    final address = o.shippingAddress;

    Widget money(String label, String value, {Color? color, bool strong = false}) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: Space.s4, vertical: Space.s2),
          child: Row(children: [
            Expanded(child: Text(label, style: TextStyle(color: strong ? t.text : t.textMuted, fontWeight: strong ? FontWeight.w700 : FontWeight.w400, fontSize: strong ? 16 : 14))),
            Text(value, style: TextStyle(color: color ?? t.text, fontWeight: strong ? FontWeight.w800 : FontWeight.w600, fontSize: strong ? 18 : 14)),
          ]),
        );

    return Scaffold(
      appBar: AppBar(title: Text('Commande ${o.shortReference}')),
      bottomNavigationBar: available.isEmpty
          ? null
          : BottomActionBar(
              child: FilledButton.icon(
                onPressed: _reordering ? null : () => _reorder(available),
                icon: _reordering ? SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: t.textMuted)) : const Icon(Icons.replay),
                label: Text(_reordering ? 'Ajout au panier…' : 'Commander à nouveau'),
              ),
            ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, Space.s6),
        children: [
          Readable(
            maxWidth: 760,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              // État de la commande en un coup d'œil.
              AppCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text('Passée le ${formatDate(o.createdAt)}', style: TextStyle(color: t.textMuted, fontSize: 13))),
                    OrderStatusBadge(status: o.status),
                  ]),
                  const SizedBox(height: Space.s3),
                  Text(formatPrice(o.amount), style: Theme.of(context).textTheme.headlineSmall),
                  Text('${plural(o.totalItems, 'article')} · ${o.deliveryMethod.label}', style: TextStyle(color: t.textMuted, fontSize: 13)),
                  const SizedBox(height: Space.s4),
                  _Progress(order: o),
                ]),
              ),
              const SizedBox(height: Space.s5),
              ListGroup(title: 'Suivi', children: [Padding(padding: const EdgeInsets.fromLTRB(Space.s4, Space.s4, Space.s4, 0), child: _Timeline(order: o))]),
              const SizedBox(height: Space.s5),
              ListGroup(title: 'Articles', children: [
                for (final item in o.items)
                  InkWell(
                    onTap: item.productBoutique == null ? null : () => context.openOffer(item.productBoutique!.id),
                    child: Padding(
                      padding: const EdgeInsets.all(Space.s3),
                      child: Row(children: [
                        SizedBox(width: 56, child: ProductThumbnail(url: item.productBoutique?.image, seed: item.productBoutique?.id ?? item.name)),
                        const SizedBox(width: Space.s3),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(item.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w500, height: 1.3)),
                            if (item.boutique != null) Text(item.boutique!.nom, style: TextStyle(color: t.textMuted, fontSize: 12)),
                            Text('${item.quantity} × ${formatPrice(item.price)}', style: TextStyle(color: t.textMuted, fontSize: 12)),
                          ]),
                        ),
                        Text(formatPrice(item.lineTotal), style: const TextStyle(fontWeight: FontWeight.w700)),
                      ]),
                    ),
                  ),
              ]),
              const SizedBox(height: Space.s5),
              ListGroup(title: 'Récapitulatif', children: [
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: Space.s2),
                  child: Column(children: [
                    money('Sous-total', formatPrice(o.subtotal)),
                    if (o.discountAmount > 0) money('Remise${o.promotionCode != null ? ' (${o.promotionCode})' : ''}', '−${formatPrice(o.discountAmount)}', color: t.accent),
                    money(o.deliveryMethod.label, o.shippingFee > 0 ? formatPrice(o.shippingFee) : 'Offerte'),
                    const Divider(indent: Space.s4, endIndent: Space.s4),
                    // « Total » et non « payé » : le back ne connaît pas l'état du paiement.
                    money('Total', formatPrice(o.amount), strong: true),
                  ]),
                ),
              ]),
              const SizedBox(height: Space.s5),
              ListGroup(
                title: 'Livraison',
                footer: o.status == OrderStatus.cancelled ? 'Cette commande a été annulée : rien ne sera livré.' : null,
                children: [
                  if (o.deliveryMethod == DeliveryMethod.pickup)
                    // Adresse du dépôt, jamais son téléphone.
                    for (final s in shops) ListRow(icon: Icons.storefront_outlined, title: 'À retirer chez ${s.nom}', subtitle: s.adresse, onTap: () => context.openShop(s.id))
                  else if (address != null)
                    ListRow(
                      icon: Icons.place_outlined,
                      title: address.destinataire ?? 'Adresse de livraison',
                      subtitle: '${address.adresse}\n${[address.commune, address.ville].whereType<String>().join(', ')}\nJoignable au ${address.telephone}',
                    )
                  else
                    const ListRow(icon: Icons.help_outline, title: 'Adresse non renseignée'),
                ],
              ),
              const SizedBox(height: Space.s5),
              ListGroup(
                title: 'Référence',
                footer: 'À communiquer au dépôt pour toute question.',
                children: [
                  ListRow(
                    title: o.reference,
                    trailing: Icon(Icons.copy_rounded, size: 20, color: t.text),
                    onTap: () {
                      Clipboard.setData(ClipboardData(text: o.reference));
                      HapticFeedback.selectionClick();
                      showMessage(context, 'Référence copiée');
                    },
                  ),
                ],
              ),
            ]),
          ),
        ],
      ),
    );
  }
}

/// Barre de progression en 4 étapes ; rouge et barrée si annulée.
class _Progress extends StatelessWidget {
  const _Progress({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    if (order.status == OrderStatus.cancelled) {
      return Row(children: [
        Icon(Icons.cancel_outlined, color: t.danger, size: 18),
        const SizedBox(width: Space.s2),
        Text('Commande annulée', style: TextStyle(color: t.danger, fontWeight: FontWeight.w600)),
      ]);
    }
    final current = OrderStatus.flow.indexOf(order.status);
    return Semantics(
      label: 'Étape ${current + 1} sur ${OrderStatus.flow.length} : ${order.status.label}',
      excludeSemantics: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          for (var i = 0; i < OrderStatus.flow.length; i++) ...[
            Expanded(
              child: Container(height: 6, decoration: BoxDecoration(color: i <= current ? t.primary : t.surfaceAlt, borderRadius: BorderRadius.circular(3))),
            ),
            if (i < OrderStatus.flow.length - 1) const SizedBox(width: Space.s1),
          ],
        ]),
        const SizedBox(height: Space.s2),
        Row(children: [
          for (var i = 0; i < OrderStatus.flow.length; i++)
            Expanded(
              child: Text(
                OrderStatus.flow[i].label,
                textAlign: i == 0 ? TextAlign.left : (i == OrderStatus.flow.length - 1 ? TextAlign.right : TextAlign.center),
                style: TextStyle(fontSize: 11, color: i <= current ? t.text : t.textMuted, fontWeight: i == current ? FontWeight.w700 : FontWeight.w500),
              ),
            ),
        ]),
      ]),
    );
  }
}

/// Étapes datées. Annulée : seulement les étapes réellement franchies, puis
/// l'annulation et son motif — montrer « Livrée » à venir serait mentir.
class _Timeline extends StatelessWidget {
  const _Timeline({required this.order});

  final Order order;

  static const _hints = {
    OrderStatus.pending: 'Le dépôt doit confirmer la disponibilité des articles.',
    OrderStatus.confirmed: 'Le dépôt prépare votre commande.',
    OrderStatus.shipped: 'Votre commande est en route.',
    OrderStatus.delivered: 'Commande remise.',
  };

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final reached = {for (final s in order.statusHistory) s.status: s};
    final steps = <(OrderStatus, String, OrderStep?)>[]; // statut, état, étape
    if (order.status == OrderStatus.cancelled) {
      for (final s in OrderStatus.flow.where(reached.containsKey)) {
        steps.add((s, 'done', reached[s]));
      }
      steps.add((OrderStatus.cancelled, 'cancelled', reached[OrderStatus.cancelled]));
    } else {
      final current = OrderStatus.flow.indexOf(order.status);
      for (var i = 0; i < OrderStatus.flow.length; i++) {
        final s = OrderStatus.flow[i];
        steps.add((s, i < current ? 'done' : (i == current ? 'current' : 'upcoming'), reached[s]));
      }
    }

    return Column(children: [
      for (var i = 0; i < steps.length; i++)
        IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Column(children: [
              _marker(context, steps[i].$2),
              if (i < steps.length - 1) Expanded(child: Container(width: 2, color: steps[i].$2 == 'done' ? t.primary : t.border)),
            ]),
            const SizedBox(width: Space.s3),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(bottom: Space.s4),
                child: Semantics(
                  label: steps[i].$2 == 'current' ? 'Étape en cours' : null,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(steps[i].$1.label,
                        style: TextStyle(
                          fontWeight: steps[i].$2 == 'current' ? FontWeight.w700 : FontWeight.w500,
                          color: steps[i].$2 == 'cancelled' ? t.danger : (steps[i].$2 == 'upcoming' ? t.textMuted : t.text),
                        )),
                    Text(steps[i].$3 != null ? formatDateTime(steps[i].$3!.changedAt) : 'À venir', style: monoStyle(context, size: 11)),
                    if (steps[i].$3?.note != null)
                      Text(steps[i].$3!.note!, style: TextStyle(color: t.textMuted, fontSize: 13))
                    else if (steps[i].$2 == 'current' && _hints[steps[i].$1] != null)
                      Text(_hints[steps[i].$1]!, style: TextStyle(color: t.textMuted, fontSize: 13)),
                  ]),
                ),
              ),
            ),
          ]),
        ),
    ]);
  }

  Widget _marker(BuildContext context, String state) {
    final t = context.tokens;
    return switch (state) {
      'done' => CircleAvatar(radius: 11, backgroundColor: t.primary, child: Icon(Icons.check, size: 14, color: t.primaryText)),
      'cancelled' => CircleAvatar(radius: 11, backgroundColor: t.danger, child: Icon(Icons.close, size: 14, color: t.dangerSurface)),
      // Étape en cours : pastille creuse et épaisse, sans couleur de plus.
      'current' => Container(width: 22, height: 22, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: t.primary, width: 6))),
      _ => Container(width: 22, height: 22, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: t.border, width: 2))),
    };
  }
}
