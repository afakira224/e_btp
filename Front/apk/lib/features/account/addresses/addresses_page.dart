import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/navigation.dart';
import '../../../app/theme/tokens.dart';
import '../../../entities/address.dart';
import '../../../shared/api/api_exception.dart';
import '../../../shared/ui/badge.dart';
import '../../../shared/ui/kit.dart';
import '../../../shared/ui/responsive.dart';
import '../../../shared/ui/states.dart';
import '../../auth/shared/auth_controller.dart';
import '../shared/account_api.dart';

// ─────────────────────────────────────────────
//  Mes adresses — la liste seule. Ajouter ou modifier ouvre un écran de
//  formulaire à part ; au retour, le message de confirmation est renvoyé
//  par `pop` et affiché une fois. « Par défaut » et « Supprimer » sont dans
//  le menu de chaque carte : des actions sans saisie.
// ─────────────────────────────────────────────
class AddressesPage extends ConsumerStatefulWidget {
  const AddressesPage({super.key});

  @override
  ConsumerState<AddressesPage> createState() => _AddressesPageState();
}

class _AddressesPageState extends ConsumerState<AddressesPage> {
  Future<void> _openForm(String path) async {
    final message = await context.push<String>(path);
    if (!mounted) return;
    ref.invalidate(addressesProvider);
    if (message != null) showMessage(context, message);
  }

  Future<void> _run(Future<void> Function() action, String success) async {
    try {
      await action();
      ref.invalidate(addressesProvider);
      if (mounted) showMessage(context, success);
    } catch (e) {
      if (mounted) showMessage(context, errorMessage(e));
    }
  }

  Future<void> _confirmDelete(Address a) async {
    final ok = await confirmAction(
      context,
      title: 'Supprimer « ${a.displayLabel} » ?',
      message: a.isDefault ? "C'est votre adresse par défaut : une autre adresse prendra sa place." : 'Cette adresse sera retirée de votre carnet.',
      confirmLabel: 'Supprimer',
      destructive: true,
    );
    if (ok) await _run(() => ref.read(accountApiProvider).deleteAddress(a.id), 'Adresse supprimée');
  }

  @override
  Widget build(BuildContext context) {
    final book = ref.watch(addressesProvider);
    final recipient = ref.watch(authProvider).user?.fullName ?? '';
    final hasAny = book.value?.isNotEmpty ?? false;

    return Scaffold(
      appBar: AppBar(title: const Text('Mes adresses')),
      floatingActionButton: hasAny
          ? FloatingActionButton.extended(onPressed: () => _openForm('/compte/adresses/nouvelle'), icon: const Icon(Icons.add), label: const Text('Nouvelle adresse'))
          : null,
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(addressesProvider.future),
        child: book.when(
          loading: () => ListView(padding: EdgeInsets.all(context.gutter), children: const [Skeleton(height: 140), SizedBox(height: Space.s3), Skeleton(height: 140)]),
          error: (e, _) => ListView(padding: EdgeInsets.all(context.gutter), children: [ErrorRetry(message: errorMessage(e), onRetry: () => ref.invalidate(addressesProvider))]),
          data: (list) => list.isEmpty
              ? CustomScrollView(slivers: [
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(
                      child: EmptyState(
                        icon: Icons.place_outlined,
                        title: 'Aucune adresse',
                        text: 'Ajoutez votre domicile ou votre chantier pour commander plus vite.',
                        actionLabel: 'Ajouter une adresse',
                        onAction: () => _openForm('/compte/adresses/nouvelle'),
                      ),
                    ),
                  ),
                ])
              : ListView.separated(
                  padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, 112),
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const SizedBox(height: Space.s3),
                  itemBuilder: (context, i) {
                    final a = list[i];
                    return Readable(
                      maxWidth: 760,
                      child: _AddressCard(
                        address: a,
                        fallbackRecipient: recipient,
                        onEdit: () => _openForm('/compte/adresses/${Uri.encodeComponent(a.id)}/modifier'),
                        onMakeDefault: () => _run(() => ref.read(accountApiProvider).setDefaultAddress(a.id), '« ${a.displayLabel} » est votre adresse par défaut'),
                        onDelete: () => _confirmDelete(a),
                      ),
                    );
                  },
                ),
        ),
      ),
    );
  }
}

enum _Action { edit, makeDefault, delete }

class _AddressCard extends StatelessWidget {
  const _AddressCard({required this.address, required this.fallbackRecipient, required this.onEdit, required this.onMakeDefault, required this.onDelete});

  final Address address;
  final String fallbackRecipient;
  final VoidCallback onEdit;
  final VoidCallback onMakeDefault;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final a = address;
    return AppCard(
      onTap: onEdit,
      padding: const EdgeInsets.fromLTRB(Space.s4, Space.s3, Space.s1, Space.s4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.only(top: Space.s1),
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: a.isDefault ? t.primary : t.surfaceAlt, borderRadius: BorderRadius.circular(Radii.sm)),
            child: Icon(_iconFor(a.label), color: a.isDefault ? t.primaryText : t.text, size: 20),
          ),
        ),
        const SizedBox(width: Space.s3),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(top: Space.s1),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(spacing: Space.s2, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Text(a.displayLabel, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                if (a.isDefault) const BtpBadge('Par défaut', tone: BadgeTone.solid),
              ]),
              const SizedBox(height: Space.s1),
              Text(a.destinataire?.isNotEmpty == true ? a.destinataire! : fallbackRecipient, style: const TextStyle(fontWeight: FontWeight.w500)),
              Text(a.adresse, style: TextStyle(color: t.text)),
              if (a.locality.isNotEmpty) Text(a.locality, style: TextStyle(color: t.textMuted)),
              const SizedBox(height: 2),
              Row(children: [
                Icon(Icons.phone_outlined, size: 14, color: t.textMuted),
                const SizedBox(width: Space.s1),
                Text(a.telephone, style: TextStyle(color: t.textMuted, fontSize: 13)),
              ]),
            ]),
          ),
        ),
        PopupMenuButton<_Action>(
          tooltip: 'Actions sur ${a.displayLabel}',
          icon: Icon(Icons.more_vert, color: t.textMuted),
          onSelected: (action) => switch (action) {
            _Action.edit => onEdit(),
            _Action.makeDefault => onMakeDefault(),
            _Action.delete => onDelete(),
          },
          itemBuilder: (_) => [
            const PopupMenuItem(value: _Action.edit, child: ListTile(leading: Icon(Icons.edit_outlined), title: Text('Modifier'), contentPadding: EdgeInsets.zero)),
            if (!a.isDefault)
              const PopupMenuItem(value: _Action.makeDefault, child: ListTile(leading: Icon(Icons.check_circle_outline), title: Text('Définir par défaut'), contentPadding: EdgeInsets.zero)),
            PopupMenuItem(
              value: _Action.delete,
              child: ListTile(leading: Icon(Icons.delete_outline, color: t.danger), title: Text('Supprimer', style: TextStyle(color: t.danger)), contentPadding: EdgeInsets.zero),
            ),
          ],
        ),
      ]),
    );
  }

  static IconData _iconFor(String? label) => switch ((label ?? '').toLowerCase()) {
        'maison' || 'domicile' => Icons.home_outlined,
        'bureau' => Icons.business_outlined,
        'chantier' => Icons.construction_outlined,
        _ => Icons.place_outlined,
      };
}
