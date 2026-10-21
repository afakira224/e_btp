import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/theme/theme.dart';
import '../../app/theme/tokens.dart';
import '../../shared/ui/responsive.dart';
import '../auth/shared/auth_controller.dart';

class _Slide {
  const _Slide(this.image, this.title, this.text);
  final String image;
  final String title;
  final String text;
}

const _slides = [
  _Slide(
    'catalogue',
    'Tout le chantier dans votre poche',
    'Ciment, fer, carrelage, peinture, outillage : les articles des dépôts de Conakry, au même endroit.',
  ),
  _Slide(
    'boutiques',
    'Les dépôts près de chez vous',
    'Comparez les prix des boutiques partenaires et choisissez celle qui vous convient.',
  ),
  _Slide(
    'livraison',
    'Livré sur votre chantier',
    "Faites livrer à l'adresse de votre choix ou retirez votre commande au dépôt.",
  ),
  _Slide(
    'suivi',
    'Suivez chaque commande',
    "De la confirmation par le dépôt jusqu'à la livraison, étape par étape.",
  ),
];

// ─────────────────────────────────────────────
//  Onboarding — présentation en 4 pages, au premier lancement seulement
//  (revoyable depuis Paramètres). Glisser ou « Suivant » ; « Passer » à
//  tout moment. À la fin : l'écran de bienvenue (ou l'accueil si l'on est
//  déjà connecté).
// ─────────────────────────────────────────────
class OnboardingPage extends ConsumerStatefulWidget {
  const OnboardingPage({super.key});

  @override
  ConsumerState<OnboardingPage> createState() => _OnboardingPageState();
}

class _OnboardingPageState extends ConsumerState<OnboardingPage> {
  final _pages = PageController();
  int _index = 0;

  bool get _last => _index == _slides.length - 1;

  void _finish() {
    ref.read(onboardedProvider.notifier).complete();
    context.go(
      ref.read(authProvider).isAuthenticated ? '/accueil' : '/bienvenue',
    );
  }

  void _next() {
    HapticFeedback.selectionClick();
    if (_last) return _finish();
    final reduced = MediaQuery.of(context).disableAnimations;
    _pages.animateToPage(
      _index + 1,
      duration: Duration(milliseconds: reduced ? 1 : 380),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    // Écran clair sans barre d'application : icônes d'état foncées.
    return AnnotatedRegion(
      value: surfaceOverlay(t, Theme.of(context).brightness),
      child: Scaffold(
        body: SafeArea(
          child: Readable(
            maxWidth: 560,
            child: Column(
              children: [
                // Barre du haut : étape et « Passer ».
                Padding(
                  padding: EdgeInsets.fromLTRB(
                    context.gutter,
                    Space.s2,
                    Space.s2,
                    0,
                  ),
                  child: Row(
                    children: [
                      Text(
                        '${_index + 1}/${_slides.length}',
                        style: TextStyle(
                          color: t.textMuted,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const Spacer(),
                      AnimatedOpacity(
                        opacity: _last ? 0 : 1,
                        duration: const Duration(milliseconds: 200),
                        child: TextButton(
                          onPressed: _last ? null : _finish,
                          child: const Text('Passer'),
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: PageView.builder(
                    controller: _pages,
                    itemCount: _slides.length,
                    onPageChanged: (i) => setState(() => _index = i),
                    itemBuilder: (context, i) => _SlideView(
                      slide: _slides[i],
                      index: i,
                      count: _slides.length,
                    ),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.fromLTRB(
                    context.gutter,
                    Space.s2,
                    context.gutter,
                    Space.s5,
                  ),
                  child: Column(
                    children: [
                      ExcludeSemantics(
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            for (var i = 0; i < _slides.length; i++)
                              AnimatedContainer(
                                duration: const Duration(milliseconds: 220),
                                margin: const EdgeInsets.symmetric(
                                  horizontal: 3,
                                ),
                                width: i == _index ? 24 : 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  color: i == _index ? t.primary : t.border,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: Space.s5),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: _next,
                          child: AnimatedSwitcher(
                            duration: const Duration(milliseconds: 180),
                            child: Text(
                              _last ? 'Commencer' : 'Suivant',
                              key: ValueKey(_last),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SlideView extends StatelessWidget {
  const _SlideView({
    required this.slide,
    required this.index,
    required this.count,
  });

  final _Slide slide;
  final int index;
  final int count;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Semantics(
      label: 'Page ${index + 1} sur $count',
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: context.gutter),
        // Illustration et texte groupés au centre de l'écran.
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // L'illustration cède la place au texte sur les petits écrans.
            Flexible(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 360),
                child: AspectRatio(
                  aspectRatio: 4 / 3,
                  child: Container(
                    decoration: BoxDecoration(
                      color: t.illustration,
                      borderRadius: BorderRadius.circular(Radii.lg),
                    ),
                    padding: const EdgeInsets.all(Space.s3),
                    child: Image.asset(
                      'assets/images/illustrations/${slide.image}.png',
                      fit: BoxFit.contain,
                      excludeFromSemantics: true,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: Space.s6),
            Text(
              slide.title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: Space.s3),
            Text(
              slide.text,
              textAlign: TextAlign.center,
              style: TextStyle(color: t.textMuted, fontSize: 16, height: 1.45),
            ),
            const SizedBox(height: Space.s3),
          ],
        ),
      ),
    );
  }
}
