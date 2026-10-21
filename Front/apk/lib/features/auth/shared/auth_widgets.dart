import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme/theme.dart';
import '../../../app/theme/tokens.dart';
import '../../../shared/api/mock/mock_db.dart';
import '../../../shared/config/env.dart';
import '../../../shared/ui/responsive.dart';

/// Logo BTP : le chariot dans son carré arrondi (assets/images/brand).
/// Sur l'en-tête anthracite, la variante claire ; ailleurs, la foncée.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 44, this.onChrome = true});

  final double size;
  final bool onChrome;

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'BTP Platform',
        image: true,
        child: Image.asset(
          onChrome ? 'assets/images/brand/logo_light.png' : 'assets/images/brand/logo.png',
          width: size,
          height: size,
          filterQuality: FilterQuality.medium,
        ),
      );
}

/// Cadre des écrans d'authentification, plein écran hors onglets : en-tête
/// anthracite avec la marque, formulaire sur une feuille claire arrondie.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({super.key, required this.title, required this.subtitle, required this.child});

  final String title;
  final String subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return AnnotatedRegion(
      value: chromeOverlay(t),
      child: Scaffold(
        backgroundColor: t.chrome,
        body: SafeArea(
          bottom: false,
          child: LayoutBuilder(
            builder: (context, box) => SingleChildScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: box.maxHeight),
                child: IntrinsicHeight(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: IconButton(
                        tooltip: 'Fermer',
                        color: t.onChrome,
                        icon: const Icon(Icons.close),
                        onPressed: () => context.canPop() ? context.pop() : context.go('/accueil'),
                      ),
                    ),
                    Padding(
                      padding: EdgeInsets.fromLTRB(context.gutter, Space.s2, context.gutter, Space.s6),
                      child: Readable(
                        maxWidth: 480,
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const BrandMark(),
                          const SizedBox(height: Space.s5),
                          Text(title, style: TextStyle(color: t.onChrome, fontSize: 28, fontWeight: FontWeight.w700, letterSpacing: -0.6)),
                          const SizedBox(height: Space.s1),
                          Text(subtitle, style: TextStyle(color: t.onChromeMuted, fontSize: 15)),
                        ]),
                      ),
                    ),
                    Expanded(
                      child: Container(
                        decoration: BoxDecoration(color: t.background, borderRadius: const BorderRadius.vertical(top: Radius.circular(Radii.lg))),
                        padding: EdgeInsets.fromLTRB(context.gutter, Space.s5, context.gutter, Space.s6 + MediaQuery.paddingOf(context).bottom),
                        child: Readable(maxWidth: 480, child: child),
                      ),
                    ),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Mode simulé uniquement : le compte de démonstration, et un bouton qui
/// remplit le formulaire avec.
class MockCredentials extends StatelessWidget {
  const MockCredentials({super.key, this.onUse});

  final void Function(String email, String password)? onUse;

  @override
  Widget build(BuildContext context) {
    if (!Env.useMock) return const SizedBox.shrink();
    final t = context.tokens;
    return Container(
      padding: const EdgeInsets.all(Space.s3),
      decoration: BoxDecoration(border: Border.all(color: t.border), borderRadius: BorderRadius.circular(Radii.md), color: t.surface),
      child: Row(children: [
        Icon(Icons.science_outlined, color: t.textMuted),
        const SizedBox(width: Space.s3),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Mode simulé', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            SelectableText(demoEmail, style: TextStyle(color: t.textMuted, fontSize: 12)),
          ]),
        ),
        if (onUse != null) TextButton(onPressed: () => onUse!(demoEmail, demoPassword), child: const Text('Compte démo')),
      ]),
    );
  }
}

/// Mode simulé uniquement : le lien que le vrai back enverrait par email.
class MockLink extends StatelessWidget {
  const MockLink({super.key, required this.link, required this.label});

  final String? link;
  final String label;

  @override
  Widget build(BuildContext context) {
    if (!Env.useMock || link == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: Space.s4),
      child: OutlinedButton.icon(
        onPressed: () => context.go(link!),
        icon: const Icon(Icons.mark_email_read_outlined),
        label: Text('$label (mode simulé)'),
      ),
    );
  }
}
