import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/theme.dart';
import '../../../app/theme/tokens.dart';
import '../../../shared/api/api_exception.dart';
import '../../../shared/config/env.dart';
import '../../../shared/ui/kit.dart';
import '../../../shared/ui/responsive.dart';
import '../../../shared/utils/format.dart';
import '../../auth/shared/auth_controller.dart';
import '../../cart/shared/cart_controller.dart';
import '../../wishlist/shared/wishlist_controller.dart';
import '../shared/account_api.dart';

// ─────────────────────────────────────────────
//  Mon compte — profil en tête sur l'en-tête anthracite, chiffres clés,
//  puis les rubriques en listes groupées. Chaque rubrique est un écran.
// ─────────────────────────────────────────────
class AccountHomePage extends ConsumerStatefulWidget {
  const AccountHomePage({super.key});

  @override
  ConsumerState<AccountHomePage> createState() => _AccountHomePageState();
}

class _AccountHomePageState extends ConsumerState<AccountHomePage> {
  bool _sending = false;

  Future<void> _resend() async {
    setState(() => _sending = true);
    try {
      final message = await ref.read(authApiProvider).resendVerification();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorMessage(e))));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _logout() async {
    final ok = await confirmAction(context, title: 'Se déconnecter ?', confirmLabel: 'Se déconnecter');
    if (!ok) return;
    await ref.read(authProvider.notifier).logout();
    if (mounted) context.go('/accueil');
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    if (user == null) return const SizedBox.shrink();
    final t = context.tokens;
    final overview = ref.watch(accountOverviewProvider);
    final addresses = ref.watch(addressesProvider);
    final cartCount = ref.watch(cartCountProvider);
    final wishCount = ref.watch(wishlistCountProvider);
    final defaultAddress = addresses.value?.where((a) => a.isDefault).firstOrNull ?? addresses.value?.firstOrNull;

    Widget stat(String value, String label, VoidCallback onTap) => Expanded(
          child: InkWell(
            borderRadius: BorderRadius.circular(Radii.md),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: Space.s3),
              child: Column(children: [
                Text(value, style: monoStyle(context, size: 22, color: t.text, weight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(label, textAlign: TextAlign.center, style: TextStyle(color: t.textMuted, fontSize: 12)),
              ]),
            ),
          ),
        );

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          ref
            ..invalidate(accountOverviewProvider)
            ..invalidate(addressesProvider);
          await ref.read(authProvider.notifier).refresh();
        },
        child: CustomScrollView(slivers: [
          chromeSliverAppBar(
            context,
            title: 'Compte',
            actions: [
              IconButton(tooltip: 'Paramètres', icon: const Icon(Icons.settings_outlined), onPressed: () => context.push('/compte/parametres')),
              const SizedBox(width: Space.s1),
            ],
          ),
          // Identité, sur le prolongement de l'en-tête.
          SliverToBoxAdapter(
            child: Container(
              color: t.chrome,
              padding: EdgeInsets.fromLTRB(context.gutter, Space.s2, context.gutter, Space.s5),
              child: Row(children: [
                CircleAvatar(
                  radius: 32,
                  backgroundColor: t.onChrome,
                  foregroundImage: user.avatar != null ? NetworkImage(user.avatar!) : null,
                  child: Text(user.initials, style: TextStyle(color: t.chrome, fontSize: 20, fontWeight: FontWeight.w800)),
                ),
                const SizedBox(width: Space.s4),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(user.fullName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.onChrome, fontSize: 20, fontWeight: FontWeight.w700)),
                    Text(user.email, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.onChromeMuted, fontSize: 13)),
                    const SizedBox(height: Space.s1),
                    Text(
                      '${user.role.label}${user.createdAt != null ? ' · depuis ${formatMonthYear(user.createdAt!)}' : ''}',
                      style: TextStyle(color: t.onChromeMuted, fontSize: 12),
                    ),
                  ]),
                ),
              ]),
            ),
          ),
          // Chiffres clés, à cheval sur l'en-tête.
          SliverToBoxAdapter(
            child: Stack(children: [
              Positioned(top: 0, left: 0, right: 0, height: 36, child: ColoredBox(color: t.chrome)),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: context.gutter),
                child: AppCard(
                  padding: const EdgeInsets.symmetric(horizontal: Space.s2),
                  child: Row(children: [
                    stat(overview.value == null ? '—' : '${overview.value!.inProgress}', 'Commandes\nen cours', () => context.push('/compte/commandes')),
                    stat('$wishCount', 'Favoris', () => context.push('/compte/favoris')),
                    stat('$cartCount', 'Dans le\npanier', () => context.go('/panier')),
                  ]),
                ),
              ),
            ]),
          ),
          SliverPadding(
            padding: EdgeInsets.fromLTRB(context.gutter, Space.s5, context.gutter, Space.s6),
            sliver: SliverList.list(children: [
              if (!user.isEmailVerified) ...[
                AppCard(
                  color: t.warningSurface,
                  outlined: false,
                  child: Row(children: [
                    Icon(Icons.mark_email_unread_outlined, color: t.warning),
                    const SizedBox(width: Space.s3),
                    Expanded(child: Text('Vérifiez votre e-mail pour recevoir le suivi de vos commandes.', style: TextStyle(color: t.text, fontSize: 13))),
                    TextButton(onPressed: _sending ? null : _resend, child: Text(_sending ? 'Envoi…' : 'Renvoyer')),
                  ]),
                ),
                const SizedBox(height: Space.s5),
              ],
              ListGroup(title: 'Mes achats', children: [
                ListRow(
                  icon: Icons.receipt_long_outlined,
                  title: 'Mes commandes',
                  subtitle: overview.value == null ? null : '${overview.value!.inProgress} en cours · ${overview.value!.total} au total',
                  onTap: () => context.push('/compte/commandes'),
                ),
                ListRow(icon: Icons.favorite_border, title: 'Mes favoris', value: '$wishCount', onTap: () => context.push('/compte/favoris')),
                ListRow(icon: Icons.shopping_bag_outlined, title: 'Mon panier', value: '$cartCount', onTap: () => context.go('/panier')),
              ]),
              const SizedBox(height: Space.s5),
              ListGroup(title: 'Mon compte', children: [
                ListRow(
                  icon: Icons.person_outline,
                  title: 'Informations personnelles',
                  subtitle: user.isEmailVerified ? 'E-mail vérifié' : 'E-mail à vérifier',
                  onTap: () => context.push('/compte/profil'),
                ),
                ListRow(
                  icon: Icons.place_outlined,
                  title: 'Adresses de livraison',
                  subtitle: addresses.value == null
                      ? null
                      : addresses.value!.isEmpty
                          ? 'Aucune adresse'
                          : '${plural(addresses.value!.length, 'adresse')}${defaultAddress?.label != null ? ' · par défaut : ${defaultAddress!.label}' : ''}',
                  onTap: () => context.push('/compte/adresses'),
                ),
                ListRow(icon: Icons.settings_outlined, title: 'Paramètres', subtitle: 'Mot de passe, sessions, apparence', onTap: () => context.push('/compte/parametres')),
              ]),
              const SizedBox(height: Space.s5),
              ListGroup(children: [ListRow(icon: Icons.logout, title: 'Se déconnecter', destructive: true, onTap: _logout)]),
              const SizedBox(height: Space.s5),
              Center(child: Text('BTP · version ${Env.appVersion}', style: TextStyle(color: t.textMuted, fontSize: 12))),
            ]),
          ),
        ]),
      ),
    );
  }
}
