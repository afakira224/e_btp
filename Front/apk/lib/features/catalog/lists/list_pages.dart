import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/tokens.dart';
import '../../../entities/promotion.dart';
import '../../../shared/ui/badge.dart';
import '../../../shared/ui/countdown.dart';
import '../../../shared/ui/responsive.dart';
import '../../../shared/ui/states.dart';
import '../../../shared/utils/format.dart';
import '../shared/catalog_api.dart';
import '../shared/listing_screen.dart';

String _capitalized(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

// ─────────────────────────────────────────────
//  Nouveautés — tri `newest`. Le back n'a pas de filtre de date : la liste
//  déroule le catalogue par ancienneté, chaque photo porte sa date
//  d'arrivée.
// ─────────────────────────────────────────────
class NewArrivalsPage extends StatelessWidget {
  const NewArrivalsPage({super.key});

  @override
  Widget build(BuildContext context) => ListingScreen(
        title: 'Nouveautés',
        query: const ListingQuery(sort: ListingSort.newest),
        familleChips: true,
        sorts: const [],
        tag: (offer, _) => _capitalized(arrivedAgo(offer.createdAt)),
        emptyTitle: 'Aucun arrivage ici',
        emptyText: "Les dépôts n'ont pas encore référencé de nouveauté dans ce domaine.",
      );
}

// ─────────────────────────────────────────────
//  Meilleures ventes — tri `popular`. Le back ne connaît pas les volumes de
//  ventes : le classement repose sur le nombre d'avis.
// ─────────────────────────────────────────────
class BestSellersPage extends StatelessWidget {
  const BestSellersPage({super.key});

  @override
  Widget build(BuildContext context) => ListingScreen(
        title: 'Meilleures ventes',
        query: const ListingQuery(sort: ListingSort.popular),
        familleChips: true,
        sorts: const [],
        tag: (_, index) => 'N° ${index + 1}',
        emptyTitle: 'Pas encore de classement',
        emptyText: "Pas encore assez d'avis clients pour classer ce domaine.",
      );
}

// ─────────────────────────────────────────────
//  Promotions — ventes flash en cours (GET /promotions/flash/active), puis
//  toutes les offres remisées (discounted=true). Le back ne sait pas trier
//  par taux de remise : ce tri n'est pas proposé.
// ─────────────────────────────────────────────
class PromotionsPage extends ConsumerWidget {
  const PromotionsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final flash = ref.watch(flashSalesProvider);
    return ListingScreen(
      title: 'Promotions',
      query: const ListingQuery(discounted: true),
      familleChips: true,
      sorts: const [ListingSort.popular, ListingSort.priceAsc, ListingSort.priceDesc, ListingSort.newest],
      header: flash.when(
        // Rien n'est affirmé pendant le chargement.
        loading: () => Padding(padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, 0), child: const Skeleton(height: 180, radius: Radii.lg)),
        error: (_, _) => const SizedBox.shrink(),
        data: (sales) => sales.isEmpty
            ? const SizedBox.shrink()
            : Padding(
                padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, 0),
                child: Column(children: [for (final s in sales) Padding(padding: const EdgeInsets.only(bottom: Space.s3), child: FlashSaleBanner(sale: s))]),
              ),
      ),
      emptyTitle: 'Aucune remise ici',
      emptyText: 'Revenez bientôt : les dépôts publient régulièrement de nouvelles offres.',
    );
  }
}

/// Bandeau d'une vente flash, sur fond anthracite : nom, remise, échéance.
class FlashSaleBanner extends StatelessWidget {
  const FlashSaleBanner({super.key, required this.sale, this.onTap});

  final Promotion sale;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final remise = sale.isPercentage ? formatPercent(sale.discountValue) : formatPrice(sale.discountValue);
    return Material(
      color: t.chrome,
      borderRadius: BorderRadius.circular(Radii.lg),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(Space.s4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Icon(Icons.bolt, color: t.onChrome, size: 20),
              const SizedBox(width: Space.s1),
              Text('Vente flash', style: TextStyle(color: t.onChrome, fontWeight: FontWeight.w700)),
              const Spacer(),
              BtpBadge('−$remise', tone: BadgeTone.accent),
            ]),
            const SizedBox(height: Space.s2),
            Text(sale.nom, style: TextStyle(color: t.onChrome, fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -0.3)),
            if (sale.description != null) ...[
              const SizedBox(height: Space.s1),
              Text(sale.description!, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.onChromeMuted)),
            ],
            const SizedBox(height: Space.s3),
            Text('Se termine dans', style: TextStyle(color: t.onChromeMuted, fontSize: 12)),
            const SizedBox(height: Space.s1),
            Countdown(end: sale.endDate, color: t.onChrome, boxColor: t.chromeRaised),
            if (sale.maxDiscount != null) ...[
              const SizedBox(height: Space.s2),
              Text('Remise plafonnée à ${formatPrice(sale.maxDiscount!)}', style: TextStyle(color: t.onChromeMuted, fontSize: 12)),
            ],
          ]),
        ),
      ),
    );
  }
}
