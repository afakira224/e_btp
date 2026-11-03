import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/navigation.dart';
import '../../app/theme/tokens.dart';
import '../../entities/order.dart';
import '../../shared/api/api_exception.dart';
import '../../shared/ui/alert_banner.dart';
import '../../shared/ui/kit.dart';
import '../../shared/ui/responsive.dart';
import '../../shared/ui/states.dart';
import '../../shared/utils/format.dart';
import '../account/shared/account_api.dart';
import 'shared/cart_controller.dart';

// ─────────────────────────────────────────────
//  Paiement en ligne — /panier/paiement/:orderId
//
//  La page du prestataire de paiement simulé (« sandbox ») du back : aucun
//  argent ne circule, on choisit l'issue. Un vrai prestataire aurait sa
//  propre page et préviendrait le serveur par une notification signée. Sans
//  paiement sous 30 minutes, la commande échoue et le panier revient.
// ─────────────────────────────────────────────
class PaymentPage extends ConsumerStatefulWidget {
  const PaymentPage({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<PaymentPage> createState() => _PaymentPageState();
}

class _PaymentPageState extends ConsumerState<PaymentPage> {
  bool? _busy;
  late final Timer _tick = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));

  @override
  void dispose() {
    _tick.cancel();
    super.dispose();
  }

  Future<void> _settle(bool paid) async {
    setState(() => _busy = paid);
    try {
      final message = await ref.read(accountApiProvider).settleSandboxPayment(widget.orderId, paid: paid);
      if (!paid) await ref.read(cartProvider.notifier).refresh();
      ref
        ..invalidate(orderProvider(widget.orderId))
        ..invalidate(accountOverviewProvider);
      if (!mounted) return;
      final feedback = paid ? 'Paiement confirmé : chaque boutique a reçu sa part de la commande.' : message;
      context.go('/compte/commandes/${widget.orderId}?ok=${Uri.encodeQueryComponent(feedback)}');
    } catch (e) {
      if (mounted) showMessage(context, errorMessage(e));
      setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final order = ref.watch(orderProvider(widget.orderId));
    return Scaffold(
      appBar: AppBar(title: const Text('Paiement sécurisé')),
      body: order.when(
        loading: () => Padding(padding: EdgeInsets.all(context.gutter), child: const Skeleton(height: 260)),
        error: (e, _) => Center(
          child: EmptyState(icon: Icons.payments_outlined, title: 'Commande introuvable', text: errorMessage(e)),
        ),
        data: (o) {
          final expires = o.paymentExpiresAt;
          final left = expires?.difference(DateTime.now());
          final expired = left != null && left.isNegative;
          return ListView(
            padding: EdgeInsets.all(context.gutter),
            children: [
              Readable(
                maxWidth: 560,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Commande ${o.shortReference}', style: TextStyle(color: t.textMuted)),
                    Text('Payer ${formatPrice(o.amount)}', style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: Space.s4),
                    AppCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Eyebrow('Prestataire de test'),
                          const SizedBox(height: Space.s2),
                          Text("Aucun argent n'est débité", style: Theme.of(context).textTheme.titleLarge),
                          const SizedBox(height: Space.s2),
                          Text(
                            "Le paiement en ligne passe ici par un prestataire simulé. Un paiement accepté transmet la commande aux boutiques ; un refus l'annule et remet les articles dans votre panier.",
                            style: TextStyle(color: t.textMuted, height: 1.45),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: Space.s4),
                    if (!o.awaitsPayment)
                      AlertBanner(
                        tone: o.paymentStatus == OrderPaymentStatus.paid ? AlertTone.success : AlertTone.warning,
                        message: o.paymentStatus == OrderPaymentStatus.paid ? 'Cette commande est déjà payée.' : "Cette commande n'attend plus de paiement.",
                        action: TextButton(onPressed: () => context.go('/compte/commandes/${o.id}'), child: const Text('Voir la commande')),
                      )
                    else if (expired)
                      const AlertBanner(tone: AlertTone.warning, message: 'Le délai de paiement est dépassé : la commande va être annulée et votre panier restauré.')
                    else ...[
                      if (left != null)
                        Text('À payer avant ${formatDateTime(expires!)} — reste ${left.inMinutes} min ${(left.inSeconds % 60).toString().padLeft(2, '0')} s.', style: TextStyle(color: t.textMuted)),
                      const SizedBox(height: Space.s3),
                      ListGroup(
                        title: o.parts.length > 1 ? '${o.parts.length} boutiques' : 'Récapitulatif',
                        children: [
                          for (final p in o.parts) ListRow(title: p.shopName, value: formatPrice(p.amount)),
                          ListRow(title: 'Total', value: formatPrice(o.amount)),
                        ],
                      ),
                      const SizedBox(height: Space.s4),
                      FilledButton(onPressed: _busy != null ? null : () => _settle(true), child: Text(_busy == true ? 'Paiement…' : 'Payer ${formatPrice(o.amount)}')),
                      const SizedBox(height: Space.s2),
                      OutlinedButton(onPressed: _busy != null ? null : () => _settle(false), child: Text(_busy == false ? '…' : 'Simuler un refus')),
                    ],
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
