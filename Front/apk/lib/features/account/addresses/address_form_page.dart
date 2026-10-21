import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/tokens.dart';
import '../../../entities/address.dart';
import '../../../shared/api/api_exception.dart';
import '../../../shared/ui/alert_banner.dart';
import '../../../shared/ui/form_field.dart';
import '../../../shared/ui/kit.dart';
import '../../../shared/ui/responsive.dart';
import '../../../shared/ui/states.dart';
import '../../auth/shared/auth_controller.dart';
import '../../auth/shared/validators.dart';
import '../shared/account_api.dart';

// ─────────────────────────────────────────────
//  Ajout et modification d'une adresse — écrans à part entière :
//    /compte/adresses/nouvelle
//    /compte/adresses/:addressId/modifier
//  Le carnet est relu à l'arrivée : il dit si c'est la première adresse
//  (d'office par défaut) et, en modification, quelle adresse éditer.
//  Bornes reprises de Back/src/shared/forms/address.form.ts.
// ─────────────────────────────────────────────
class AddressFormPage extends ConsumerWidget {
  const AddressFormPage({super.key, this.addressId});

  final String? addressId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isEdit = addressId != null;
    final book = ref.watch(addressesProvider);
    final current = isEdit ? book.value?.where((a) => a.id == addressId).firstOrNull : null;
    final title = isEdit ? (current != null ? 'Modifier « ${current.displayLabel} »' : "Modifier l'adresse") : 'Nouvelle adresse';

    return Scaffold(
      appBar: AppBar(title: Text(title, overflow: TextOverflow.ellipsis)),
      body: book.when(
        loading: () => Padding(padding: EdgeInsets.all(context.gutter), child: const Skeleton(height: 420)),
        error: (e, _) => Padding(padding: EdgeInsets.all(context.gutter), child: ErrorRetry(message: errorMessage(e), onRetry: () => ref.invalidate(addressesProvider))),
        data: (list) {
          // Lien périmé : adresse supprimée entre-temps.
          if (isEdit && current == null) {
            return Padding(padding: EdgeInsets.all(context.gutter), child: const AlertBanner(tone: AlertTone.danger, message: "Cette adresse n'existe pas ou a été supprimée."));
          }
          final user = ref.read(authProvider).user;
          return _AddressForm(
            key: ValueKey(addressId ?? 'nouvelle'),
            initial: current,
            defaultRecipient: user?.fullName ?? '',
            defaultPhone: isEdit ? null : user?.telephone,
            // Première adresse : forcément par défaut. En modification, l'adresse
            // par défaut le reste — on en change en choisissant une autre.
            forceDefault: isEdit ? current!.isDefault : list.isEmpty,
          );
        },
      ),
    );
  }
}

class _AddressForm extends ConsumerStatefulWidget {
  const _AddressForm({super.key, this.initial, required this.defaultRecipient, this.defaultPhone, required this.forceDefault});

  final Address? initial;
  final String defaultRecipient;
  final String? defaultPhone;
  final bool forceDefault;

  @override
  ConsumerState<_AddressForm> createState() => _AddressFormState();
}

class _AddressFormState extends ConsumerState<_AddressForm> {
  static const _suggestions = [('Maison', Icons.home_outlined), ('Bureau', Icons.business_outlined), ('Chantier', Icons.construction_outlined)];

  final _form = GlobalKey<FormState>();
  late final _label = TextEditingController(text: widget.initial?.label ?? '');
  late final _recipient = TextEditingController(text: widget.initial?.destinataire ?? widget.defaultRecipient);
  late final _phone = TextEditingController(text: widget.initial?.telephone ?? widget.defaultPhone ?? '');
  late final _street = TextEditingController(text: widget.initial?.adresse ?? '');
  late final _commune = TextEditingController(text: widget.initial?.commune ?? '');
  late final _city = TextEditingController(text: widget.initial?.ville ?? 'Conakry');
  late final _country = TextEditingController(text: widget.initial?.pays ?? 'Guinée');
  late bool _isDefault = widget.initial?.isDefault ?? widget.forceDefault;
  bool _sending = false;
  String? _error;

  bool get _isEdit => widget.initial != null;

  @override
  void dispose() {
    for (final c in [_label, _recipient, _phone, _street, _commune, _city, _country]) {
      c.dispose();
    }
    super.dispose();
  }

  /// Champs facultatifs vides : omis à la création, envoyés vides à la
  /// modification — le back ignore un champ absent, l'omettre empêcherait
  /// d'effacer un nom d'adresse.
  String? _optional(TextEditingController c) {
    final v = c.text.trim();
    return v.isNotEmpty ? v : (_isEdit ? '' : null);
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    final input = AddressInput(
      label: _optional(_label),
      destinataire: _optional(_recipient),
      telephone: _phone.text.trim(),
      adresse: _street.text.trim(),
      commune: _optional(_commune),
      ville: _city.text.trim(),
      pays: _country.text.trim().isEmpty ? 'Guinée' : _country.text.trim(),
      isDefault: _isDefault,
    );
    try {
      final api = ref.read(accountApiProvider);
      if (_isEdit) {
        await api.updateAddress(widget.initial!.id, input);
      } else {
        await api.createAddress(ref.read(currentUserIdProvider), input);
      }
      if (mounted) context.pop(_isEdit ? 'Adresse mise à jour.' : 'Adresse ajoutée.');
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final wide = context.isExpanded;
    Widget pair(Widget a, Widget b) => wide
        ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: a), const SizedBox(width: Space.s4), Expanded(child: b)])
        : Column(children: [a, const SizedBox(height: Space.s4), b]);

    return Form(
      key: _form,
      child: Column(children: [
        Expanded(
          child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, Space.s5),
            children: [
              Readable(
                child: AutofillGroup(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    if (_error != null) ...[AlertBanner(tone: AlertTone.danger, message: _error!), const SizedBox(height: Space.s4)],
                    const Eyebrow("Nom de l'adresse"),
                    const SizedBox(height: Space.s2),
                    Wrap(spacing: Space.s2, runSpacing: Space.s2, children: [
                      for (final (s, icon) in _suggestions)
                        ChoiceChip(
                          avatar: Icon(icon, size: 18, color: _label.text == s ? t.primaryText : t.text),
                          label: Text(s),
                          selected: _label.text == s,
                          side: BorderSide(color: _label.text == s ? t.primary : t.border),
                          labelStyle: TextStyle(color: _label.text == s ? t.primaryText : t.text, fontWeight: FontWeight.w600),
                          onSelected: (_) => setState(() => _label.text = _label.text == s ? '' : s),
                        ),
                    ]),
                    const SizedBox(height: Space.s3),
                    AppTextField(
                      label: 'Ou un autre nom',
                      optional: true,
                      controller: _label,
                      hint: 'Dépôt, chantier de Kipé…',
                      validator: (v) => maxLength(v, 50),
                      textCapitalization: TextCapitalization.sentences,
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: Space.s5),
                    const Eyebrow('Destinataire'),
                    const SizedBox(height: Space.s3),
                    pair(
                      AppTextField(
                        label: 'Nom du destinataire',
                        optional: true,
                        controller: _recipient,
                        autofillHints: const [AutofillHints.name],
                        textCapitalization: TextCapitalization.words,
                        validator: (v) => maxLength(v, 100),
                      ),
                      AppTextField(
                        label: 'Téléphone',
                        controller: _phone,
                        helper: 'Le livreur appellera ce numéro.',
                        keyboardType: TextInputType.phone,
                        autofillHints: const [AutofillHints.telephoneNumber],
                        validator: phone,
                      ),
                    ),
                    const SizedBox(height: Space.s5),
                    const Eyebrow('Adresse'),
                    const SizedBox(height: Space.s3),
                    AppTextField(
                      label: 'Quartier, rue, repère',
                      controller: _street,
                      hint: 'Face à la mosquée, 2e rue à gauche…',
                      autofillHints: const [AutofillHints.fullStreetAddress],
                      textCapitalization: TextCapitalization.sentences,
                      validator: (v) => requiredText(v, "L'adresse est requise.") ?? maxLength(v, 255),
                    ),
                    const SizedBox(height: Space.s4),
                    pair(
                      AppTextField(label: 'Commune', optional: true, controller: _commune, hint: 'Ratoma, Matoto…', textCapitalization: TextCapitalization.words, validator: (v) => maxLength(v, 100)),
                      AppTextField(
                        label: 'Ville',
                        controller: _city,
                        autofillHints: const [AutofillHints.addressCity],
                        textCapitalization: TextCapitalization.words,
                        validator: (v) => requiredText(v, 'La ville est requise.') ?? maxLength(v, 100),
                      ),
                    ),
                    const SizedBox(height: Space.s4),
                    AppTextField(
                      label: 'Pays',
                      controller: _country,
                      autofillHints: const [AutofillHints.countryName],
                      textInputAction: TextInputAction.done,
                      validator: (v) => maxLength(v, 100),
                    ),
                    const SizedBox(height: Space.s4),
                    AppCard(
                      padding: EdgeInsets.zero,
                      child: SwitchListTile(
                        value: _isDefault,
                        onChanged: widget.forceDefault ? null : (v) => setState(() => _isDefault = v),
                        title: const Text('Adresse par défaut'),
                        subtitle: Text(
                          widget.forceDefault
                              ? (_isEdit ? 'Pour en changer, choisissez une autre adresse par défaut.' : 'Votre première adresse est votre adresse par défaut.')
                              : 'Proposée en premier à la commande.',
                        ),
                      ),
                    ),
                  ]),
                ),
              ),
            ],
          ),
        ),
        BottomActionBar(
          child: SubmitButton(label: _sending ? 'Enregistrement…' : (_isEdit ? 'Enregistrer' : "Ajouter l'adresse"), loading: _sending, onPressed: _submit),
        ),
      ]),
    );
  }
}
