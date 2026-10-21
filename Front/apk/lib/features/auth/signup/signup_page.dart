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
//  Inscription — POST /auth/register.
//  Aucun choix de rôle : l'inscription publique crée un compte client.
//  Succès : écran « Vérifiez votre email », sans connexion automatique.
// ─────────────────────────────────────────────
class SignupPage extends ConsumerStatefulWidget {
  const SignupPage({super.key});

  @override
  ConsumerState<SignupPage> createState() => _SignupPageState();
}

class _SignupPageState extends ConsumerState<SignupPage> {
  final _form = GlobalKey<FormState>();
  final _prenom = TextEditingController();
  final _nom = TextEditingController();
  final _email = TextEditingController();
  final _tel = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _sending = false;
  String? _error;
  String? _sentTo;
  String? _verifyLink;

  @override
  void dispose() {
    for (final c in [_prenom, _nom, _email, _tel, _password, _confirm]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final link = await ref.read(authApiProvider).register(
            prenom: _prenom.text,
            nom: _nom.text,
            email: _email.text,
            telephone: _tel.text,
            password: _password.text,
          );
      setState(() {
        _sentTo = _email.text.trim();
        _verifyLink = link;
      });
    } catch (e) {
      setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_sentTo != null) {
      return AuthScaffold(
        title: 'Vérifiez votre email',
        subtitle: "Dernière étape avant l'accès.",
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AlertBanner(
              tone: AlertTone.success,
              message: 'Compte créé. Un lien de vérification a été envoyé à $_sentTo. Ouvrez-le pour activer votre compte, puis connectez-vous.',
            ),
            MockLink(link: _verifyLink, label: 'Ouvrir le lien de vérification'),
            const SizedBox(height: Space.s4),
            FilledButton(onPressed: () => context.go('/login'), child: const Text('Aller à la connexion')),
          ],
        ),
      );
    }

    return AuthScaffold(
      title: 'Créer un compte',
      subtitle: 'Ouvrez votre compte client en quelques informations.',
      child: AutofillGroup(
        child: Form(
          key: _form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_error != null) ...[AlertBanner(message: _error!, tone: AlertTone.danger), const SizedBox(height: Space.s4)],
              AppTextField(label: 'Prénom', controller: _prenom, validator: personName, autofillHints: const [AutofillHints.givenName], textCapitalization: TextCapitalization.words),
              const SizedBox(height: Space.s4),
              AppTextField(label: 'Nom', controller: _nom, validator: personName, autofillHints: const [AutofillHints.familyName], textCapitalization: TextCapitalization.words),
              const SizedBox(height: Space.s4),
              AppTextField(label: 'Email', controller: _email, validator: requiredEmail, keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.email]),
              const SizedBox(height: Space.s4),
              AppTextField(label: 'Téléphone', controller: _tel, validator: phone, keyboardType: TextInputType.phone, autofillHints: const [AutofillHints.telephoneNumber]),
              const SizedBox(height: Space.s4),
              AppTextField(label: 'Mot de passe', controller: _password, password: true, validator: newPassword, autofillHints: const [AutofillHints.newPassword]),
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
              SubmitButton(label: 'Créer mon compte', loading: _sending, onPressed: _submit),
              const SizedBox(height: Space.s4),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('Déjà un compte ?', style: TextStyle(color: context.tokens.textMuted)),
                  TextButton(onPressed: () => context.go('/login'), child: Text('Se connecter', style: TextStyle(color: context.tokens.text))),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
