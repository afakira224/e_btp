import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/navigation.dart';
import '../../app/theme/theme.dart';
import '../../app/theme/tokens.dart';
import '../../entities/support.dart';
import '../../shared/api/api_exception.dart';
import '../../shared/ui/alert_banner.dart';
import '../../shared/ui/kit.dart';
import '../../shared/ui/responsive.dart';
import '../../shared/ui/states.dart';
import '../../shared/utils/format.dart';
import '../account/shared/order_widgets.dart';
import '../auth/shared/auth_controller.dart';
import 'shared/support_api.dart';

// ─────────────────────────────────────────────
//  Support — /compte/support
//
//  Les demandes du client (réclamations sur une commande, signalements,
//  questions), en cours et terminées, et les mesures qui le concernent.
//  Une demande s'ouvre depuis la commande (« Signaler un problème »), la
//  fiche produit, la page d'une boutique, ou ici pour une question.
// ─────────────────────────────────────────────
class SupportPage extends ConsumerStatefulWidget {
  const SupportPage({super.key});

  @override
  ConsumerState<SupportPage> createState() => _SupportPageState();
}

class _SupportPageState extends ConsumerState<SupportPage> {
  bool _open = true;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final page = ref.watch(ticketsProvider(_open));
    final sanctions = ref.watch(mySanctionsProvider).value ?? const <Sanction>[];
    return Scaffold(
      appBar: AppBar(
        title: const Text('Support'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: Padding(
            padding: EdgeInsets.fromLTRB(context.gutter, 0, context.gutter, Space.s2),
            child: SegmentedButton<bool>(
              segments: [
                ButtonSegment(value: true, label: Text('En cours${page.value != null ? ' · ${page.value!.open}' : ''}')),
                ButtonSegment(value: false, label: Text('Terminées${page.value != null ? ' · ${page.value!.done}' : ''}')),
              ],
              selected: {_open},
              onSelectionChanged: (s) => setState(() => _open = s.first),
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/compte/support/nouvelle?type=general_question'),
        icon: const Icon(Icons.edit_outlined),
        label: const Text('Écrire à l’équipe'),
      ),
      body: RefreshIndicator(
        onRefresh: () {
          ref.invalidate(mySanctionsProvider);
          return ref.refresh(ticketsProvider(_open).future);
        },
        child: ListView(
          padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, 96),
          children: [
            Readable(
              maxWidth: 760,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Réglez tout ici, sans donner votre numéro : l’équipe s’appuie sur ces échanges en cas de désaccord.', style: TextStyle(color: t.textMuted, fontSize: 13)),
                  const SizedBox(height: Space.s4),
                  ...page.when(
                    loading: () => [
                      for (var i = 0; i < 3; i++)
                        const Padding(
                          padding: EdgeInsets.only(bottom: Space.s3),
                          child: Skeleton(height: 96),
                        ),
                    ],
                    error: (e, _) => [ErrorRetry(message: errorMessage(e), onRetry: () => ref.invalidate(ticketsProvider(_open)))],
                    data: (p) => p.tickets.isEmpty
                        ? [
                            EmptyState(
                              icon: Icons.support_agent_outlined,
                              title: _open ? 'Aucune demande en cours' : 'Aucune demande terminée',
                              text: _open ? 'Un souci avec une commande ? Ouvrez-la et touchez « Signaler un problème ».' : 'Vos demandes réglées ou fermées s’afficheront ici.',
                            ),
                          ]
                        : [
                            for (final ticket in p.tickets)
                              Padding(
                                padding: const EdgeInsets.only(bottom: Space.s3),
                                child: _TicketCard(ticket: ticket),
                              ),
                          ],
                  ),
                  if (sanctions.isNotEmpty) ...[
                    const SizedBox(height: Space.s4),
                    ListGroup(
                      title: 'Mesures qui vous concernent',
                      footer: 'Prises par l’équipe de la plateforme. Une mesure se conteste une fois.',
                      children: [
                        for (final s in sanctions)
                          ListRow(
                            icon: Icons.gavel_outlined,
                            title: '${s.typeLabel} — ${s.targetLabel}',
                            subtitle:
                                '${s.reason}${s.endsAt != null && s.isActive ? '\nJusqu’au ${formatDate(s.endsAt!)}' : ''}${!s.isActive ? '\n${s.state == 'lifted' ? 'Levée' : 'Terminée'}' : ''}',
                            onTap: s.isActive
                                ? () =>
                                      context.push('/compte/support/nouvelle?${Uri(queryParameters: {'type': 'sanction_appeal', 'cible': s.id, 'libelle': '${s.typeLabel} — ${s.targetLabel}'}).query}')
                                : null,
                          ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TicketCard extends StatelessWidget {
  const _TicketCard({required this.ticket});

  final SupportTicket ticket;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return AppCard(
      onTap: () => context.push('/compte/support/${ticket.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  ticket.number,
                  style: monoStyle(context, size: 13, color: t.textMuted, weight: FontWeight.w600),
                ),
              ),
              Flexible(
                child: ToneBadge(label: ticket.status.label, tone: ticket.status.tone),
              ),
            ],
          ),
          const SizedBox(height: Space.s2),
          Text(
            ticket.subject,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w600, height: 1.3),
          ),
          const SizedBox(height: Space.s1),
          Text('${ticket.type.label} · ${ticket.reasonLabel} · ${formatDate(ticket.lastMessageAt ?? ticket.createdAt)}', style: TextStyle(color: t.textMuted, fontSize: 12)),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────
//  Nouvelle demande — /compte/support/nouvelle?type=&cible=&libelle=
// ─────────────────────────────────────────────
class NewTicketPage extends ConsumerStatefulWidget {
  const NewTicketPage({super.key, required this.type, this.targetId, this.targetLabel});

  final SupportTicketType type;
  final String? targetId;
  final String? targetLabel;

  @override
  ConsumerState<NewTicketPage> createState() => _NewTicketPageState();
}

class _NewTicketPageState extends ConsumerState<NewTicketPage> {
  String? _reason;
  final _subject = TextEditingController();
  final _description = TextEditingController();
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final reasons = widget.type.reasons;
    if (reasons.length == 1) _reason = reasons.keys.first;
  }

  @override
  void dispose() {
    _subject.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final result = await ref.read(supportApiProvider).create(type: widget.type, reason: _reason!, description: _description.text.trim(), subject: _subject.text, targetId: widget.targetId);
      HapticFeedback.mediumImpact();
      ref.invalidate(ticketsProvider(true));
      if (!mounted) return;
      showMessage(context, result.ticket.warning ?? result.message);
      context.pushReplacement('/compte/support/${result.ticket.id}');
    } catch (e) {
      setState(() {
        _error = errorMessage(e);
        _sending = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final type = widget.type;
    final length = _description.text.trim().length;
    final minLength = _reason == 'other' ? 20 : 10;
    final ready = _reason != null && length >= minLength && !_sending;
    final title = switch (type) {
      SupportTicketType.orderProblem => 'Signaler un problème',
      SupportTicketType.listingReport => 'Signaler une annonce',
      SupportTicketType.shopReport => 'Signaler une boutique',
      SupportTicketType.sanctionAppeal => 'Contester une mesure',
      _ => 'Écrire à l’équipe',
    };
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      bottomNavigationBar: BottomActionBar(
        child: FilledButton(onPressed: ready ? _send : null, child: Text(_sending ? 'Envoi…' : 'Envoyer')),
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, Space.s6),
        children: [
          Readable(
            maxWidth: 640,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (widget.targetLabel != null) ...[Text(widget.targetLabel!, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)), const SizedBox(height: Space.s1)],
                Text(type.intro, style: TextStyle(color: t.textMuted, fontSize: 13)),
                const SizedBox(height: Space.s4),
                if (_error != null) ...[AlertBanner(tone: AlertTone.danger, message: _error!), const SizedBox(height: Space.s4)],
                if (type.reasons.length > 1) ...[
                  Text('Motif', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: Space.s2),
                  Wrap(
                    spacing: Space.s2,
                    runSpacing: Space.s2,
                    children: [for (final e in type.reasons.entries) ChoiceChip(label: Text(e.value), selected: _reason == e.key, onSelected: (_) => setState(() => _reason = e.key))],
                  ),
                  const SizedBox(height: Space.s4),
                ],
                if (type == SupportTicketType.generalQuestion) ...[
                  TextField(
                    controller: _subject,
                    maxLength: 120,
                    decoration: const InputDecoration(labelText: 'Objet (facultatif)'),
                  ),
                  const SizedBox(height: Space.s2),
                ],
                TextField(
                  controller: _description,
                  minLines: 5,
                  maxLines: 10,
                  maxLength: 2000,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(labelText: 'Décrivez la situation', helperText: '$minLength caractères au moins. Ne donnez ni numéro ni email : tout se règle ici.'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────
//  Une demande — /compte/support/:ticketId
//  Le fil d'échanges, la proposition de la boutique, les actions permises.
// ─────────────────────────────────────────────
class TicketPage extends ConsumerStatefulWidget {
  const TicketPage({super.key, required this.id});

  final String id;

  @override
  ConsumerState<TicketPage> createState() => _TicketPageState();
}

class _TicketPageState extends ConsumerState<TicketPage> {
  final _reply = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => _busy = true);
    try {
      final ticket = await ref.read(supportApiProvider).postMessage(widget.id, _reply.text.trim());
      _reply.clear();
      if (mounted && ticket.warning != null) showMessage(context, ticket.warning!);
      ref.invalidate(ticketProvider(widget.id));
    } catch (e) {
      if (mounted) showMessage(context, errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _act(SupportAction action) async {
    String? reason;
    int? rating;
    if (action.needsReason) {
      reason = await _askText(action);
      if (reason == null) return;
    } else if (action == SupportAction.rate) {
      rating = await _askRating();
      if (rating == null) return;
    } else if (action == SupportAction.close) {
      if (!mounted || !await confirmAction(context, title: 'Fermer la demande ?', confirmLabel: 'Fermer')) return;
    }
    setState(() => _busy = true);
    try {
      final result = await ref.read(supportApiProvider).action(widget.id, action, reason: reason, rating: rating);
      if (mounted) showMessage(context, result.message);
      ref
        ..invalidate(ticketProvider(widget.id))
        ..invalidate(ticketsProvider(true))
        ..invalidate(ticketsProvider(false));
    } catch (e) {
      if (mounted) showMessage(context, errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<String?> _askText(SupportAction action) async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(action.label),
        content: TextField(
          controller: controller,
          minLines: 3,
          maxLines: 6,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Expliquez pourquoi'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Annuler')),
          FilledButton(onPressed: () => Navigator.pop(context, controller.text.trim()), child: const Text('Envoyer')),
        ],
      ),
    );
    controller.dispose();
    return result == null || result.isEmpty ? null : result;
  }

  Future<int?> _askRating() => showDialog<int>(
    context: context,
    builder: (context) => SimpleDialog(
      title: const Text('Votre satisfaction'),
      children: [
        for (var i = 5; i >= 1; i--)
          SimpleDialogOption(onPressed: () => Navigator.pop(context, i), child: Text('${'★' * i}${'☆' * (5 - i)}  ${['', 'Très déçu', 'Déçu', 'Moyen', 'Satisfait', 'Très satisfait'][i]}')),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final user = ref.watch(authProvider).user;
    return ref
        .watch(ticketProvider(widget.id))
        .when(
          loading: () => Scaffold(
            appBar: AppBar(),
            body: Padding(padding: EdgeInsets.all(context.gutter), child: const Skeleton(height: 320)),
          ),
          error: (e, _) => Scaffold(
            appBar: AppBar(),
            body: Center(
              child: EmptyState(icon: Icons.support_agent_outlined, title: 'Demande introuvable', text: errorMessage(e)),
            ),
          ),
          data: (ticket) {
            final open = ticket.status.isOpen;
            return Scaffold(
              appBar: AppBar(title: Text(ticket.number)),
              bottomNavigationBar: open
                  ? BottomActionBar(
                      child: Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _reply,
                              minLines: 1,
                              maxLines: 4,
                              onChanged: (_) => setState(() {}),
                              decoration: const InputDecoration(hintText: 'Votre message'),
                            ),
                          ),
                          const SizedBox(width: Space.s2),
                          IconButton.filled(tooltip: 'Envoyer', onPressed: _busy || _reply.text.trim().isEmpty ? null : _send, icon: const Icon(Icons.send_rounded)),
                        ],
                      ),
                    )
                  : null,
              body: RefreshIndicator(
                onRefresh: () => ref.refresh(ticketProvider(widget.id).future),
                child: ListView(
                  padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, Space.s6),
                  children: [
                    Readable(
                      maxWidth: 760,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Wrap(
                            spacing: Space.s2,
                            runSpacing: Space.s1,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              Text('${ticket.type.label} · ${ticket.reasonLabel}', style: TextStyle(color: t.textMuted, fontSize: 13)),
                              ToneBadge(label: ticket.status.label, tone: ticket.status.tone),
                            ],
                          ),
                          const SizedBox(height: Space.s2),
                          Text(ticket.subject, style: Theme.of(context).textTheme.titleLarge),
                          if (ticket.deadlineAt != null && open) ...[
                            const SizedBox(height: Space.s1),
                            Text('Réponse attendue avant le ${formatDateTime(ticket.deadlineAt!)}', style: TextStyle(color: t.textMuted, fontSize: 12.5)),
                          ],
                          if (ticket.proposal case final p? when p.status == 'pending') ...[
                            const SizedBox(height: Space.s4),
                            AlertBanner(tone: AlertTone.info, message: 'Proposition de la boutique — ${p.kindLabel}\n${p.details}'),
                          ],
                          if (ticket.resolutionLabel != null) ...[
                            const SizedBox(height: Space.s4),
                            AlertBanner(tone: AlertTone.success, message: 'Décision : ${ticket.resolutionLabel}${ticket.resolutionNote != null ? '\n${ticket.resolutionNote}' : ''}'),
                          ],
                          if (ticket.availableActions.isNotEmpty) ...[
                            const SizedBox(height: Space.s4),
                            Wrap(
                              spacing: Space.s2,
                              runSpacing: Space.s2,
                              children: [
                                for (final a in ticket.availableActions)
                                  a == SupportAction.accept
                                      ? FilledButton(onPressed: _busy ? null : () => _act(a), child: Text(a.label))
                                      : OutlinedButton(onPressed: _busy ? null : () => _act(a), child: Text(a.label)),
                              ],
                            ),
                          ],
                          const SizedBox(height: Space.s5),
                          for (final m in ticket.messages) _MessageBubble(message: m, mineName: user?.fullName),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message, this.mineName});

  final SupportMessage message;
  final String? mineName;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    if (message.kind == 'event') {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: Space.s2),
        child: Text(
          '${message.body} · ${formatDateTime(message.createdAt)}',
          textAlign: TextAlign.center,
          style: TextStyle(color: t.textMuted, fontSize: 12),
        ),
      );
    }
    final mine = message.mine;
    final who = mine ? 'Vous' : (message.party == 'admin' ? 'Équipe de la plateforme' : message.authorName);
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: Container(
          margin: const EdgeInsets.only(bottom: Space.s3),
          padding: const EdgeInsets.all(Space.s3),
          decoration: BoxDecoration(
            color: mine ? t.surfaceAlt : t.surface,
            border: Border.all(color: message.kind == 'proposal' ? t.borderStrong : t.border),
            borderRadius: BorderRadius.circular(Radii.md),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '$who${message.kind == 'proposal' ? ' · proposition' : ''} · ${formatDateTime(message.createdAt)}',
                style: TextStyle(color: t.textMuted, fontSize: 11.5, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: Space.s1),
              Text(message.body, style: const TextStyle(height: 1.4)),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────
//  Nous contacter — sans compte : la réponse part par email.
// ─────────────────────────────────────────────
class ContactPage extends ConsumerStatefulWidget {
  const ContactPage({super.key});

  @override
  ConsumerState<ContactPage> createState() => _ContactPageState();
}

class _ContactPageState extends ConsumerState<ContactPage> {
  late final _name = TextEditingController(text: ref.read(authProvider).user?.fullName ?? '');
  late final _email = TextEditingController(text: ref.read(authProvider).user?.email ?? '');
  final _message = TextEditingController();
  String _reason = 'usage';
  bool _sending = false;
  String? _done;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final message = await ref.read(supportApiProvider).contact(name: _name.text.trim(), email: _email.text.trim(), reason: _reason, message: _message.text.trim());
      setState(() => _done = message);
    } catch (e) {
      setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final ready = _name.text.trim().length >= 2 && _email.text.contains('@') && _message.text.trim().length >= 10 && !_sending;
    return Scaffold(
      appBar: AppBar(title: const Text('Nous contacter')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, Space.s6),
        children: [
          Readable(
            maxWidth: 640,
            child: _done != null
                ? Column(
                    children: [
                      AlertBanner(tone: AlertTone.success, message: _done!),
                      const SizedBox(height: Space.s4),
                      OutlinedButton(onPressed: () => context.pop(), child: const Text('Retour')),
                    ],
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Une question sur un compte, un paiement, l’ouverture d’une boutique ? L’équipe vous répond par email sous 24 heures. Pour une commande, ouvrez-la et touchez « Signaler un problème ».',
                        style: TextStyle(color: t.textMuted, fontSize: 13),
                      ),
                      const SizedBox(height: Space.s4),
                      if (_error != null) ...[AlertBanner(tone: AlertTone.danger, message: _error!), const SizedBox(height: Space.s4)],
                      TextField(
                        controller: _name,
                        onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(labelText: 'Votre nom'),
                      ),
                      const SizedBox(height: Space.s3),
                      TextField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(labelText: 'Votre email'),
                      ),
                      const SizedBox(height: Space.s4),
                      Wrap(
                        spacing: Space.s2,
                        runSpacing: Space.s2,
                        children: [
                          for (final e in SupportTicketType.generalQuestion.reasons.entries)
                            ChoiceChip(label: Text(e.value), selected: _reason == e.key, onSelected: (_) => setState(() => _reason = e.key)),
                        ],
                      ),
                      const SizedBox(height: Space.s4),
                      TextField(
                        controller: _message,
                        minLines: 5,
                        maxLines: 10,
                        maxLength: 2000,
                        onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(labelText: 'Votre message'),
                      ),
                      const SizedBox(height: Space.s3),
                      FilledButton(onPressed: ready ? _send : null, child: Text(_sending ? 'Envoi…' : 'Envoyer')),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}
