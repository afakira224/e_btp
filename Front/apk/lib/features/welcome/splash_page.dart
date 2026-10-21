import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/theme/theme.dart';
import '../../app/theme/tokens.dart';
import '../auth/shared/auth_controller.dart';
import '../auth/shared/auth_widgets.dart';

// ─────────────────────────────────────────────
//  Splash — premier écran Flutter. Il reprend l'écran de lancement natif
//  (fond anthracite, logo au centre) pour que le passage soit invisible,
//  puis anime le logo pendant que la session est vérifiée (/auth/me).
//  Ensuite : la présentation au premier lancement, sinon l'écran demandé
//  (`from`) ou l'accueil.
// ─────────────────────────────────────────────
class SplashPage extends ConsumerStatefulWidget {
  const SplashPage({super.key, this.from});

  final String? from;

  @override
  ConsumerState<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends ConsumerState<SplashPage>
    with SingleTickerProviderStateMixin {
  late final AnimationController _intro = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );
  late final Animation<double> _logo = CurvedAnimation(
    parent: _intro,
    curve: const Interval(0, 0.6, curve: Curves.easeOutBack),
  );
  late final Animation<double> _text = CurvedAnimation(
    parent: _intro,
    curve: const Interval(0.35, 1, curve: Curves.easeOut),
  );
  Timer? _minimum;
  bool _ready = false;
  bool _left = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_minimum != null) return;
    // Durée minimale pour lire la marque — courte si « réduire les animations ».
    final reduced = MediaQuery.of(context).disableAnimations;
    if (reduced) {
      _intro.value = 1;
    } else {
      _intro.forward();
    }
    _minimum = Timer(Duration(milliseconds: reduced ? 300 : 1400), () {
      _ready = true;
      _leave();
    });
  }

  void _leave() {
    if (!_ready || _left || !mounted) return;
    final auth = ref.read(authProvider);
    if (auth.status == AuthStatus.pending) return;
    _left = true;
    final from = widget.from;
    if (!ref.read(onboardedProvider)) {
      context.go('/onboarding');
    } else {
      context.go(
        from != null && from.startsWith('/') && from != '/splash'
            ? from
            : '/accueil',
      );
    }
  }

  @override
  void dispose() {
    _minimum?.cancel();
    _intro.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    // La session répond après la durée minimale : on part à ce moment-là.
    ref.listen(authProvider, (_, _) => _leave());
    return AnnotatedRegion(
      value: chromeOverlay(t),
      child: Scaffold(
        backgroundColor: t.chrome,
        body: SafeArea(
          // Pleine largeur : le logo reste au centre, comme sur l'écran natif.
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(flex: 5),
              ScaleTransition(
                scale: Tween(begin: 0.86, end: 1.0).animate(_logo),
                child: const Center(child: BrandMark(size: 112)),
              ),
              const SizedBox(height: Space.s5),
              FadeTransition(
                opacity: _text,
                child: SlideTransition(
                  position: Tween(
                    begin: const Offset(0, 0.3),
                    end: Offset.zero,
                  ).animate(_text),
                  child: Column(
                    children: [
                      Text(
                        'BTP Platform',
                        style: TextStyle(
                          color: t.onChrome,
                          fontSize: 26,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.6,
                        ),
                      ),
                      const SizedBox(height: Space.s1),
                      Text(
                        'Les matériaux de construction, livrés',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: t.onChromeMuted, fontSize: 15),
                      ),
                    ],
                  ),
                ),
              ),
              const Spacer(flex: 4),
              FadeTransition(
                opacity: _text,
                child: Column(
                  children: [
                    SizedBox(
                      width: 120,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(2),
                        child: LinearProgressIndicator(
                          minHeight: 3,
                          color: t.onChrome,
                          backgroundColor: t.chromeRaised,
                        ),
                      ),
                    ),
                    const SizedBox(height: Space.s4),
                    Text(
                      'Conakry · Guinée',
                      style: monoStyle(
                        context,
                        size: 11,
                        color: t.onChromeMuted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: Space.s6),
            ],
          ),
        ),
      ),
    );
  }
}
