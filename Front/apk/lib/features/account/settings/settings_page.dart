import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/navigation.dart';
import '../../../app/providers.dart';
import '../../../app/theme/tokens.dart';
import '../../../shared/api/api_exception.dart';
import '../../../shared/config/env.dart';
import '../../../shared/ui/alert_banner.dart';
import '../../../shared/ui/form_field.dart';
import '../../../shared/ui/kit.dart';
import '../../../shared/ui/responsive.dart';
import '../../auth/shared/auth_controller.dart';
import '../../auth/shared/validators.dart';

const _themeLabels = {ThemeMode.light: 'Clair', ThemeMode.dark: 'Sombre', ThemeMode.system: 'Comme le système'};

// ─────────────────────────────────────────────
//  Paramètres — sécurité, apparence, à propos, en listes groupées.
// ─────────────────────────────────────────────
class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  Future<void> _logoutAll(BuildContext context, WidgetRef ref) async {
    final ok = await confirmAction(
      context,
      title: 'Déconnecter tous les appareils ?',
      message: 'Toutes les sessions seront fermées, y compris celle-ci.',
      confirmLabel: 'Tout déconnecter',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    try {
      await ref.read(authApiProvider).logoutAll();
      ref.read(authProvider.notifier).signedOutElsewhere();
      if (context.mounted) context.go('/login');
    } catch (e) {
      if (context.mounted) showMessage(context, errorMessage(e));
    }
  }

  Future<void> _chooseTheme(BuildContext context, WidgetRef ref, ThemeMode current) async {
    final choice = await showChoiceSheet<ThemeMode>(
      context,
      title: 'Apparence',
      selected: current,
      options: [for (final m in [ThemeMode.light, ThemeMode.dark, ThemeMode.system]) (m, _themeLabels[m]!)],
      icons: const [Icons.light_mode_outlined, Icons.dark_mode_outlined, Icons.brightness_auto_outlined],
    );
    if (choice != null) ref.read(themeModeProvider.notifier).set(choice);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tokens;
    final mode = ref.watch(themeModeProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Paramètres')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(context.gutter, Space.s3, context.gutter, Space.s6),
        children: [
          Readable(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              ListGroup(title: 'Sécurité', children: [
                ListRow(icon: Icons.lock_outline, title: 'Changer le mot de passe', subtitle: 'Vos autres appareils seront déconnectés', onTap: () => context.push('/compte/parametres/mot-de-passe')),
                ListRow(icon: Icons.devices_outlined, title: 'Déconnecter tous les appareils', destructive: true, onTap: () => _logoutAll(context, ref)),
              ]),
              const SizedBox(height: Space.s5),
              ListGroup(
                title: 'Apparence',
                footer: 'Mémorisé sur cet appareil.',
                children: [ListRow(icon: Icons.contrast, title: 'Thème', value: _themeLabels[mode], onTap: () => _chooseTheme(context, ref, mode))],
              ),
              const SizedBox(height: Space.s5),
              ListGroup(title: 'À propos', children: [
                ListRow(icon: Icons.slideshow_outlined, title: 'Revoir la présentation', onTap: () => context.go('/onboarding')),
                ListRow(icon: Icons.info_outline, title: 'Version', value: Env.appVersion),
                if (Env.useMock) const ListRow(icon: Icons.science_outlined, title: 'Données', value: 'Simulées'),
              ]),
              const SizedBox(height: Space.s6),
              Center(child: Text('BTP Platform', style: TextStyle(color: t.textMuted, fontSize: 12))),
            ]),
          ),
        ],
      ),
    );
  }
}

/// Changement de mot de passe, sur son propre écran.
class ChangePasswordPage extends ConsumerStatefulWidget {
  const ChangePasswordPage({super.key});

  @override
  ConsumerState<ChangePasswordPage> createState() => _ChangePasswordPageState();
}

class _ChangePasswordPageState extends ConsumerState<ChangePasswordPage> {
  final _form = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(authApiProvider).changePassword(_current.text, _next.text);
      if (!mounted) return;
      showMessage(context, 'Mot de passe modifié. Vos autres appareils ont été déconnectés.');
      context.pop();
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Scaffold(
      appBar: AppBar(title: const Text('Mot de passe')),
      body: Form(
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
                      Text('Vous restez connecté sur cet appareil ; les autres sessions seront fermées.', style: TextStyle(color: t.textMuted)),
                      const SizedBox(height: Space.s5),
                      if (_error != null) ...[AlertBanner(tone: AlertTone.danger, message: _error!), const SizedBox(height: Space.s4)],
                      AppTextField(
                        label: 'Mot de passe actuel',
                        controller: _current,
                        password: true,
                        autofillHints: const [AutofillHints.password],
                        validator: (v) => requiredText(v, 'Le mot de passe actuel est requis.'),
                      ),
                      const SizedBox(height: Space.s4),
                      AppTextField(label: 'Nouveau mot de passe', controller: _next, password: true, autofillHints: const [AutofillHints.newPassword], validator: newPassword),
                      const SizedBox(height: Space.s2),
                      PasswordChecklist(controller: _next, checks: passwordChecks),
                      const SizedBox(height: Space.s4),
                      AppTextField(
                        label: 'Confirmer le nouveau mot de passe',
                        controller: _confirm,
                        password: true,
                        textInputAction: TextInputAction.done,
                        validator: confirmation(() => _next.text),
                        onSubmitted: (_) => _submit(),
                      ),
                    ]),
                  ),
                ),
              ],
            ),
          ),
          BottomActionBar(child: SubmitButton(label: _sending ? 'Modification…' : 'Changer le mot de passe', loading: _sending, onPressed: _submit)),
        ]),
      ),
    );
  }
}
