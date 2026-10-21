import 'package:flutter/material.dart';

import '../../app/theme/tokens.dart';

enum BadgeTone { neutral, accent, solid, muted }

/// Badge de la charte, rayon 6. `accent` est réservé aux remises.
class BtpBadge extends StatelessWidget {
  const BtpBadge(this.label, {super.key, this.tone = BadgeTone.neutral});

  final String label;
  final BadgeTone tone;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final (fg, bg) = switch (tone) {
      BadgeTone.accent => (t.accentText, t.accent),
      BadgeTone.solid => (t.onChrome, t.chrome),
      BadgeTone.neutral => (t.text, t.surface),
      BadgeTone.muted => (t.text, t.surfaceAlt),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(Radii.sm)),
      child: Text(label, style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w700, height: 1.2)),
    );
  }
}
