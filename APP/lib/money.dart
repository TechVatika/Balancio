String formatRupee(Object? amount, {bool empty = false}) {
  final raw = '${amount ?? '0.00'}'.trim();
  final negative = raw.startsWith('-');
  final parts = raw.replaceFirst('-', '').split('.');
  var rupees = parts.first.replaceAll(RegExp(r'\D'), '');
  if (rupees.isEmpty) rupees = '0';
  rupees = rupees.replaceFirst(RegExp(r'^0+(?=\d)'), '');
  final paise = ('${parts.length > 1 ? parts[1] : ''}00').replaceAll(RegExp(r'\D'), '').substring(0, 2);
  if (empty && !negative && rupees == '0' && paise == '00') return '—';
  final body = '${_groupIndian(rupees)}.$paise';
  return negative ? '−₹$body' : '₹$body';
}

bool isZeroAmount(Object? amount) {
  final raw = '${amount ?? '0.00'}'.trim();
  return raw == '0.00' || raw == '-0.00' || raw == '0' || raw == '-0';
}

bool isNegativeAmount(Object? amount) => '${amount ?? ''}'.trim().startsWith('-');

String _groupIndian(String digits) {
  if (digits.length <= 3) return digits;
  final tail = digits.substring(digits.length - 3);
  final head = digits.substring(0, digits.length - 3).replaceAllMapped(RegExp(r'\B(?=(\d{2})+(?!\d))'), (_) => ',');
  return '$head,$tail';
}

String todayIso() {
  final now = DateTime.now();
  final month = now.month.toString().padLeft(2, '0');
  final day = now.day.toString().padLeft(2, '0');
  return '${now.year}-$month-$day';
}

String displayDate(String iso) {
  final parts = iso.split('-');
  if (parts.length != 3) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final month = int.tryParse(parts[1]) ?? 1;
  final day = int.tryParse(parts[2]) ?? 1;
  return '$day ${months[month - 1]} ${parts[0]}';
}
