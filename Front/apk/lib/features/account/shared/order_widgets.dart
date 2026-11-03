import 'package:flutter/material.dart';

import '../../../app/theme/theme.dart';
import '../../../app/theme/tokens.dart';
import '../../../entities/order.dart';
import '../../../shared/ui/kit.dart';
import '../../../shared/ui/thumbnail.dart';
import '../../../shared/utils/format.dart';

/// Couleurs fonctionnelles d'un ton (charte §10) : premier plan, fond.
(Color, Color) toneColors(BtpTokens t, StatusTone tone) => switch (tone) {
  StatusTone.warning => (t.warning, t.warningSurface),
  StatusTone.progress => (t.primaryText, t.primary),
  StatusTone.success => (t.success, t.successSurface),
  StatusTone.danger => (t.danger, t.dangerSurface),
  StatusTone.neutral => (t.text, t.surfaceAlt),
};

/// Pastille d'état : couleur fonctionnelle ET libellé, la couleur n'est
/// jamais seule à parler.
class ToneBadge extends StatelessWidget {
  const ToneBadge({super.key, required this.label, required this.tone});

  final String label;
  final StatusTone tone;

  @override
  Widget build(BuildContext context) {
    final (fg, bg) = toneColors(context.tokens, tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: Space.s2, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          StatusDot(color: fg, size: 6),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

/// Statut d'une commande (déduit de ses sous-commandes).
class OrderStatusBadge extends StatelessWidget {
  const OrderStatusBadge({super.key, required this.status});

  final OrderStatus status;

  @override
  Widget build(BuildContext context) => ToneBadge(label: status.label, tone: status.tone);
}

/// Statut d'une sous-commande, celle d'une boutique.
class ShopOrderStatusBadge extends StatelessWidget {
  const ShopOrderStatusBadge({super.key, required this.status});

  final ShopOrderStatus status;

  @override
  Widget build(BuildContext context) => ToneBadge(label: status.label, tone: status.tone);
}

/// Carte d'une commande dans une liste ; toute la carte ouvre la fiche.
class OrderCard extends StatelessWidget {
  const OrderCard({super.key, required this.order, required this.onTap});

  final Order order;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final shown = order.items.take(4).toList();
    final hidden = order.items.length - shown.length;
    return AppCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      order.shortReference,
                      style: monoStyle(context, size: 14, color: t.text, weight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(formatDate(order.createdAt), style: TextStyle(color: t.textMuted, fontSize: 12)),
                  ],
                ),
              ),
              OrderStatusBadge(status: order.status),
            ],
          ),
          if (order.parts.length > 1) ...[
            const SizedBox(height: Space.s2),
            Text(
              order.parts.map((p) => '${p.shopName} : ${p.status.label.toLowerCase()}').join(' · '),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: t.textMuted, fontSize: 12),
            ),
          ] else if (order.parts.length == 1) ...[
            const SizedBox(height: Space.s2),
            Text('${order.parts.first.shopName} · ${order.parts.first.status.label}', style: TextStyle(color: t.textMuted, fontSize: 12)),
          ],
          if (order.awaitsPayment) ...[
            const SizedBox(height: Space.s2),
            Text(
              'Paiement en attente : ouvrez la commande pour payer.',
              style: TextStyle(color: t.warning, fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ],
          const SizedBox(height: Space.s3),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              // Les vignettes passent à la ligne plutôt que de pousser le montant hors de l'écran.
              Expanded(
                child: ExcludeSemantics(
                  child: Wrap(
                    spacing: Space.s1,
                    runSpacing: Space.s1,
                    children: [
                      for (final item in shown)
                        SizedBox(
                          width: 46,
                          child: ProductThumbnail(url: item.productBoutique?.image, seed: item.productBoutique?.id ?? item.name),
                        ),
                      if (hidden > 0)
                        Container(
                          width: 46,
                          height: 46,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: t.surfaceAlt, borderRadius: BorderRadius.circular(Radii.sm)),
                          child: Text('+$hidden', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: Space.s2),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(formatPrice(order.amount), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  Text(plural(order.totalItems, 'article'), style: TextStyle(color: t.textMuted, fontSize: 12)),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}
