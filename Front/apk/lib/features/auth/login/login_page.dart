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
//  Connexion — POST /auth/login.
//  401 : « Identifiants invalides. » (même message que l'email existe ou
//  non). 403 : « Email non vérifié. », distingué d'un mauvais mot de passe.
//  Succès : retour à l'écran qui a demandé la connexion (`from`).
// ─────────────────────────────────────────────
class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key, this.from});

  final String? from;

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _sending = false;
  String? _error;
  bool _needsVerification = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _sending = true;
      _error = null;
      _needsVerification = false;
    });
    try {
      final user = await ref.read(authApiProvider).login(_email.text, _password.text);
      ref.read(authProvider.notifier).setUser(user);
      if (!mounted) return;
      final target = widget.from;
      context.go(target != null && target.startsWith('/') ? target : '/accueil');
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _needsVerification = e.isForbidden;
      });
    } catch (e) {
      setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return AuthScaffold(
      title: 'Connexion',
      subtitle: 'Heureux de vous revoir.',
      child: AutofillGroup(
        child: Form(
          key: _form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_error != null) ...[
                AlertBanner(
                  message: _needsVerification
                      ? '$_error Ouvrez le lien reçu par email pour activer votre compte.'
                      : _error!,
                  tone: _needsVerification ? AlertTone.warning : AlertTone.danger,
                ),
                const SizedBox(height: Space.s4),
              ],
              AppTextField(
                label: 'Email',
                controller: _email,
                validator: requiredEmail,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
              ),
              const SizedBox(height: Space.s4),
              AppTextField(
                label: 'Mot de passe',
                controller: _password,
                password: true,
                validator: (v) => requiredText(v, 'Le mot de passe est requis.'),
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.password],
                onSubmitted: (_) => _submit(),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(onPressed: () => context.push('/forgot-password'), child: const Text('Mot de passe oublié ?')),
              ),
              const SizedBox(height: Space.s2),
              SubmitButton(label: 'Se connecter', loading: _sending, onPressed: _submit),
              const SizedBox(height: Space.s5),
              MockCredentials(
                onUse: (email, password) {
                  _email.text = email;
                  _password.text = password;
                },
              ),
              const SizedBox(height: Space.s5),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('Pas encore de compte ?', style: TextStyle(color: t.textMuted)),
                  TextButton(onPressed: () => context.push('/signup'), child: Text('Créer un compte', style: TextStyle(color: t.text))),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
