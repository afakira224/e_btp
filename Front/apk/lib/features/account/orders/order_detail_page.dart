import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/navigation.dart';
import '../../../app/theme/theme.dart';
import '../../../app/theme/tokens.dart';
import '../../../entities/order.dart';
import '../../../shared/api/api_exception.dart';
import '../../../shared/ui/alert_banner.dart';
import '../../../shared/ui/kit.dart';
import '../../../shared/ui/responsive.dart';
import '../../../shared/ui/states.dart';
import '../../../shared/ui/thumbnail.dart';
import '../../../shared/utils/format.dart';
import '../../cart/shared/cart_controller.dart';
import '../shared/account_api.dart';
import '../shared/order_widgets.dart';

// ─────────────────────────────────────────────
//  Détail d'une commande — /compte/commandes/:orderId
//
//  Une carte par boutique : sa sous-commande avance à son rythme, avec son
//  statut, son code de remise, ses échéances et les actions que le serveur
//  permet au client (annuler, demander un retour). « Signaler un problème »
//  ouvre une demande au support sur cette boutique.
// ─────────────────────────────────────────────
class OrderDetailPage extends ConsumerWidget {
  const OrderDetailPage({super.key, required this.id, this.feedback});

  final String id;

  /// Message à afficher à l'arrivée (commande passée, paiement confirmé).
  final String? feedback;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final order = ref.watch(orderProvider(id));
    return order.when(
      skipLoadingOnRefresh: true,
      loading: () => Scaffold(
        appBar: AppBar(title: const Text('Commande')),
        body: Padding(padding: EdgeInsets.all(context.gutter), child: const Skeleton(height: 420)),
      ),
      error: (e, _) => Scaffold(
        appBar: AppBar(),
        body: Center(
          child: EmptyState(icon: Icons.receipt_long_outlined, title: 'Commande introuvable', text: errorMessage(e), actionLabel: 'Réessayer', onAction: () => ref.invalidate(orderProvider(id))),
        ),
      ),
      data: (o) => _OrderView(order: o, feedback: feedback),
    );
  }
}

class _OrderView extends ConsumerStatefulWidget {
  const _OrderView({required this.order, this.feedback});

  final Order order;
  final String? feedback;

  @override
  ConsumerState<_OrderView> createState() => _OrderViewState();
}

class _OrderViewState extends ConsumerState<_OrderView> {
  bool _reordering = false;
  bool _paying = false;

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

  /// Paiement en ligne en attente : relancé, puis la page du prestataire.
  Future<void> _pay() async {
    setState(() => _paying = true);
    try {
      await ref.read(accountApiProvider).restartPayment(widget.order.id);
      if (mounted) context.push('/compte/commandes/${widget.order.id}/paiement');
    } catch (e) {
      if (mounted) showMessage(context, errorMessage(e));
      ref.invalidate(orderProvider(widget.order.id));
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final o = widget.order;
    final available = o.items.where((i) => i.productBoutique != null && i.productBoutique!.stock > 0).toList();
    final address = o.shippingAddress;
    final homeDelivery = o.parts.any((p) => !p.delivery.isPickup);

    Widget money(String label, String value, {Color? color, bool strong = false}) => Padding(
      padding: const EdgeInsets.symmetric(horizontal: Space.s4, vertical: Space.s2),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(color: strong ? t.text : t.textMuted, fontWeight: strong ? FontWeight.w700 : FontWeight.w400, fontSize: strong ? 16 : 14),
            ),
          ),
          Text(
            value,
            style: TextStyle(color: color ?? t.text, fontWeight: strong ? FontWeight.w800 : FontWeight.w600, fontSize: strong ? 18 : 14),
          ),
        ],
      ),
    );

    return Scaffold(
      appBar: AppBar(title: Text('Commande ${o.shortReference}')),
      bottomNavigationBar: available.isEmpty || o.awaitsPayment
          ? null
          : BottomActionBar(
              child: OutlinedButton.icon(
                onPressed: _reordering ? null : () => _reorder(available),
                icon: _reordering ? SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: t.textMuted)) : const Icon(Icons.replay),
                label: Text(_reordering ? 'Ajout au panier…' : 'Commander à nouveau'),
              ),
            ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(orderProvider(o.id).future),
        child: ListView(
          padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, Space.s6),
          children: [
            Readable(
              maxWidth: 760,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (widget.feedback != null) ...[AlertBanner(tone: AlertTone.success, message: widget.feedback!), const SizedBox(height: Space.s4)],
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text('Passée le ${formatDate(o.createdAt)}', style: TextStyle(color: t.textMuted, fontSize: 13)),
                            ),
                            OrderStatusBadge(status: o.status),
                          ],
                        ),
                        const SizedBox(height: Space.s3),
                        Text(formatPrice(o.amount), style: Theme.of(context).textTheme.headlineSmall),
                        Text('${plural(o.totalItems, 'article')} · ${o.parts.length > 1 ? '${o.parts.length} boutiques' : o.deliveryMethod.label}', style: TextStyle(color: t.textMuted, fontSize: 13)),
                        const SizedBox(height: Space.s2),
                        Text('Paiement : ${o.paymentMethod.label.toLowerCase()} · ${o.paymentStatus.label.toLowerCase()}', style: TextStyle(color: t.textMuted, fontSize: 13)),
                        if (o.awaitsPayment) ...[
                          const SizedBox(height: Space.s3),
                          AlertBanner(
                            tone: AlertTone.warning,
                            message: o.paymentExpiresAt != null
                                ? 'À payer avant ${formatDateTime(o.paymentExpiresAt!)} : sans paiement, la commande est annulée et votre panier restauré.'
                                : 'Le paiement en ligne de cette commande est en attente.',
                          ),
                          const SizedBox(height: Space.s3),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton(onPressed: _paying ? null : _pay, child: Text(_paying ? 'Ouverture…' : 'Payer ${formatPrice(o.amount)}')),
                          ),
                        ] else if (o.status == OrderStatus.paymentFailed) ...[
                          const SizedBox(height: Space.s3),
                          const AlertBanner(tone: AlertTone.danger, message: 'Le paiement a échoué : rien ne sera livré, et vos articles sont revenus dans votre panier.'),
                        ],
                      ],
                    ),
                  ),
                  for (final part in o.parts) ...[const SizedBox(height: Space.s4), _PartCard(order: o, part: part)],
                  if (o.parts.isEmpty) ...[
                    const SizedBox(height: Space.s5),
                    ListGroup(
                      title: 'Articles',
                      children: [
                        for (final item in o.items)
                          _ItemRow(
                            name: item.name,
                            image: item.productBoutique?.image,
                            seed: item.productBoutique?.id ?? item.name,
                            quantity: item.quantity,
                            price: item.price,
                            lineTotal: item.lineTotal,
                            onTap: item.productBoutique == null ? null : () => context.openOffer(item.productBoutique!.id),
                          ),
                      ],
                    ),
                  ],
                  const SizedBox(height: Space.s5),
                  ListGroup(
                    title: 'Récapitulatif',
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: Space.s2),
                        child: Column(
                          children: [
                            money('Sous-total', formatPrice(o.subtotal)),
                            if (o.discountAmount > 0) money('Remise${o.promotionCode != null ? ' (${o.promotionCode})' : ''}', '−${formatPrice(o.discountAmount)}', color: t.accent),
                            money('Livraison', o.shippingFee > 0 ? formatPrice(o.shippingFee) : 'Offerte'),
                            const Divider(indent: Space.s4, endIndent: Space.s4),
                            money('Total', formatPrice(o.amount), strong: true),
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (homeDelivery && address != null) ...[
                    const SizedBox(height: Space.s5),
                    ListGroup(
                      title: 'Adresse de livraison',
                      children: [
                        ListRow(
                          icon: Icons.place_outlined,
                          title: address.destinataire ?? 'Adresse de livraison',
                          subtitle: '${address.adresse}\n${[address.commune, address.ville].whereType<String>().join(', ')}\nJoignable au ${address.telephone}',
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: Space.s5),
                  ListGroup(
                    title: 'Référence',
                    footer: 'À communiquer à la boutique ou au support pour toute question.',
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
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// La part d'une boutique : statut, livraison, code, échéance, articles, actions.
class _PartCard extends ConsumerStatefulWidget {
  const _PartCard({required this.order, required this.part});

  final Order order;
  final ShopOrder part;

  @override
  ConsumerState<_PartCard> createState() => _PartCardState();
}

class _PartCardState extends ConsumerState<_PartCard> {
  bool _busy = false;

  Future<void> _run(ShopOrderAction action) async {
    final input = await showModalBottomSheet<({String? reason, String? note})>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _ActionSheet(action: action, part: widget.part),
    );
    if (input == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final message = await ref.read(accountApiProvider).partAction(widget.part.id, action, reason: input.reason, note: input.note);
      HapticFeedback.mediumImpact();
      if (mounted) showMessage(context, message);
    } catch (e) {
      if (mounted) showMessage(context, errorMessage(e));
    } finally {
      ref.invalidate(orderProvider(widget.order.id));
      if (mounted) setState(() => _busy = false);
    }
  }

  void _report() {
    final p = widget.part;
    final query = Uri(queryParameters: {'type': 'order_problem', 'cible': p.id, 'libelle': 'Commande ${p.reference} — ${p.shopName}'}).query;
    context.push('/compte/support/nouvelle?$query');
  }

  String? _deadlineText(ShopOrder p) {
    final d = p.deadlineAt;
    if (d == null) return null;
    return switch (p.status) {
      ShopOrderStatus.pending => '${p.shopName} confirme avant le ${formatDateTime(d)}, sinon la commande expire.',
      ShopOrderStatus.readyForPickup => 'À retirer avant le ${formatDateTime(d)}.',
      ShopOrderStatus.delivered => 'Un problème ? Retour possible jusqu’au ${formatDateTime(d)}.',
      ShopOrderStatus.returnRequested => '${p.shopName} répond à votre retour avant le ${formatDateTime(d)}, sinon l’équipe tranche.',
      _ => null,
    };
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final p = widget.part;
    final deadline = _deadlineText(p);
    final ret = p.returnRequest;
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.s4, Space.s4, Space.s4, Space.s2),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Le statut passe sous le nom quand la place manque : jamais tronqué.
                Wrap(
                  spacing: Space.s2,
                  runSpacing: Space.s1,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    InkWell(
                      onTap: p.boutiqueId.isEmpty ? null : () => context.openShop(p.boutiqueId),
                      child: Text(p.shopName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    ),
                    ShopOrderStatusBadge(status: p.status),
                  ],
                ),
                const SizedBox(height: Space.s1),
                Text(
                  '${p.delivery.label}${p.delivery.fee > 0 ? ' · ${formatPrice(p.delivery.fee)}' : ''}${p.delivery.isPickup && p.delivery.pickupAdresse != null ? ' · ${p.delivery.pickupAdresse}' : ''}',
                  style: TextStyle(color: t.textMuted, fontSize: 13),
                ),
                if (p.status.showsPickupCode && p.pickupCode != null) ...[
                  const SizedBox(height: Space.s3),
                  Container(
                    padding: const EdgeInsets.all(Space.s3),
                    decoration: BoxDecoration(color: t.surfaceAlt, borderRadius: BorderRadius.circular(Radii.sm)),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(p.delivery.isPickup ? 'Code à donner au comptoir de la boutique' : 'Code à donner au livreur, à la remise', style: TextStyle(color: t.textMuted, fontSize: 12.5)),
                        ),
                        Semantics(
                          label: 'Code de remise ${p.pickupCode!.split('').join(' ')}',
                          child: Text(
                            p.pickupCode!,
                            style: monoStyle(context, size: 22, color: t.text, weight: FontWeight.w700),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                if (deadline != null) ...[const SizedBox(height: Space.s2), Text(deadline, style: TextStyle(color: t.textMuted, fontSize: 12.5))],
                if (ret != null) ...[
                  const SizedBox(height: Space.s3),
                  AlertBanner(
                    tone: AlertTone.info,
                    message:
                        'Retour demandé le ${formatDate(ret.requestedAt)} : ${ret.reasonLabel}${ret.details != null ? ' — ${ret.details}' : ''}${ret.shopResponse != null ? '\nRéponse de la boutique : ${ret.shopResponse}' : ''}${ret.resolutionNote != null ? '\nDécision : ${ret.resolutionNote}' : ''}',
                  ),
                ],
                if (p.paymentStatus == ShopOrderPaymentStatus.refundPending || p.paymentStatus == ShopOrderPaymentStatus.refunded) ...[
                  const SizedBox(height: Space.s2),
                  Text(
                    '${p.paymentStatus.label}${p.refundedAmount > 0 ? ' : ${formatPrice(p.refundedAmount)}' : ''}',
                    style: TextStyle(color: t.success, fontSize: 12.5, fontWeight: FontWeight.w600),
                  ),
                ],
              ],
            ),
          ),
          for (final item in p.items)
            _ItemRow(
              name: item.name,
              image: item.urlImages.firstOrNull,
              seed: item.productBoutiqueId,
              quantity: item.quantity,
              price: item.price,
              lineTotal: item.lineTotal,
              onTap: () => context.openOffer(item.productBoutiqueId),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.s4, Space.s1, Space.s4, Space.s2),
            child: Row(
              children: [
                Expanded(
                  child: Text('Total chez ${p.shopName}', style: TextStyle(color: t.textMuted, fontSize: 13)),
                ),
                Text(formatPrice(p.amount), style: const TextStyle(fontWeight: FontWeight.w700)),
              ],
            ),
          ),
          if (p.statusHistory.isNotEmpty)
            Theme(
              data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                tilePadding: const EdgeInsets.symmetric(horizontal: Space.s4),
                childrenPadding: const EdgeInsets.fromLTRB(Space.s4, 0, Space.s4, Space.s3),
                title: Text(
                  'Suivi',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.text),
                ),
                children: [_Timeline(steps: p.statusHistory)],
              ),
            ),
          if (p.status != ShopOrderStatus.awaitingPayment)
            Padding(
              padding: const EdgeInsets.fromLTRB(Space.s4, 0, Space.s4, Space.s4),
              child: Wrap(
                spacing: Space.s2,
                runSpacing: Space.s2,
                children: [
                  for (final action in p.availableActions)
                    action.danger
                        ? OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: t.danger,
                              side: BorderSide(color: t.danger.withValues(alpha: 0.5)),
                            ),
                            onPressed: _busy ? null : () => _run(action),
                            child: Text(action.label),
                          )
                        : FilledButton.tonal(onPressed: _busy ? null : () => _run(action), child: Text(action.label)),
                  TextButton.icon(onPressed: _report, icon: const Icon(Icons.support_agent_outlined, size: 18), label: const Text('Signaler un problème')),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({required this.name, required this.image, required this.seed, required this.quantity, required this.price, required this.lineTotal, this.onTap});

  final String name;
  final String? image;
  final String seed;
  final int quantity;
  final double price;
  final double lineTotal;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Space.s4, vertical: Space.s2),
        child: Row(
          children: [
            SizedBox(
              width: 52,
              child: ProductThumbnail(url: image, seed: seed),
            ),
            const SizedBox(width: Space.s3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w500, height: 1.3),
                  ),
                  Text('$quantity × ${formatPrice(price)}', style: TextStyle(color: t.textMuted, fontSize: 12)),
                ],
              ),
            ),
            Text(formatPrice(lineTotal), style: const TextStyle(fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

/// Étapes d'une sous-commande, la plus récente en bas.
class _Timeline extends StatelessWidget {
  const _Timeline({required this.steps});

  final List<ShopOrderStep> steps;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Column(
      children: [
        for (var i = 0; i < steps.length; i++)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 20,
                  child: Column(
                    children: [
                      Container(
                        width: 10,
                        height: 10,
                        margin: const EdgeInsets.only(top: 4),
                        decoration: BoxDecoration(color: i == steps.length - 1 ? toneColors(t, steps[i].status.tone).$1 : t.borderStrong, shape: BoxShape.circle),
                      ),
                      if (i < steps.length - 1) Expanded(child: Container(width: 2, color: t.border)),
                    ],
                  ),
                ),
                const SizedBox(width: Space.s2),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: Space.s3),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(steps[i].status.label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
                        Text([formatDateTime(steps[i].changedAt), if (steps[i].actorLabel.isNotEmpty) steps[i].actorLabel].join(' · '), style: TextStyle(color: t.textMuted, fontSize: 12)),
                        if (steps[i].reasonLabel != null || steps[i].note != null)
                          Text([steps[i].reasonLabel, steps[i].note].whereType<String>().join(' — '), style: TextStyle(color: t.text, fontSize: 12.5)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// Motif et précision d'une action, avant de l'envoyer.
class _ActionSheet extends StatefulWidget {
  const _ActionSheet({required this.action, required this.part});

  final ShopOrderAction action;
  final ShopOrder part;

  @override
  State<_ActionSheet> createState() => _ActionSheetState();
}

class _ActionSheetState extends State<_ActionSheet> {
  String? _reason;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final a = widget.action;
    final needsPhoto = _reason != null && returnReasonsNeedingPhoto.contains(_reason);
    final ready = (!a.reasonRequired || _reason != null) && (_reason != 'other' || _note.text.trim().isNotEmpty) && !needsPhoto;
    return Padding(
      padding: EdgeInsets.fromLTRB(context.gutter, 0, context.gutter, MediaQuery.viewInsetsOf(context).bottom + Space.s4),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(a.label, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: Space.s1),
            Text('${a.question} (${widget.part.shopName})', style: TextStyle(color: t.textMuted)),
            const SizedBox(height: Space.s3),
            RadioGroup<String>(
              groupValue: _reason,
              onChanged: (v) => setState(() => _reason = v),
              child: Column(
                children: [
                  for (final e in a.reasons.entries)
                    RadioListTile<String>(
                      value: e.key,
                      contentPadding: EdgeInsets.zero,
                      title: Text(e.value),
                      subtitle: returnReasonsNeedingPhoto.contains(e.key) && a == ShopOrderAction.requestReturn ? const Text('Une photo est exigée : demandez ce retour depuis le site web.') : null,
                    ),
                ],
              ),
            ),
            const SizedBox(height: Space.s2),
            TextField(
              controller: _note,
              minLines: 2,
              maxLines: 4,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(labelText: _reason == 'other' ? 'Précisez (requis)' : 'Précision (facultatif)'),
            ),
            if (needsPhoto) ...[
              const SizedBox(height: Space.s3),
              const AlertBanner(tone: AlertTone.warning, message: 'Joignez au moins une photo du produit abîmé : ce retour se demande depuis le site web.'),
            ],
            const SizedBox(height: Space.s4),
            FilledButton(
              style: a.danger ? FilledButton.styleFrom(backgroundColor: t.danger, foregroundColor: t.surface) : null,
              onPressed: ready ? () => Navigator.pop(context, (reason: _reason, note: _note.text)) : null,
              child: Text(a.label),
            ),
            TextButton(onPressed: () => Navigator.pop(context), child: Text(a == ShopOrderAction.cancel ? 'Garder la commande' : 'Fermer')),
          ],
        ),
      ),
    );
  }
}
