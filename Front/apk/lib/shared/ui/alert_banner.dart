import 'package:flutter/material.dart';

import '../../app/theme/tokens.dart';

enum AlertTone { success, info, warning, danger }

/// Bandeau d'information. Une erreur est annoncée tout de suite aux
/// lecteurs d'écran ; le reste poliment.
class AlertBanner extends StatelessWidget {
  const AlertBanner({super.key, required this.message, this.tone = AlertTone.info, this.action});

  final String message;
  final AlertTone tone;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final (fg, bg, icon) = switch (tone) {
      AlertTone.success => (t.success, t.successSurface, Icons.check_circle_outline),
      AlertTone.info => (t.text, t.surfaceAlt, Icons.info_outline),
      AlertTone.warning => (t.warning, t.warningSurface, Icons.warning_amber_rounded),
      AlertTone.danger => (t.danger, t.dangerSurface, Icons.error_outline),
    };
    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(Space.s3),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(Radii.sm),
          border: Border.all(color: fg.withValues(alpha: 0.35)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20, color: fg),
            const SizedBox(width: Space.s3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(message, style: TextStyle(color: tone == AlertTone.info ? t.text : fg, fontSize: 14)),
                  if (action != null) ...[const SizedBox(height: Space.s2), action!],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
