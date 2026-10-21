import 'package:flutter/material.dart';

import '../../app/theme/tokens.dart';

/// État vide : une grande icône, un titre, une phrase, une action.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.title, required this.text, this.actionLabel, this.onAction, this.icon = Icons.inventory_2_outlined});

  final String title;
  final String text;
  final String? actionLabel;
  final VoidCallback? onAction;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Space.s4, vertical: Space.s6),
      child: Column(
        children: [
          Container(
            width: 88,
            height: 88,
            decoration: BoxDecoration(color: t.surfaceAlt, shape: BoxShape.circle),
            child: Icon(icon, size: 40, color: t.text),
          ),
          const SizedBox(height: Space.s4),
          Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: Space.s2),
          Text(text, textAlign: TextAlign.center, style: TextStyle(color: t.textMuted, fontSize: 15)),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: Space.s5),
            FilledButton(onPressed: onAction, child: Text(actionLabel!)),
          ],
        ],
      ),
    );
  }
}

/// Erreur avec « Réessayer ».
class ErrorRetry extends StatelessWidget {
  const ErrorRetry({super.key, required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Semantics(
      liveRegion: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: Space.s5),
        child: Column(children: [
          Icon(Icons.wifi_off_rounded, size: 36, color: t.textMuted),
          const SizedBox(height: Space.s3),
          Text(message, textAlign: TextAlign.center, style: TextStyle(color: t.text)),
          const SizedBox(height: Space.s3),
          OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh, size: 20), label: const Text('Réessayer')),
        ]),
      ),
    );
  }
}

/// Bloc d'attente à la forme du contenu, qui pulse doucement — immobile si
/// « réduire les animations » est actif.
class Skeleton extends StatefulWidget {
  const Skeleton({super.key, this.height, this.width, this.radius = Radii.md});

  final double? height;
  final double? width;
  final double radius;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.of(context).disableAnimations) {
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: Tween(begin: 1.0, end: 0.55).animate(_c),
        child: Container(
          height: widget.height,
          width: widget.width,
          decoration: BoxDecoration(color: context.tokens.surfaceAlt, borderRadius: BorderRadius.circular(widget.radius)),
        ),
      );
}

/// Petit intitulé de rubrique (feuilles de filtres, formulaires).
class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Text(text, style: Theme.of(context).textTheme.titleSmall?.copyWith(color: context.tokens.text));
}
