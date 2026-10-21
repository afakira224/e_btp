import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../app/theme/tokens.dart';

// ─────────────────────────────────────────────
//  Champ de formulaire de la charte : libellé au-dessus, « — facultatif »,
//  aide ou erreur dessous. L'erreur n'apparaît qu'en quittant le champ ou
//  à l'envoi (AutovalidateMode.onUnfocus), puis se corrige en direct :
//  on ne réprimande pas pendant la frappe, comme sur le web.
// ─────────────────────────────────────────────
class AppTextField extends StatefulWidget {
  const AppTextField({
    super.key,
    required this.label,
    required this.controller,
    this.validator,
    this.hint,
    this.helper,
    this.optional = false,
    this.password = false,
    this.keyboardType,
    this.textInputAction = TextInputAction.next,
    this.autofillHints,
    this.onSubmitted,
    this.onChanged,
    this.inputFormatters,
    this.enabled = true,
    this.autofocus = false,
    this.textCapitalization = TextCapitalization.none,
  });

  final String label;
  final TextEditingController controller;
  final String? Function(String?)? validator;
  final String? hint;
  final String? helper;
  final bool optional;
  final bool password;
  final TextInputType? keyboardType;
  final TextInputAction textInputAction;
  final Iterable<String>? autofillHints;
  final ValueChanged<String>? onSubmitted;
  final ValueChanged<String>? onChanged;
  final List<TextInputFormatter>? inputFormatters;
  final bool enabled;
  final bool autofocus;
  final TextCapitalization textCapitalization;

  @override
  State<AppTextField> createState() => _AppTextFieldState();
}

class _AppTextFieldState extends State<AppTextField> {
  bool _revealed = false;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text.rich(
          TextSpan(
            text: widget.label,
            style: TextStyle(fontWeight: FontWeight.w500, color: t.text, fontSize: 14),
            children: [
              if (widget.optional) TextSpan(text: ' — facultatif', style: TextStyle(color: t.textMuted, fontWeight: FontWeight.w400)),
            ],
          ),
        ),
        const SizedBox(height: Space.s2),
        TextFormField(
          controller: widget.controller,
          validator: widget.validator,
          autovalidateMode: AutovalidateMode.onUnfocus,
          obscureText: widget.password && !_revealed,
          enableSuggestions: !widget.password,
          autocorrect: false,
          keyboardType: widget.keyboardType,
          textInputAction: widget.textInputAction,
          autofillHints: widget.autofillHints,
          onFieldSubmitted: widget.onSubmitted,
          onChanged: widget.onChanged,
          inputFormatters: widget.inputFormatters,
          enabled: widget.enabled,
          autofocus: widget.autofocus,
          textCapitalization: widget.textCapitalization,
          decoration: InputDecoration(
            hintText: widget.hint,
            helperText: widget.helper,
            helperMaxLines: 3,
            helperStyle: TextStyle(color: t.textMuted, fontSize: 12),
            suffixIcon: widget.password
                ? IconButton(
                    onPressed: () => setState(() => _revealed = !_revealed),
                    // Le libellé annonce l'action, pas l'état.
                    tooltip: _revealed ? 'Masquer le mot de passe' : 'Afficher le mot de passe',
                    icon: Icon(_revealed ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                  )
                : null,
          ),
        ),
      ],
    );
  }
}

/// Règles du mot de passe, cochées en direct pendant la saisie.
class PasswordChecklist extends StatelessWidget {
  const PasswordChecklist({super.key, required this.controller, required this.checks});

  final TextEditingController controller;
  final List<(String, bool)> Function(String) checks;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) => Wrap(
        spacing: Space.s4,
        runSpacing: Space.s1,
        children: [
          for (final (label, met) in checks(controller.text))
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(met ? Icons.check : Icons.circle_outlined, size: 14, color: met ? t.success : t.textMuted),
                const SizedBox(width: Space.s1),
                Text(label, style: TextStyle(fontSize: 12, color: met ? t.success : t.textMuted)),
              ],
            ),
        ],
      ),
    );
  }
}

/// Bouton principal avec état « en cours » : reste focalisable, refuse les
/// appuis pendant l'envoi — c'est ce qui évite la double soumission.
class SubmitButton extends StatelessWidget {
  const SubmitButton({super.key, required this.label, required this.onPressed, this.loading = false, this.expand = true});

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final button = FilledButton(
      onPressed: loading ? null : onPressed,
      child: loading
          ? Row(mainAxisSize: MainAxisSize.min, children: [
              SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: context.tokens.textMuted)),
              const SizedBox(width: Space.s3),
              Text(label),
            ])
          : Text(label),
    );
    return expand ? SizedBox(width: double.infinity, child: button) : button;
  }
}
