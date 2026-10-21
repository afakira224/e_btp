import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/theme/theme.dart';
import '../../app/theme/tokens.dart';
import '../utils/format.dart';

// ─────────────────────────────────────────────
//  Compte à rebours jours / heures / min / s.
//  Il s'arrête quand l'app passe en arrière-plan et à l'échéance, et reste
//  muet pour les lecteurs d'écran (il changerait chaque seconde) : l'échéance
//  est annoncée en clair.
//  `compact` : une ligne « 2 j 13:45:10 », pour un bandeau.
// ─────────────────────────────────────────────
class Countdown extends StatefulWidget {
  const Countdown({super.key, required this.end, required this.color, this.boxColor, this.compact = false});

  final DateTime end;
  final Color color;

  /// Fond des cases ; sans fond, des cases bordées.
  final Color? boxColor;
  final bool compact;

  @override
  State<Countdown> createState() => _CountdownState();
}

class _CountdownState extends State<Countdown> with WidgetsBindingObserver {
  Timer? _timer;
  Duration _left = Duration.zero;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _tick();
    _start();
  }

  void _start() {
    _timer?.cancel();
    if (_left > Duration.zero) _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  void _tick() {
    final left = widget.end.difference(DateTime.now());
    setState(() => _left = left.isNegative ? Duration.zero : left);
    if (_left == Duration.zero) _timer?.cancel();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _tick();
      _start();
    } else {
      _timer?.cancel();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    super.dispose();
  }

  String _two(int v) => v.toString().padLeft(2, '0');

  @override
  Widget build(BuildContext context) {
    if (_left == Duration.zero) {
      return Text('Opération terminée', style: TextStyle(color: widget.color, fontWeight: FontWeight.w600));
    }
    final label = 'Fin de l\'opération ${formatLongDateTime(widget.end)}';
    if (widget.compact) {
      final days = _left.inDays;
      return Semantics(
        label: label,
        excludeSemantics: true,
        child: Text(
          '${days > 0 ? '$days j ' : ''}${_two(_left.inHours % 24)}:${_two(_left.inMinutes % 60)}:${_two(_left.inSeconds % 60)}',
          style: monoStyle(context, size: 15, color: widget.color, weight: FontWeight.w600),
        ),
      );
    }
    final units = [
      (_left.inDays, 'jours'),
      (_left.inHours % 24, 'h'),
      (_left.inMinutes % 60, 'min'),
      (_left.inSeconds % 60, 's'),
    ];
    return Semantics(
      label: label,
      excludeSemantics: true,
      child: Row(
        children: [
          for (final (value, unit) in units) ...[
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: Space.s2),
                decoration: BoxDecoration(
                  color: widget.boxColor,
                  border: widget.boxColor == null ? Border.all(color: widget.color) : null,
                  borderRadius: BorderRadius.circular(Radii.sm),
                ),
                child: Column(children: [
                  Text(_two(value), style: monoStyle(context, size: 20, color: widget.color, weight: FontWeight.w600)),
                  Text(unit, style: TextStyle(fontSize: 11, color: widget.color)),
                ]),
              ),
            ),
            if (unit != 's') const SizedBox(width: Space.s2),
          ],
        ],
      ),
    );
  }
}
