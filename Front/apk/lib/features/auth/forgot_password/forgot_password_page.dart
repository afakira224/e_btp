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

// ─────────────────────────────────────────────
//  Mot de passe oublié — POST /auth/forgot-password.
//  Le back répond 404 sur un email inconnu, ce qui permettrait d'énumérer
//  les comptes : on affiche le même écran de confirmation dans tous les cas.
// ─────────────────────────────────────────────
class ForgotPasswordPage extends ConsumerStatefulWidget {
  const ForgotPasswordPage({super.key});

  @override
  ConsumerState<ForgotPasswordPage> createState() => _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends ConsumerState<ForgotPasswordPage> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  bool _sending = false;
  String? _error;
  String? _sentTo;
  String? _resetLink;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    final email = _email.text.trim();
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final link = await ref.read(authApiProvider).forgotPassword(email);
      setState(() {
        _sentTo = email;
        _resetLink = link;
      });
    } on ApiException catch (e) {
      setState(() => e.isNotFound ? _sentTo = email : _error = e.message);
    } catch (e) {
      setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => AuthScaffold(
        title: 'Mot de passe oublié',
        subtitle: "Récupérez l'accès à votre compte.",
        child: _sentTo != null
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AlertBanner(
                    tone: AlertTone.success,
                    message: 'Si un compte existe pour $_sentTo, un lien de réinitialisation vient de lui être envoyé. Il est valable une heure.',
                  ),
                  MockLink(link: _resetLink, label: 'Ouvrir le lien de réinitialisation'),
                  const SizedBox(height: Space.s4),
                  OutlinedButton(onPressed: () => context.go('/login'), child: const Text('Retour à la connexion')),
                ],
              )
            : Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (_error != null) ...[AlertBanner(message: _error!, tone: AlertTone.danger), const SizedBox(height: Space.s4)],
                    AppTextField(
                      label: 'Email',
                      controller: _email,
                      validator: requiredEmail,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _submit(),
                    ),
                    const SizedBox(height: Space.s5),
                    SubmitButton(label: 'Recevoir le lien', loading: _sending, onPressed: _submit),
                  ],
                ),
              ),
      );
}
