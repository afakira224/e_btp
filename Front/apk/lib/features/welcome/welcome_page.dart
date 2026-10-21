import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme/theme.dart';
import '../../app/theme/tokens.dart';
import '../../shared/ui/responsive.dart';
import '../auth/shared/auth_widgets.dart';

// ─────────────────────────────────────────────
//  Bienvenue (écran de lancement de l'app) — après la présentation, sur
//  fond anthracite : créer un compte, se connecter, ou explorer le
//  catalogue sans compte. Un visiteur peut tout parcourir ; le compte
//  n'est demandé qu'au moment d'ajouter au panier ou aux favoris.
// ─────────────────────────────────────────────
class WelcomePage extends StatelessWidget {
  const WelcomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final scale = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.5);
    return AnnotatedRegion(
      value: chromeOverlay(t),
      child: Scaffold(
        backgroundColor: t.chrome,
        body: SafeArea(
          child: Readable(
            maxWidth: 520,
            child: LayoutBuilder(
              builder: (context, box) => SingleChildScrollView(
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: box.maxHeight),
                  child: IntrinsicHeight(
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(
                        context.gutter,
                        Space.s4,
                        context.gutter,
                        Space.s5,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Row(children: [BrandMark(size: 40)]),
                          const SizedBox(height: Space.s5),
                          // L'illustration se réduit si la place manque.
                          Expanded(
                            child: Center(
                              child: ConstrainedBox(
                                constraints: BoxConstraints(
                                  maxHeight: 300 / scale,
                                ),
                                child: AspectRatio(
                                  aspectRatio: 4 / 3,
                                  child: Container(
                                    decoration: BoxDecoration(
                                      color: t.illustration,
                                      borderRadius: BorderRadius.circular(
                                        Radii.lg,
                                      ),
                                    ),
                                    padding: const EdgeInsets.all(Space.s3),
                                    child: Image.asset(
                                      'assets/images/illustrations/bienvenue.png',
                                      fit: BoxFit.contain,
                                      excludeFromSemantics: true,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: Space.s6),
                          Text(
                            'Bienvenue sur BTP Platform',
                            style: TextStyle(
                              color: t.onChrome,
                              fontSize: 28,
                              fontWeight: FontWeight.w800,
                              height: 1.15,
                              letterSpacing: -0.6,
                            ),
                          ),
                          const SizedBox(height: Space.s2),
                          Text(
                            'Commandez vos matériaux auprès des dépôts de Conakry et suivez vos livraisons jusqu’au chantier.',
                            style: TextStyle(
                              color: t.onChromeMuted,
                              fontSize: 16,
                              height: 1.45,
                            ),
                          ),
                          const SizedBox(height: Space.s6),
                          FilledButton(
                            style: FilledButton.styleFrom(
                              backgroundColor: t.onChrome,
                              foregroundColor: t.chrome,
                            ),
                            onPressed: () => context.push('/signup'),
                            child: const Text('Créer un compte'),
                          ),
                          const SizedBox(height: Space.s3),
                          OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: t.onChrome,
                              side: BorderSide(color: t.onChromeMuted),
                            ),
                            onPressed: () => context.push('/login'),
                            child: const Text("J'ai déjà un compte"),
                          ),
                          const SizedBox(height: Space.s2),
                          TextButton(
                            style: TextButton.styleFrom(
                              foregroundColor: t.onChromeMuted,
                            ),
                            onPressed: () => context.go('/accueil'),
                            child: const Text('Explorer sans compte'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
