import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/navigation.dart';
import '../../../app/theme/tokens.dart';
import '../../../entities/user.dart';
import '../../../shared/api/api_exception.dart';
import '../../../shared/ui/alert_banner.dart';
import '../../../shared/ui/form_field.dart';
import '../../../shared/ui/kit.dart';
import '../../../shared/ui/responsive.dart';
import '../../../shared/utils/format.dart';
import '../../auth/shared/auth_controller.dart';
import '../../auth/shared/validators.dart';

// ─────────────────────────────────────────────
//  Mon profil — PUT /auth/me. L'email n'est pas modifiable : c'est
//  l'identifiant de connexion. « Enregistrer » (barre du haut) reste
//  inactif tant que rien n'a changé.
// ─────────────────────────────────────────────
class ProfilePage extends ConsumerStatefulWidget {
  const ProfilePage({super.key});

  @override
  ConsumerState<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends ConsumerState<ProfilePage> {
  final _form = GlobalKey<FormState>();
  late final User _initial = ref.read(authProvider).user!;
  late final _prenom = TextEditingController(text: _initial.prenom);
  late final _nom = TextEditingController(text: _initial.nom);
  late final _phone = TextEditingController(text: _initial.telephone ?? '');
  bool _sending = false;
  bool _resending = false;
  String? _error;

  @override
  void dispose() {
    _prenom.dispose();
    _nom.dispose();
    _phone.dispose();
    super.dispose();
  }

  bool _dirty(User u) => _prenom.text.trim() != u.prenom || _nom.text.trim() != u.nom || _phone.text.trim() != (u.telephone ?? '');

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final user = await ref.read(authApiProvider).updateProfile(prenom: _prenom.text.trim(), nom: _nom.text.trim(), telephone: _phone.text.trim());
      ref.read(authProvider.notifier).setUser(user);
      if (mounted) showMessage(context, 'Informations enregistrées');
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _resend() async {
    setState(() => _resending = true);
    try {
      final message = await ref.read(authApiProvider).resendVerification();
      if (mounted) showMessage(context, message);
    } catch (e) {
      if (mounted) showMessage(context, errorMessage(e));
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    if (user == null) return const SizedBox.shrink();
    final t = context.tokens;
    final dirty = _dirty(user);
    void changed(String _) => setState(() {});

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mon profil'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: Space.s2),
            child: TextButton(
              onPressed: dirty && !_sending ? _submit : null,
              child: _sending ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Enregistrer'),
            ),
          ),
        ],
      ),
      body: Form(
        key: _form,
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: EdgeInsets.fromLTRB(context.gutter, Space.s4, context.gutter, Space.s6),
          children: [
            Readable(
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Center(
                  child: CircleAvatar(
                    radius: 40,
                    backgroundColor: t.chrome,
                    foregroundImage: user.avatar != null ? NetworkImage(user.avatar!) : null,
                    child: Text(user.initials, style: TextStyle(color: t.onChrome, fontSize: 26, fontWeight: FontWeight.w800)),
                  ),
                ),
                const SizedBox(height: Space.s3),
                Text(user.fullName, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
                Text(user.role.label, textAlign: TextAlign.center, style: TextStyle(color: t.textMuted)),
                const SizedBox(height: Space.s5),
                if (_error != null) ...[AlertBanner(tone: AlertTone.danger, message: _error!), const SizedBox(height: Space.s4)],
                AutofillGroup(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    AppTextField(label: 'Prénom', controller: _prenom, validator: personName, autofillHints: const [AutofillHints.givenName], textCapitalization: TextCapitalization.words, onChanged: changed),
                    const SizedBox(height: Space.s4),
                    AppTextField(label: 'Nom', controller: _nom, validator: personName, autofillHints: const [AutofillHints.familyName], textCapitalization: TextCapitalization.words, onChanged: changed),
                    const SizedBox(height: Space.s4),
                    AppTextField(
                      label: 'Téléphone',
                      controller: _phone,
                      validator: phone,
                      keyboardType: TextInputType.phone,
                      autofillHints: const [AutofillHints.telephoneNumber],
                      helper: 'Les dépôts vous joignent à ce numéro au sujet de vos commandes.',
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => dirty ? _submit() : null,
                      onChanged: changed,
                    ),
                  ]),
                ),
                const SizedBox(height: Space.s6),
                ListGroup(
                  title: 'Identifiant de connexion',
                  footer: "L'adresse e-mail sert à vous connecter ; elle ne peut pas être modifiée.",
                  children: [
                    ListRow(icon: Icons.mail_outline, title: 'E-mail', subtitle: user.email),
                    ListRow(
                      icon: user.isEmailVerified ? Icons.verified_outlined : Icons.mark_email_unread_outlined,
                      title: user.isEmailVerified ? 'E-mail vérifié' : 'E-mail non vérifié',
                      trailing: user.isEmailVerified ? null : TextButton(onPressed: _resending ? null : _resend, child: Text(_resending ? 'Envoi…' : 'Renvoyer')),
                    ),
                    if (user.createdAt != null) ListRow(icon: Icons.event_outlined, title: 'Client depuis', value: formatMonthYear(user.createdAt!)),
                  ],
                ),
              ]),
            ),
          ],
        ),
      ),
    );
  }
}
