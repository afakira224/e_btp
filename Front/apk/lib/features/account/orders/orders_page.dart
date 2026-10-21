import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/tokens.dart';
import '../../../entities/order.dart';
import '../../../shared/ui/paged.dart';
import '../../../shared/ui/responsive.dart';
import '../../../shared/ui/states.dart';
import '../../auth/shared/auth_controller.dart';
import '../../catalog/shared/listing_screen.dart';
import '../shared/account_api.dart';
import '../shared/order_widgets.dart';

/// Mes commandes — filtres par statut en puces, pages de 10 chargées au défilement.
class OrdersPage extends ConsumerStatefulWidget {
  const OrdersPage({super.key});

  @override
  ConsumerState<OrdersPage> createState() => _OrdersPageState();
}

class _OrdersPageState extends ConsumerState<OrdersPage> {
  OrderStatus? _status;
  late final PagedController<Order> _paged = PagedController(_loader(null), idOf: (o) => o.id);

  PageLoader<Order> _loader(OrderStatus? s) => (page) => ref.read(accountApiProvider).orders(ref.read(currentUserIdProvider), status: s, page: page);

  void _filter(OrderStatus? s) {
    if (s == _status) return;
    setState(() => _status = s);
    _paged.reset(_loader(s));
  }

  @override
  void dispose() {
    _paged.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mes commandes'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: ChipRow(chips: [
            ChipItem('Toutes', active: _status == null, onTap: () => _filter(null)),
            for (final s in OrderStatus.values) ChipItem(s.filterLabel, active: _status == s, onTap: () => _filter(s)),
          ]),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _paged.refresh,
        child: LoadMoreListener(
          onReachEnd: _paged.loadMore,
          child: ListenableBuilder(
            listenable: _paged,
            builder: (context, _) {
              final c = _paged;
              return CustomScrollView(slivers: [
                if (c.error != null && c.items.isEmpty)
                  SliverPadding(padding: EdgeInsets.all(context.gutter), sliver: SliverToBoxAdapter(child: ErrorRetry(message: c.error!, onRetry: c.loadMore)))
                else if (!c.loadedOnce)
                  SliverPadding(
                    padding: EdgeInsets.all(context.gutter),
                    sliver: SliverList.separated(itemCount: 4, separatorBuilder: (_, _) => const SizedBox(height: Space.s3), itemBuilder: (_, _) => const Skeleton(height: 132)),
                  )
                else if (c.items.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(
                      child: EmptyState(
                        icon: Icons.receipt_long_outlined,
                        title: _status != null ? 'Aucune commande « ${_status!.label.toLowerCase()} »' : 'Aucune commande',
                        text: _status != null ? 'Essayez un autre filtre.' : 'Vos commandes apparaîtront ici dès votre premier achat.',
                        actionLabel: _status != null ? 'Voir toutes mes commandes' : 'Parcourir le catalogue',
                        onAction: _status != null ? () => _filter(null) : () => context.go('/catalogue'),
                      ),
                    ),
                  )
                else ...[
                  SliverPadding(
                    padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, Space.s3),
                    sliver: SliverList.separated(
                      itemCount: c.items.length,
                      separatorBuilder: (_, _) => const SizedBox(height: Space.s3),
                      itemBuilder: (context, i) => Readable(
                        maxWidth: 760,
                        child: OrderCard(order: c.items[i], onTap: () => context.push('/compte/commandes/${c.items[i].id}')),
                      ),
                    ),
                  ),
                  SliverPadding(
                    padding: EdgeInsets.fromLTRB(context.gutter, 0, context.gutter, Space.s6),
                    sliver: SliverToBoxAdapter(
                      child: Center(
                        child: c.isLoading
                            ? const Padding(padding: EdgeInsets.all(Space.s3), child: CircularProgressIndicator(strokeWidth: 2))
                            : (c.error != null ? ErrorRetry(message: c.error!, onRetry: c.loadMore) : const SizedBox.shrink()),
                      ),
                    ),
                  ),
                ],
              ]);
            },
          ),
        ),
      ),
    );
  }
}
