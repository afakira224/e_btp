import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/navigation.dart';
import '../../app/theme/tokens.dart';
import '../../shared/api/api_exception.dart';
import '../../shared/ui/alert_banner.dart';
import '../../shared/ui/kit.dart';
import '../../shared/ui/responsive.dart';
import '../../shared/ui/states.dart';
import '../../shared/utils/format.dart';
import '../catalog/shared/product_grid.dart';
import 'shared/wishlist_controller.dart';

/// Mes favoris — grille de cartes ; « Vider » dans la barre.
class WishlistPage extends ConsumerWidget {
  const WishlistPage({super.key});

  Future<void> _clear(BuildContext context, WidgetRef ref) async {
    final ok = await confirmAction(context, title: 'Vider les favoris ?', confirmLabel: 'Vider', destructive: true);
    if (!ok) return;
    try {
      await ref.read(wishlistProvider.notifier).clear();
    } catch (e) {
      if (context.mounted) showMessage(context, errorMessage(e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final wishlist = ref.watch(wishlistProvider);
    final offers = wishlist.offers;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mes favoris'),
        actions: [
          if (wishlist.items.isNotEmpty) IconButton(tooltip: 'Vider les favoris', icon: const Icon(Icons.delete_sweep_outlined), onPressed: () => _clear(context, ref)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: ref.read(wishlistProvider.notifier).refresh,
        child: CustomScrollView(slivers: [
          if (offers.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: EmptyState(
                  icon: Icons.favorite_border,
                  title: 'Aucun favori',
                  text: 'Touchez le cœur d’un article pour le retrouver ici.',
                  actionLabel: 'Parcourir le catalogue',
                  onAction: () => context.go('/catalogue'),
                ),
              ),
            )
          else ...[
            SliverPadding(
              padding: EdgeInsets.fromLTRB(context.gutter, Space.s2, context.gutter, Space.s3),
              sliver: SliverToBoxAdapter(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text(plural(offers.length, 'article'), style: TextStyle(color: t.textMuted, fontSize: 13, fontWeight: FontWeight.w500)),
                  if (wishlist.orphans > 0) ...[
                    const SizedBox(height: Space.s3),
                    AlertBanner(
                      tone: AlertTone.warning,
                      message: wishlist.orphans == 1
                          ? "Un article favori n'est plus proposé par sa boutique."
                          : "${wishlist.orphans} articles favoris ne sont plus proposés par leur boutique.",
                    ),
                  ],
                ]),
              ),
            ),
            ProductSliverGrid(items: offers),
          ],
          const SliverToBoxAdapter(child: SizedBox(height: Space.s6)),
        ]),
      ),
    );
  }
}
