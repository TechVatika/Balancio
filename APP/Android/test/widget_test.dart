import 'package:balancio/money.dart';
import 'package:balancio/statement.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('writes rupees the way the passbook does', () {
    expect(formatRupee('85000.00'), '₹85,000.00');
    expect(formatRupee('-40.00'), '−₹40.00');
    expect(formatRupee('0.00', empty: true), '—');
  });

  test('reads a pasted statement line', () {
    final parsed = parseStatement('16-11-2026, Salary, 85000, 0\n16-11-2026, House rent, 0, 15000');
    expect(parsed.errors, isEmpty);
    expect(parsed.rows, hasLength(2));
    expect(parsed.rows.first['credit'], '85000.00');
    expect(parsed.rows.last['debit'], '15000.00');
  });
}
