
import 'package:material_ui/material_ui.dart';

import 'money.dart';

const navy = Color(0xFF122236);
const canvas = Color(0xFFE8EDF3);
const paper = Color(0xFFFFFFFF);
const line = Color(0xFFD3DCE6);
const credit = Color(0xFF067647);
const debit = Color(0xFFB42318);
const accent = Color(0xFF1D4F91);
const muted = Color(0xFF5B6B7C);

const fontSans = 'IBMPlexSans';
const fontDisplay = 'SourceSerif4';
const fontGujarati = 'Rasa';

ThemeData balancioTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: navy, primary: navy, surface: paper);
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: canvas,
    fontFamily: fontSans,
    textTheme: const TextTheme(
      displayLarge: TextStyle(fontFamily: fontDisplay, fontWeight: FontWeight.w700),
      displayMedium: TextStyle(fontFamily: fontDisplay, fontWeight: FontWeight.w700),
      headlineLarge: TextStyle(fontFamily: fontDisplay, fontWeight: FontWeight.w700),
      headlineMedium: TextStyle(fontFamily: fontDisplay, fontWeight: FontWeight.w700),
      headlineSmall: TextStyle(fontFamily: fontDisplay, fontWeight: FontWeight.w600),
      titleLarge: TextStyle(fontFamily: fontDisplay, fontWeight: FontWeight.w700),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: navy,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(fontFamily: fontDisplay, fontSize: 20, fontWeight: FontWeight.w700, color: Colors.white),
    ),
    cardTheme: CardThemeData(
      color: paper,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: const BorderSide(color: line),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: paper,
      indicatorColor: const Color(0xFFD6E4F5),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(fontSize: 11, fontWeight: selected ? FontWeight.w700 : FontWeight.w600, color: selected ? navy : muted);
      }),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: navy,
        foregroundColor: Colors.white,
        minimumSize: const Size(64, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: navy,
        side: const BorderSide(color: line),
        minimumSize: const Size(64, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: paper,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: line)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: accent, width: 1.5)),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: paper,
      selectedColor: const Color(0xFFD6E4F5),
      side: const BorderSide(color: line),
      labelStyle: const TextStyle(fontFamily: fontSans, fontWeight: FontWeight.w600),
    ),
  );
}

class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key, this.light = false});
  final String text;
  final bool light;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: TextStyle(
        color: light ? const Color(0xFFD6E4F5) : accent,
        fontSize: 12,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.8,
      ),
    );
  }
}

class LedgerText extends StatelessWidget {
  const LedgerText(this.text, {super.key, this.maxLines, this.style, this.overflow});
  final String text;
  final int? maxLines;
  final TextStyle? style;
  final TextOverflow? overflow;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      maxLines: maxLines,
      overflow: overflow,
      style: (style ?? const TextStyle()).copyWith(
        fontFamily: fontGujarati,
        fontFamilyFallback: const ['NotoSerifGujarati', fontSans],
      ),
    );
  }
}

class AmountText extends StatelessWidget {
  const AmountText(this.amount, {super.key, this.out = false, this.empty = false, this.style});
  final Object? amount;
  final bool out;
  final bool empty;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final raw = '${amount ?? '0.00'}';
    final zero = raw == '0.00' || raw == '-0.00';
    final negative = raw.startsWith('-');
    final color = zero
        ? navy
        : (out || negative)
            ? debit
            : credit;
    return Text(
      formatRupee(raw, empty: empty),
      style: (style ?? const TextStyle(fontWeight: FontWeight.w700, fontFamily: fontSans)).copyWith(
        color: color,
        fontFeatures: const [FontFeature.tabularFigures()],
      ),
    );
  }
}
