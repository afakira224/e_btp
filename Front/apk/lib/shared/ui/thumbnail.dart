import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../app/theme/tokens.dart';

// ─────────────────────────────────────────────
//  Vignette produit.
//
//  Sans image, un motif géométrique déterminé par l'identifiant
//  (empilement, cercles, trame), dans la palette — comme `Thumbnail` sur le
//  web. Le même produit garde toujours le même motif.
// ─────────────────────────────────────────────
class ProductThumbnail extends StatelessWidget {
  const ProductThumbnail({super.key, this.url, required this.seed, this.aspectRatio = 1, this.borderRadius});

  final String? url;
  final String seed;
  final double aspectRatio;

  /// Rayon 6 par défaut ; une carte passe ses propres coins.
  final BorderRadius? borderRadius;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final fallback = CustomPaint(painter: _PatternPainter(seed, t.text), child: const SizedBox.expand());
    return AspectRatio(
      aspectRatio: aspectRatio,
      child: ClipRRect(
        borderRadius: borderRadius ?? BorderRadius.circular(Radii.sm),
        child: ColoredBox(
          color: t.surfaceAlt,
          child: url == null
              ? fallback
              : url!.startsWith('assets/')
                  // Image embarquée (catalogue simulé) : décodée à la taille affichée.
                  ? LayoutBuilder(
                      builder: (context, box) => Image.asset(
                        url!,
                        fit: BoxFit.cover,
                        width: double.infinity,
                        height: double.infinity,
                        // Les illustrations font 480 px : jamais décodées plus grand.
                        cacheWidth: box.maxWidth.isFinite ? (box.maxWidth * MediaQuery.devicePixelRatioOf(context)).round().clamp(1, 480) : null,
                        errorBuilder: (_, _, _) => fallback,
                      ),
                    )
                  : CachedNetworkImage(
                  imageUrl: url!,
                  fit: BoxFit.cover,
                  placeholder: (_, _) => fallback,
                  errorWidget: (_, _, _) => fallback,
                ),
        ),
      ),
    );
  }
}

class _PatternPainter extends CustomPainter {
  _PatternPainter(this.seed, this.ink);

  final String seed;
  final Color ink;

  int get _hash {
    var result = 0;
    for (final unit in seed.codeUnits) {
      result = (result * 31 + unit) & 0xFFFFFFFF;
    }
    return result;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final code = _hash;
    final variant = code % 3;
    final offset = (code >> 3) % 5;
    final s = size.shortestSide / 100;
    final dx = (size.width - 100 * s) / 2;
    final dy = (size.height - 100 * s) / 2;
    Rect r(double x, double y, double w, double h) => Rect.fromLTWH(dx + x * s, dy + y * s, w * s, h * s);
    Paint fill(double opacity) => Paint()..color = ink.withValues(alpha: opacity);

    if (variant == 0) {
      // Empilement — sacs, palettes, matériaux en vrac.
      for (var i = 0; i < 4; i++) {
        canvas.drawRRect(RRect.fromRectAndRadius(r(22 + i * 3.0, 70 - i * 14.0, 56 - i * 6.0, 12), Radius.circular(2 * s)), fill(0.14 + i * 0.06));
      }
    } else if (variant == 1) {
      // Concentrique — bobines, câbles, tuyauterie.
      for (var i = 0; i < 4; i++) {
        canvas.drawCircle(
          Offset(dx + 50 * s, dy + 50 * s),
          (34 - i * 8.0) * s,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 3 * s
            ..color = ink.withValues(alpha: 0.16 + i * 0.08),
        );
      }
    } else {
      // Trame — carrelage, revêtements, surfaces.
      for (var i = 0; i < 9; i++) {
        canvas.drawRRect(
          RRect.fromRectAndRadius(r(20 + (i % 3) * 21.0, 20 + (i ~/ 3) * 21.0, 17, 17), Radius.circular(2 * s)),
          fill(i == offset ? 0.34 : 0.12),
        );
      }
    }
  }

  @override
  bool shouldRepaint(_PatternPainter old) => old.seed != seed || old.ink != ink;
}
