import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/tokens.dart';
import '../../../shared/api/api_exception.dart';
import '../../../shared/ui/alert_banner.dart';
import '../../../shared/ui/form_field.dart';
import '../shared/auth_controller.dart';
import '../shared/auth_widgets.dart';
import '../shared/validators.dart';

// Nouveau mot de passe — PUT /auth/reset-password/:token, ouvert depuis le
// lien reçu par email. Le back ferme alors toutes les sessions.
class ResetPasswordPage extends ConsumerStatefulWidget {
  const ResetPasswordPage({super.key, required this.token});

  final String token;

  @override
  ConsumerState<ResetPasswordPage> createState() => _ResetPasswordPageState();
}

class _ResetPasswordPageState extends ConsumerState<ResetPasswordPage> {
  final _form = GlobalKey<FormState>();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _sending = false;
  String? _error;
  bool _done = false;

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(authApiProvider).resetPassword(widget.token, _password.text);
      ref.read(authProvider.notifier).signedOutElsewhere();
      setState(() => _done = true);
    } catch (e) {
      setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => AuthScaffold(
        title: 'Nouveau mot de passe',
        subtitle: 'Choisissez un mot de passe solide.',
        child: _done
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const AlertBanner(tone: AlertTone.success, message: 'Mot de passe réinitialisé. Toutes vos sessions ont été fermées : reconnectez-vous.'),
                  const SizedBox(height: Space.s4),
                  FilledButton(onPressed: () => context.go('/login'), child: const Text('Se connecter')),
                ],
              )
            : Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (_error != null) ...[AlertBanner(message: _error!, tone: AlertTone.danger), const SizedBox(height: Space.s4)],
                    AppTextField(label: 'Nouveau mot de passe', controller: _password, password: true, validator: newPassword, autofillHints: const [AutofillHints.newPassword]),
                    const SizedBox(height: Space.s2),
                    PasswordChecklist(controller: _password, checks: passwordChecks),
                    const SizedBox(height: Space.s4),
                    AppTextField(
                      label: 'Confirmer le mot de passe',
                      controller: _confirm,
                      password: true,
                      validator: confirmation(() => _password.text),
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _submit(),
                    ),
                    const SizedBox(height: Space.s5),
                    SubmitButton(label: 'Enregistrer le mot de passe', loading: _sending, onPressed: _submit),
                  ],
                ),
              ),
      );
}
