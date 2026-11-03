import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/navigation.dart';
import '../../app/theme/tokens.dart';
import '../../entities/address.dart';
import '../../entities/delivery.dart';
import '../../entities/order.dart';
import '../../shared/api/api_exception.dart';
import '../../shared/ui/alert_banner.dart';
import '../../shared/ui/kit.dart';
import '../../shared/ui/responsive.dart';
import '../../shared/ui/states.dart';
import '../../shared/utils/format.dart';
import '../account/shared/account_api.dart';
import '../auth/shared/auth_controller.dart';
import 'shared/cart_controller.dart';
import 'shared/checkout_api.dart';
import 'shared/delivery_controller.dart';

// ─────────────────────────────────────────────
//  Finaliser la commande — /panier/commande
//
//  Livraison par boutique (choisie au panier, modifiable ici), adresse dès
//  qu'une boutique livre, téléphone quand tout est retiré en boutique, mode
//  de paiement, code de réduction. Rien n'est additionné ici : le devis et
//  l'aperçu du code viennent du serveur, qui recalcule tout à l'envoi.
// ─────────────────────────────────────────────
class CheckoutPage extends ConsumerStatefulWidget {
  const CheckoutPage({super.key});

  @override
  ConsumerState<CheckoutPage> createState() => _CheckoutPageState();
}

class _CheckoutPageState extends ConsumerState<CheckoutPage> {
  String? _addressId;
  late final TextEditingController _phone = TextEditingController(text: ref.read(authProvider).user?.telephone ?? '');
  final _code = TextEditingController();
  PaymentMethod _payment = PaymentMethod.onDelivery;
  CouponPreview? _coupon;
  String? _couponError;
  bool _checking = false;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _applyCode() async {
    final code = _code.text.trim().toUpperCase();
    if (code.isEmpty) return;
    setState(() {
      _checking = true;
      _couponError = null;
    });
    try {
      final preview = await ref.read(checkoutApiProvider).previewCoupon(ref.read(currentUserIdProvider), code);
      setState(() => _coupon = preview);
    } catch (e) {
      setState(() {
        _coupon = null;
        _couponError = errorMessage(e);
      });
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  Future<void> _submit(DeliveryQuote quote, bool homeDelivery, bool pickupOnly) async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final placed = await ref
          .read(checkoutApiProvider)
          .placeOrder(
            ref.read(currentUserIdProvider),
            deliveries: {
              for (final g in quote.groups)
                if (g.selectedMethod != null) g.boutiqueId: g.selectedMethod!,
            },
            addressId: homeDelivery ? _addressId : null,
            telephone: pickupOnly && _phone.text.trim().isNotEmpty ? _phone.text.trim() : null,
            paymentMethod: _payment,
            code: _coupon?.code,
          );
      HapticFeedback.mediumImpact();
      ref.read(deliverySelectionProvider.notifier).keepOnly(const {});
      await ref.read(cartProvider.notifier).refresh();
      ref.invalidate(accountOverviewProvider);
      if (!mounted) return;
      final redirect = placed.redirectUrl;
      if (redirect != null) {
        final inApp = inAppPaymentOrderId(redirect);
        if (inApp != null) {
          context.go('/panier/paiement/${Uri.encodeComponent(inApp)}');
        } else {
          await launchUrl(Uri.parse(redirect), mode: LaunchMode.externalApplication);
          if (mounted) context.go('/compte/commandes/${placed.order.id}');
        }
        return;
      }
      context.go('/compte/commandes/${placed.order.id}?ok=${Uri.encodeQueryComponent('Commande ${placed.order.shortReference} transmise aux boutiques. Suivez chaque livraison ici.')}');
    } catch (e) {
      // Un prix a bougé, un mode retiré, un stock épuisé : le panier et le
      // devis sont relus pour montrer ce qui a changé.
      await ref.read(cartProvider.notifier).refresh();
      if (!mounted) return;
      setState(() {
        _error = errorMessage(e);
        _submitting = false;
      });
      if (e is ApiException && e.statusCode == 409) {
        showMessage(context, _error!);
        context.pop();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final cart = ref.watch(cartProvider);
    final quoteAsync = ref.watch(deliveryQuoteProvider);
    final quote = quoteAsync.value;
    final addresses = ref.watch(addressesProvider);

    if (cart.items.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Commande')),
        body: Center(
          child: EmptyState(
            icon: Icons.shopping_bag_outlined,
            title: 'Votre panier est vide',
            text: 'Ajoutez des articles avant de commander.',
            actionLabel: 'Parcourir le catalogue',
            onAction: () => context.go('/catalogue'),
          ),
        ),
      );
    }

    final groups = quote?.groups ?? const <DeliveryGroupQuote>[];
    final homeDelivery = groups.any((g) => g.selectedMethod != null && g.selectedMethod != DeliveryMode.pickup);
    final undecided = groups.any((g) => g.selectedMethod == null);
    final pickupOnly = groups.isNotEmpty && !homeDelivery && !undecided;
    final list = addresses.value ?? const <Address>[];
    final selected = _addressId ?? (list.where((a) => a.isDefault).firstOrNull ?? list.firstOrNull)?.id;
    if (_addressId == null && selected != null) _addressId = selected;
    final current = quote != null && !quoteAsync.isLoading && quote.subtotal == cart.totalAmount;
    final phoneOk = RegExp(r'^\d{9,12}$').hasMatch(_phone.text.trim());
    final canSubmit = current && quote.ready && !cart.hasBlockingIssue && (!homeDelivery || selected != null) && (!pickupOnly || phoneOk) && !_submitting;
    final total = current && quote.ready ? quote.total - (_coupon?.discount ?? 0) : cart.totalAmount;

    return Scaffold(
      appBar: AppBar(title: const Text('Finaliser la commande')),
      bottomNavigationBar: BottomActionBar(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('Total', style: TextStyle(color: t.textMuted, fontSize: 13)),
                ),
                Text(formatPrice(total < 0 ? 0 : total), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 22, letterSpacing: -0.4)),
              ],
            ),
            const SizedBox(height: Space.s3),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: canSubmit ? () => _submit(quote, homeDelivery, pickupOnly) : null,
                child: Text(_submitting ? 'Envoi…' : (_payment == PaymentMethod.online ? 'Commander et payer' : 'Confirmer la commande')),
              ),
            ),
            if (!canSubmit && !_submitting)
              Padding(
                padding: const EdgeInsets.only(top: Space.s2),
                child: Text(
                  !current || !(quote.ready)
                      ? 'Choisissez un mode de livraison pour chaque boutique.'
                      : cart.hasBlockingIssue
                      ? 'Certains articles dépassent le stock : ajustez le panier.'
                      : homeDelivery && selected == null
                      ? 'Ajoutez une adresse de livraison.'
                      : 'Indiquez un téléphone de 9 à 12 chiffres.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: t.textMuted, fontSize: 12),
                ),
              ),
          ],
        ),
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, Space.s6),
        children: [
          Readable(
            maxWidth: 760,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_error != null) ...[AlertBanner(tone: AlertTone.danger, message: _error!), const SizedBox(height: Space.s4)],
                ListGroup(
                  title: 'Livraison',
                  footer: 'Une livraison par boutique : ses articles partent ensemble.',
                  children: [
                    if (quote == null) const Padding(padding: EdgeInsets.all(Space.s4), child: Skeleton(height: 56)),
                    for (final g in groups) _DeliveryGroupTile(group: g, onChoose: (mode) => ref.read(deliverySelectionProvider.notifier).choose(g.boutiqueId, mode)),
                  ],
                ),
                const SizedBox(height: Space.s5),
                if (homeDelivery)
                  ListGroup(
                    title: 'Adresse de livraison',
                    children: [
                      if (addresses.isLoading) const Padding(padding: EdgeInsets.all(Space.s4), child: Skeleton(height: 56)),
                      RadioGroup<String>(
                        groupValue: selected,
                        onChanged: (v) => setState(() => _addressId = v),
                        child: Column(
                          children: [
                            for (final a in list)
                              RadioListTile<String>(
                                value: a.id,
                                title: Text('${a.displayLabel}${a.isDefault ? ' · par défaut' : ''}', style: const TextStyle(fontWeight: FontWeight.w600)),
                                subtitle: Text('${a.destinataire != null ? '${a.destinataire}\n' : ''}${a.adresse}\n${a.locality} · ${a.telephone}'),
                                isThreeLine: true,
                              ),
                          ],
                        ),
                      ),
                      ListRow(
                        icon: Icons.add_location_alt_outlined,
                        title: 'Ajouter une adresse',
                        onTap: () async {
                          await context.push('/panier/adresse');
                          ref.invalidate(addressesProvider);
                        },
                      ),
                    ],
                  )
                else if (pickupOnly)
                  ListGroup(
                    title: 'Contact',
                    footer: 'Tout est retiré en boutique : ce numéro sert à vous prévenir quand la commande est prête.',
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(Space.s4),
                        child: TextField(
                          controller: _phone,
                          keyboardType: TextInputType.phone,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                          onChanged: (_) => setState(() {}),
                          decoration: const InputDecoration(labelText: 'Téléphone'),
                        ),
                      ),
                    ],
                  ),
                if (homeDelivery || pickupOnly) const SizedBox(height: Space.s5),
                ListGroup(
                  title: 'Paiement',
                  footer: 'Une boutique qui refuse ou ne confirme pas sa part sous 48 heures ne la livre pas : payée en ligne, elle vous est remboursée.',
                  children: [
                    RadioGroup<PaymentMethod>(
                      groupValue: _payment,
                      onChanged: (v) => setState(() => _payment = v ?? _payment),
                      child: Column(
                        children: [
                          for (final m in PaymentMethod.values)
                            RadioListTile<PaymentMethod>(
                              value: m,
                              title: Text(m.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                              subtitle: Text(m.hint),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: Space.s5),
                ListGroup(
                  title: 'Code de réduction',
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(Space.s4),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _code,
                                  textCapitalization: TextCapitalization.characters,
                                  onChanged: (_) {
                                    if (_coupon != null || _couponError != null) {
                                      setState(() {
                                        _coupon = null;
                                        _couponError = null;
                                      });
                                    }
                                  },
                                  decoration: InputDecoration(labelText: 'Code', hintText: 'Ex. BIENVENUE10', errorText: _couponError, errorMaxLines: 3),
                                ),
                              ),
                              const SizedBox(width: Space.s2),
                              Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: OutlinedButton(onPressed: _checking ? null : _applyCode, child: Text(_checking ? '…' : 'Appliquer')),
                              ),
                            ],
                          ),
                          if (_coupon != null) ...[
                            const SizedBox(height: Space.s2),
                            Text(
                              'Code ${_coupon!.code} : −${formatPrice(_coupon!.discount)}${_coupon!.shopName != null ? ' sur les articles de ${_coupon!.shopName}' : ''}',
                              style: TextStyle(color: t.success, fontWeight: FontWeight.w600),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: Space.s5),
                ListGroup(
                  title: 'Récapitulatif',
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: Space.s2),
                      child: Column(
                        children: [
                          for (final item in cart.items) _Line(label: '${item.productName ?? 'Article'} × ${item.quantity}', value: formatPrice(item.lineTotal)),
                          const Divider(indent: Space.s4, endIndent: Space.s4),
                          _Line(label: 'Sous-total', value: formatPrice(cart.totalAmount)),
                          if (cart.totalSavings > 0) _Line(label: 'Dont promotions', value: '−${formatPrice(cart.totalSavings)}', color: t.accent),
                          if (_coupon != null) _Line(label: 'Code ${_coupon!.code}', value: '−${formatPrice(_coupon!.discount)}', color: t.accent),
                          if (current)
                            for (final g in groups) _Line(label: 'Livraison · ${g.boutiqueNom ?? 'Boutique'}', value: g.fee != null ? formatFee(g.fee!) : '—'),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.label, required this.value, this.color});

  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Space.s4, vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(label, style: TextStyle(color: t.textMuted, fontSize: 13.5)),
          ),
          const SizedBox(width: Space.s3),
          Text(
            value,
            style: TextStyle(color: color ?? t.text, fontWeight: FontWeight.w600, fontSize: 13.5),
          ),
        ],
      ),
    );
  }
}

/// Livraison d'une boutique : ses modes, ses frais, la livraison offerte.
class _DeliveryGroupTile extends StatelessWidget {
  const _DeliveryGroupTile({required this.group, required this.onChoose});

  final DeliveryGroupQuote group;
  final ValueChanged<DeliveryMode> onChoose;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final free = group.freeShipping;
    return Padding(
      padding: const EdgeInsets.all(Space.s4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(group.boutiqueNom ?? 'Boutique', style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
              Text(plural(group.productBoutiqueIds.length, 'article'), style: TextStyle(color: t.textMuted, fontSize: 12)),
            ],
          ),
          const SizedBox(height: Space.s2),
          Wrap(
            spacing: Space.s2,
            runSpacing: Space.s2,
            children: [
              for (final o in group.options) ChoiceChip(label: Text('${o.method.label} · ${formatFee(o.fee)}'), selected: group.selectedMethod == o.method, onSelected: (_) => onChoose(o.method)),
            ],
          ),
          if (group.selectedMethod == DeliveryMode.pickup && group.pickupAdresse != null)
            Padding(
              padding: const EdgeInsets.only(top: Space.s2),
              child: Text('À retirer : ${group.pickupAdresse}', style: TextStyle(color: t.textMuted, fontSize: 12.5)),
            ),
          if (free != null)
            Padding(
              padding: const EdgeInsets.only(top: Space.s2),
              child: Text(
                free.applied ? '${free.label} : livraison offerte' : 'Plus que ${formatPrice(free.remaining)} chez ${group.boutiqueNom ?? 'cette boutique'} pour la livraison offerte',
                style: TextStyle(color: free.applied ? t.success : t.textMuted, fontSize: 12.5, fontWeight: FontWeight.w600),
              ),
            ),
          if (group.error != null)
            Padding(
              padding: const EdgeInsets.only(top: Space.s2),
              child: Text(group.error!, style: TextStyle(color: t.danger, fontSize: 12.5)),
            ),
        ],
      ),
    );
  }
}
