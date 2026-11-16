import 'package:material_ui/material_ui.dart';

import 'money.dart';

const navy = Color(0xFF122236);
const canvas = Color(0xFFEEF1F5);
const credit = Color(0xFF067647);
const debit = Color(0xFFB42318);
const accent = Color(0xFF1D4F91);
const muted = Color(0xFF5B6B7C);

ThemeData balancioTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: navy, primary: navy, surface: Colors.white);
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: canvas,
    fontFamily: 'SourceSans',
    appBarTheme: const AppBarTheme(
      backgroundColor: navy,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: false,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: const Color(0xFFD6E4F5),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(fontSize: 12, fontWeight: selected ? FontWeight.w700 : FontWeight.w600, color: selected ? navy : muted);
      }),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(backgroundColor: navy, foregroundColor: Colors.white, minimumSize: const Size(64, 48)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFFC5D0DC))),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Color(0xFFC5D0DC))),
    ),
  );
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
    return Text(formatRupee(raw, empty: empty), style: (style ?? const TextStyle(fontWeight: FontWeight.w700)).copyWith(color: color));
  }
}
