import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../app/navigation.dart';
import '../../../app/providers.dart';
import '../../../app/theme/tokens.dart';
import '../../../entities/json.dart';
import '../../../entities/order.dart';
import '../../../entities/shop_request.dart';
import '../../../entities/user.dart';
import '../../../shared/api/api_client.dart';
import '../../../shared/api/api_exception.dart';
import '../../../shared/config/env.dart';
import '../../../shared/ui/alert_banner.dart';
import '../../../shared/ui/kit.dart';
import '../../../shared/ui/responsive.dart';
import '../../../shared/ui/states.dart';
import '../../../shared/utils/format.dart';
import '../../auth/shared/auth_controller.dart';
import '../../catalog/shared/catalog_api.dart';
import '../shared/order_widgets.dart';

// ─────────────────────────────────────────────
//  Vendre sur la plateforme — /compte/vendre
//
//  Un client demande l'ouverture d'une boutique (POST /shop-requests) ;
//  l'administration l'examine. Approuvée, la boutique se gère depuis
//  l'espace boutique du site web : l'application reste côté acheteur.
// ─────────────────────────────────────────────

class ShopRequestApi {
  const ShopRequestApi(this._api);

  final ApiClient _api;

  Future<List<ShopRequest>> mine() async => (await _api.get('/shop-requests/mine')).list.whereType<Map>().map((e) => ShopRequest.fromJson(e.cast())).toList();

  Future<String> create(Json body) async => (await _api.post('/shop-requests', body)).message;

  Future<String> cancel(String id) async => (await _api.patch('/shop-requests/${Uri.encodeComponent(id)}/cancel', const {})).message;
}

final shopRequestApiProvider = Provider((ref) => ShopRequestApi(ref.watch(apiClientProvider)));
final myShopRequestsProvider = FutureProvider.autoDispose<List<ShopRequest>>((ref) => ref.watch(shopRequestApiProvider).mine());

StatusTone _tone(ShopRequestStatus s) => switch (s) {
  ShopRequestStatus.pending => StatusTone.warning,
  ShopRequestStatus.approved => StatusTone.success,
  ShopRequestStatus.rejected => StatusTone.danger,
  ShopRequestStatus.cancelled => StatusTone.neutral,
};

Future<void> openSellerConsole(BuildContext context) async {
  final ok = await launchUrl(Uri.parse('${Env.webUrl}/ma-boutique'), mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) showMessage(context, 'Ouvrez ${Env.webUrl}/ma-boutique dans votre navigateur.');
}

class ShopRequestPage extends ConsumerStatefulWidget {
  const ShopRequestPage({super.key});

  @override
  ConsumerState<ShopRequestPage> createState() => _ShopRequestPageState();
}

class _ShopRequestPageState extends ConsumerState<ShopRequestPage> {
  bool _busy = false;

  Future<void> _cancel(ShopRequest r) async {
    if (!await confirmAction(context, title: 'Annuler la demande ?', message: 'Vous pourrez en déposer une nouvelle ensuite.', confirmLabel: 'Annuler la demande', destructive: true)) return;
    setState(() => _busy = true);
    try {
      final message = await ref.read(shopRequestApiProvider).cancel(r.id);
      ref.invalidate(myShopRequestsProvider);
      if (mounted) showMessage(context, message);
    } catch (e) {
      if (mounted) showMessage(context, errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final user = ref.watch(authProvider).user;
    final requests = ref.watch(myShopRequestsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Vendre sur BTP')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myShopRequestsProvider.future),
        child: ListView(
          padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, Space.s6),
          children: [
            Readable(
              maxWidth: 680,
              child: requests.when(
                loading: () => const Skeleton(height: 220),
                error: (e, _) => ErrorRetry(message: errorMessage(e), onRetry: () => ref.invalidate(myShopRequestsProvider)),
                data: (list) {
                  final current = list.firstOrNull;
                  final canApply = user?.role != EntityType.shop && (current == null || current.status == ShopRequestStatus.rejected || current.status == ShopRequestStatus.cancelled);
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (user?.role == EntityType.shop) ...[
                        const AlertBanner(
                          tone: AlertTone.success,
                          message: 'Votre boutique est ouverte. Produits, commandes, promotions et mises en avant se gèrent depuis l’espace boutique du site web.',
                        ),
                        const SizedBox(height: Space.s3),
                        FilledButton.icon(onPressed: () => openSellerConsole(context), icon: const Icon(Icons.open_in_new), label: const Text('Ouvrir l’espace boutique')),
                        const SizedBox(height: Space.s5),
                      ] else if (current == null) ...[
                        Text('Ouvrez votre boutique', style: Theme.of(context).textTheme.headlineSmall),
                        const SizedBox(height: Space.s2),
                        Text(
                          'Matériaux, outillage, plomberie, électricité : vendez à toute la clientèle de la plateforme. L’équipe examine chaque demande ; une fois approuvée, votre compte devient celui d’un vendeur.',
                          style: TextStyle(color: t.textMuted, height: 1.45),
                        ),
                        const SizedBox(height: Space.s4),
                        ListGroup(
                          children: const [
                            ListRow(icon: Icons.storefront_outlined, title: 'Une vitrine à votre nom', subtitle: 'Votre catalogue, vos prix, vos modes de livraison'),
                            ListRow(icon: Icons.local_offer_outlined, title: 'Promotions et mises en avant', subtitle: 'Planifiées et lancées par vous, sans validation'),
                            ListRow(icon: Icons.payments_outlined, title: 'Paiement sécurisé', subtitle: 'En ligne ou à la livraison, selon le choix du client'),
                          ],
                        ),
                        const SizedBox(height: Space.s4),
                      ],
                      for (final r in list) ...[
                        AppCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(r.nom, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                                  ),
                                  ToneBadge(label: r.status.label, tone: _tone(r.status)),
                                ],
                              ),
                              const SizedBox(height: Space.s1),
                              Text(
                                'Déposée le ${formatDate(r.createdAt)}${r.reviewedAt != null ? ' · examinée le ${formatDate(r.reviewedAt!)}' : ''}',
                                style: TextStyle(color: t.textMuted, fontSize: 12.5),
                              ),
                              if (r.familles.isNotEmpty) ...[const SizedBox(height: Space.s2), Text(r.familles.join(' · '), style: const TextStyle(fontSize: 13))],
                              if (r.status == ShopRequestStatus.pending) ...[
                                const SizedBox(height: Space.s3),
                                Text('L’équipe examine votre demande. Vous serez prévenu par email.', style: TextStyle(color: t.textMuted, fontSize: 13)),
                                const SizedBox(height: Space.s2),
                                OutlinedButton(onPressed: _busy ? null : () => _cancel(r), child: const Text('Annuler la demande')),
                              ],
                              if (r.status == ShopRequestStatus.rejected && r.rejectionReason != null) ...[
                                const SizedBox(height: Space.s3),
                                AlertBanner(tone: AlertTone.danger, message: 'Motif : ${r.rejectionReason}'),
                              ],
                              if (r.status == ShopRequestStatus.approved) ...[
                                const SizedBox(height: Space.s3),
                                Text('Votre boutique est ouverte : déconnectez-vous puis reconnectez-vous si l’espace boutique n’apparaît pas.', style: TextStyle(color: t.textMuted, fontSize: 13)),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: Space.s3),
                      ],
                      if (canApply) ...[
                        const SizedBox(height: Space.s2),
                        FilledButton(onPressed: () => context.push('/compte/vendre/demande'), child: Text(current == null ? 'Demander l’ouverture' : 'Déposer une nouvelle demande')),
                      ],
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────
//  Le formulaire — mêmes champs et mêmes règles que le site web.
// ─────────────────────────────────────────────
class ShopRequestFormPage extends ConsumerStatefulWidget {
  const ShopRequestFormPage({super.key});

  @override
  ConsumerState<ShopRequestFormPage> createState() => _ShopRequestFormPageState();
}

class _ShopRequestFormPageState extends ConsumerState<ShopRequestFormPage> {
  final _nom = TextEditingController();
  final _description = TextEditingController();
  final _rccm = TextEditingController();
  final _adresse = TextEditingController();
  late final _email = TextEditingController(text: ref.read(authProvider).user?.email ?? '');
  final _message = TextEditingController();
  final _familles = <String>{};
  String _sellerType = 'particulier';
  String? _experience;
  String? _catalogSize;
  bool? _physical;
  bool _terms = false;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_nom, _description, _rccm, _adresse, _email, _message]) {
      c.dispose();
    }
    super.dispose();
  }

  String? get _missing {
    if (_nom.text.trim().length < 2) return 'le nom de la boutique';
    if (_description.text.trim().length < 20) return 'une présentation de 20 caractères au moins';
    if (_familles.isEmpty) return 'un domaine d’activité';
    if (_sellerType == 'entreprise' && _rccm.text.trim().length < 5) return 'le numéro RCCM';
    if (_experience == null) return 'l’ancienneté';
    if (_catalogSize == null) return 'la taille du catalogue';
    if (_physical == null) return 'si vous avez un dépôt';
    if (_adresse.text.trim().length < 5) return 'l’adresse';
    if (!_terms) return 'l’acceptation des conditions';
    return null;
  }

  Future<void> _send() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final message = await ref.read(shopRequestApiProvider).create({
        'nom': _nom.text.trim(),
        'description': _description.text.trim(),
        'familleIds': _familles.toList(),
        'sellerType': _sellerType,
        if (_sellerType == 'entreprise') 'rccm': _rccm.text.trim(),
        'experience': _experience,
        'catalogSize': _catalogSize,
        'hasPhysicalStore': _physical,
        'adresse': _adresse.text.trim(),
        if (_email.text.trim().isNotEmpty) 'email': _email.text.trim(),
        if (_message.text.trim().isNotEmpty) 'message': _message.text.trim(),
        'acceptTerms': _terms,
      });
      HapticFeedback.mediumImpact();
      ref.invalidate(myShopRequestsProvider);
      if (!mounted) return;
      showMessage(context, message);
      context.pop();
    } catch (e) {
      setState(() {
        _error = errorMessage(e).replaceAll(' | ', '\n');
        _sending = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final familles = ref.watch(famillesProvider).value ?? const [];
    final missing = _missing;
    void changed(_) => setState(() {});

    Widget section(String title, [String? hint]) => Padding(
      padding: const EdgeInsets.only(top: Space.s5, bottom: Space.s2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          if (hint != null) Text(hint, style: TextStyle(color: t.textMuted, fontSize: 12.5)),
        ],
      ),
    );

    Widget chips(Map<String, String> options, String? selected, ValueChanged<String> onSelect) => Wrap(
      spacing: Space.s2,
      runSpacing: Space.s2,
      children: [for (final e in options.entries) ChoiceChip(label: Text(e.value), selected: selected == e.key, onSelected: (_) => setState(() => onSelect(e.key)))],
    );

    return Scaffold(
      appBar: AppBar(title: const Text('Ouvrir une boutique')),
      bottomNavigationBar: BottomActionBar(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (missing != null)
              Padding(
                padding: const EdgeInsets.only(bottom: Space.s2),
                child: Text(
                  'Il manque $missing.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: t.textMuted, fontSize: 12.5),
                ),
              ),
            FilledButton(onPressed: missing == null && !_sending ? _send : null, child: Text(_sending ? 'Envoi…' : 'Envoyer la demande')),
          ],
        ),
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, Space.s6),
        children: [
          Readable(
            maxWidth: 680,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_error != null) AlertBanner(tone: AlertTone.danger, message: _error!),
                section('Votre boutique'),
                TextField(
                  controller: _nom,
                  maxLength: 100,
                  onChanged: changed,
                  decoration: const InputDecoration(labelText: 'Nom de la boutique'),
                ),
                const SizedBox(height: Space.s2),
                TextField(
                  controller: _description,
                  minLines: 3,
                  maxLines: 6,
                  maxLength: 1000,
                  onChanged: changed,
                  decoration: const InputDecoration(labelText: 'Présentation', helperText: 'Ce que vous vendez, à qui, d’où vous livrez.'),
                ),
                section('Domaines d’activité', 'Un ou plusieurs.'),
                Wrap(
                  spacing: Space.s2,
                  runSpacing: Space.s2,
                  children: [
                    for (final f in familles) FilterChip(label: Text(f.nom), selected: _familles.contains(f.id), onSelected: (on) => setState(() => on ? _familles.add(f.id) : _familles.remove(f.id))),
                  ],
                ),
                section('Vous vendez en tant que'),
                chips(sellerTypes, _sellerType, (v) => _sellerType = v),
                if (_sellerType == 'entreprise') ...[
                  const SizedBox(height: Space.s3),
                  TextField(
                    controller: _rccm,
                    maxLength: 50,
                    onChanged: changed,
                    decoration: const InputDecoration(labelText: 'Numéro RCCM'),
                  ),
                ],
                section('Ancienneté de l’activité'),
                chips(sellerExperiences, _experience, (v) => _experience = v),
                section('Taille du catalogue'),
                chips(catalogSizes, _catalogSize, (v) => _catalogSize = v),
                section('Avez-vous un dépôt ou un magasin ?'),
                chips(const {'yes': 'Oui', 'no': 'Non'}, _physical == null ? null : (_physical! ? 'yes' : 'no'), (v) => _physical = v == 'yes'),
                section('Coordonnées'),
                TextField(
                  controller: _adresse,
                  onChanged: changed,
                  decoration: const InputDecoration(labelText: 'Adresse', helperText: 'Quartier, commune, ville'),
                ),
                const SizedBox(height: Space.s3),
                TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'Email de contact (facultatif)'),
                ),
                const SizedBox(height: Space.s3),
                TextField(
                  controller: _message,
                  minLines: 2,
                  maxLines: 5,
                  maxLength: 1000,
                  decoration: const InputDecoration(labelText: 'Un mot pour l’équipe (facultatif)'),
                ),
                const SizedBox(height: Space.s2),
                CheckboxListTile(
                  value: _terms,
                  onChanged: (v) => setState(() => _terms = v ?? false),
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  title: const Text('J’accepte les conditions des vendeurs', style: TextStyle(fontSize: 14)),
                  subtitle: Text('Commission sur les ventes, délais de confirmation et d’expédition, politique de retour.', style: TextStyle(color: t.textMuted, fontSize: 12.5)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
