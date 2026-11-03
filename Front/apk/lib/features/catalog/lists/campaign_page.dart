import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/navigation.dart';
import '../../../app/theme/tokens.dart';
import '../../../shared/api/api_exception.dart';
import '../../../shared/ui/badge.dart';
import '../../../shared/ui/responsive.dart';
import '../../../shared/ui/states.dart';
import '../../../shared/utils/format.dart';
import '../shared/catalog_api.dart';
import '../shared/product_grid.dart';

// ─────────────────────────────────────────────
//  Campagne de la plateforme — /campagnes/:slug
//
//  Un temps fort (« Rentrée chantier ») auquel les boutiques inscrivent
//  leurs promotions. La page montre les offres inscrites encore en stock,
//  les plus fortes remises d'abord.
// ─────────────────────────────────────────────
class CampaignPage extends ConsumerWidget {
  const CampaignPage({super.key, required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final data = ref.watch(campaignProvider(slug));
    return Scaffold(
      appBar: AppBar(
        title: Text(data.value?.$1.nom ?? 'Campagne', maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [IconButton(tooltip: 'Rechercher', icon: const Icon(Icons.search), onPressed: () => context.openSearch())],
      ),
      body: data.when(
        loading: () => ListView(
          padding: EdgeInsets.all(context.gutter),
          children: const [
            Skeleton(height: 140, radius: Radii.lg),
            SizedBox(height: Space.s4),
            Skeleton(height: 320),
          ],
        ),
        error: (e, _) => Center(
          child: EmptyState(icon: Icons.campaign_outlined, title: 'Campagne introuvable', text: errorMessage(e)),
        ),
        data: (value) {
          final (campaign, offers) = value;
          return RefreshIndicator(
            onRefresh: () => ref.refresh(campaignProvider(slug).future),
            child: CustomScrollView(
              slivers: [
                SliverToBoxAdapter(
                  child: Container(
                    margin: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, Space.s4),
                    padding: const EdgeInsets.all(Space.s4),
                    decoration: BoxDecoration(color: t.chrome, borderRadius: BorderRadius.circular(Radii.lg)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            BtpBadge(campaign.stateLabel, tone: campaign.isRunning ? BadgeTone.accent : BadgeTone.neutral),
                            if (campaign.minDiscount > 0) ...[const SizedBox(width: Space.s2), BtpBadge('Dès −${formatPercent(campaign.minDiscount)}', tone: BadgeTone.neutral)],
                          ],
                        ),
                        const SizedBox(height: Space.s3),
                        Text(
                          campaign.nom,
                          style: TextStyle(color: t.onChrome, fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.4),
                        ),
                        if (campaign.description != null) ...[const SizedBox(height: Space.s1), Text(campaign.description!, style: TextStyle(color: t.onChromeMuted, height: 1.4))],
                        const SizedBox(height: Space.s3),
                        Text(
                          campaign.isRunning
                              ? 'Jusqu’au ${formatDate(campaign.endDate)} · ${plural(offers.length, 'offre')}'
                              : 'Du ${formatDate(campaign.startDate)} au ${formatDate(campaign.endDate)}',
                          style: TextStyle(color: t.onChromeMuted, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                ),
                if (offers.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: EmptyState(
                      icon: Icons.local_offer_outlined,
                      title: campaign.isRunning ? 'Aucune offre pour le moment' : 'La campagne n’a pas commencé',
                      text: campaign.isRunning ? 'Les boutiques inscrivent leurs promotions au fil de la campagne.' : 'Les offres apparaîtront dès son ouverture.',
                      actionLabel: 'Voir les promotions',
                      onAction: () => context.openShared('promotions'),
                    ),
                  )
                else
                  ProductSliverGrid(items: offers),
                const SliverToBoxAdapter(child: SizedBox(height: Space.s6)),
              ],
            ),
          );
        },
      ),
    );
  }
}
