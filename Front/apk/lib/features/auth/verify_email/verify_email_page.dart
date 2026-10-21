import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/tokens.dart';
import '../../../shared/api/api_exception.dart';
import '../../../shared/ui/alert_banner.dart';
import '../shared/auth_controller.dart';
import '../shared/auth_widgets.dart';

// Vérification de l'email — GET /auth/verify-email/:token, ouvert depuis le
// lien reçu par email ; fonctionne connecté ou non.
class VerifyEmailPage extends ConsumerStatefulWidget {
  const VerifyEmailPage({super.key, required this.token});

  final String token;

  @override
  ConsumerState<VerifyEmailPage> createState() => _VerifyEmailPageState();
}

class _VerifyEmailPageState extends ConsumerState<VerifyEmailPage> {
  late final Future<String> _result = _verify();

  Future<String> _verify() async {
    final message = await ref.read(authApiProvider).verifyEmail(widget.token);
    // Un utilisateur connecté voit son statut changer tout de suite.
    if (ref.read(authProvider).isAuthenticated) await ref.read(authProvider.notifier).refresh();
    return message;
  }

  @override
  Widget build(BuildContext context) => AuthScaffold(
        title: "Vérification de l'email",
        subtitle: 'Activation de votre compte.',
        child: FutureBuilder<String>(
          future: _result,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Padding(padding: EdgeInsets.all(Space.s5), child: Center(child: CircularProgressIndicator()));
            }
            final ok = !snap.hasError;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AlertBanner(
                  tone: ok ? AlertTone.success : AlertTone.danger,
                  message: ok ? 'Votre adresse est vérifiée : vous pouvez vous connecter.' : 'Ce lien est invalide ou a déjà servi. ${errorMessage(snap.error!)}',
                ),
                const SizedBox(height: Space.s4),
                FilledButton(
                  onPressed: () => context.go(ref.read(authProvider).isAuthenticated ? '/compte' : '/login'),
                  child: Text(ref.read(authProvider).isAuthenticated ? 'Aller à mon compte' : 'Se connecter'),
                ),
              ],
            );
          },
        ),
      );
}
