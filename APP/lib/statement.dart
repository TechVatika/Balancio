class ParsedStatement {
  ParsedStatement(this.rows, this.errors);
  final List<Map<String, String>> rows;
  final List<String> errors;
}

int? toPaise(Object? value) {
  if (value == null) return 0;
  var text = '$value'.trim();
  if (text.isEmpty || text == '-' || text == '—' || text == '–') return 0;
  text = text.replaceAll('₹', '').replaceAll(',', '').replaceAll(RegExp(r'\s+'), '');
  if (text.isEmpty || text == '-' || text == '—' || text == '–') return 0;
  final negative = text.startsWith('-') || RegExp(r'^\(.*\)$').hasMatch(text) || RegExp(r'dr$', caseSensitive: false).hasMatch(text);
  text = text.replaceFirst(RegExp(r'^\('), '').replaceFirst(RegExp(r'\)$'), '').replaceFirst(RegExp(r'^-'), '').replaceFirst(RegExp(r'(cr|dr)$', caseSensitive: false), '');
  if (!RegExp(r'^\d+(\.\d+)?$').hasMatch(text)) return null;
  final parts = text.split('.');
  if (parts.first.length > 12) return null;
  final digits = ('${parts.length > 1 ? parts[1] : ''}000').substring(0, 3);
  var paise = int.parse(parts.first) * 100 + int.parse(digits.substring(0, 2));
  if (digits[2].compareTo('5') >= 0) paise += 1;
  return negative ? -paise : paise;
}

int? toUnsignedPaise(Object? value) {
  if (value == null) return 0;
  final text = '$value'.trim();
  if (text.isEmpty || text == '-' || text == '—' || text == '–') return 0;
  final cleaned = text.replaceFirst(RegExp(r'(cr|dr)$', caseSensitive: false), '').replaceFirst(RegExp(r'^-'), '').replaceFirst(RegExp(r'^\('), '').replaceFirst(RegExp(r'\)$'), '');
  final paise = toPaise(cleaned);
  if (paise == null) return null;
  return paise.abs();
}

String paiseToAmount(int paise) {
  final sign = paise < 0 ? '-' : '';
  final abs = paise.abs();
  return '$sign${abs ~/ 100}.${(abs % 100).toString().padLeft(2, '0')}';
}

String? parseDate(String value) {
  final text = value.trim();
  var match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(text);
  if (match != null) return _iso(match.group(1)!, match.group(2)!, match.group(3)!);
  match = RegExp(r'^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$').firstMatch(text);
  if (match != null) return _iso(match.group(3)!, match.group(2)!, match.group(1)!);
  match = RegExp(r'^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$').firstMatch(text);
  if (match != null) {
    const months = {
      'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3, 'apr': 4, 'april': 4,
      'may': 5, 'jun': 6, 'june': 6, 'jul': 7, 'july': 7, 'aug': 8, 'august': 8,
      'sep': 9, 'sept': 9, 'september': 9, 'oct': 10, 'october': 10, 'nov': 11, 'november': 11, 'dec': 12, 'december': 12,
    };
    final month = months[match.group(2)!.toLowerCase()];
    if (month == null) return null;
    return _iso(match.group(3)!, '$month', match.group(1)!);
  }
  return null;
}

String? _iso(String year, String month, String day) {
  final y = int.tryParse(year);
  final m = int.tryParse(month);
  final d = int.tryParse(day);
  if (y == null || m == null || d == null || m < 1 || m > 12 || d < 1 || d > 31) return null;
  final date = DateTime.utc(y, m, d);
  if (date.year != y || date.month != m || date.day != d) return null;
  return '${y.toString().padLeft(4, '0')}-${m.toString().padLeft(2, '0')}-${d.toString().padLeft(2, '0')}';
}

ParsedStatement parseStatement(String text) {
  final lines = text.split(RegExp(r'\r?\n')).map((line) => line.trim()).where((line) => line.isNotEmpty).toList();
  final rows = <Map<String, String>>[];
  final errors = <String>[];
  Map<String, int>? columns;
  var start = 0;
  if (lines.isNotEmpty) {
    columns = _headerMap(_splitRow(lines.first));
    if (columns != null) start = 1;
  }
  for (var index = start; index < lines.length; index += 1) {
    final lineNo = index + 1;
    final line = lines[index];
    if (RegExp(r'^[-_=]{3,}$').hasMatch(line)) continue;
    final cells = _splitRow(line);
    if (!RegExp(r'^\d').hasMatch(cells.first)) continue;
    String dateRaw;
    String description;
    String creditRaw = '';
    String debitRaw = '';
    String? singleRaw;
    if (columns != null) {
      dateRaw = _cell(cells, columns['date']);
      description = _cell(cells, columns['description']);
      creditRaw = _cell(cells, columns['credit']);
      debitRaw = _cell(cells, columns['debit']);
    } else if (cells.length >= 4) {
      dateRaw = cells[0];
      description = cells[1];
      creditRaw = cells[2];
      debitRaw = cells[3];
    } else if (cells.length == 3) {
      dateRaw = cells[0];
      description = cells[1];
      singleRaw = cells[2];
    } else {
      errors.add('Line $lineNo needs a date, description, credit, and debit.');
      continue;
    }
    final date = parseDate(dateRaw);
    if (date == null) {
      errors.add('Line $lineNo has a date Balancio cannot read.');
      continue;
    }
    description = description.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (description.isEmpty) {
      errors.add('Line $lineNo is missing a description.');
      continue;
    }
    if (description.length > 500) {
      errors.add('Line $lineNo description is longer than 500 characters.');
      continue;
    }
    var creditPaise = 0;
    var debitPaise = 0;
    if (singleRaw != null) {
      final signed = toPaise(singleRaw);
      if (signed == null) {
        errors.add('Line $lineNo has an amount Balancio cannot read.');
        continue;
      }
      if (signed < 0) {
        debitPaise = -signed;
      } else {
        creditPaise = signed;
      }
    } else {
      final credit = toUnsignedPaise(creditRaw);
      final debit = toUnsignedPaise(debitRaw);
      if (credit == null || debit == null) {
        errors.add('Line $lineNo has an amount Balancio cannot read.');
        continue;
      }
      creditPaise = credit;
      debitPaise = debit;
    }
    if (creditPaise > 0 && debitPaise > 0) {
      errors.add('Line $lineNo is both a credit and a debit.');
      continue;
    }
    if (creditPaise == 0 && debitPaise == 0) {
      errors.add('Line $lineNo is missing an amount.');
      continue;
    }
    rows.add({
      'date': date,
      'description': description,
      'credit': paiseToAmount(creditPaise),
      'debit': paiseToAmount(debitPaise),
    });
  }
  return ParsedStatement(rows, errors);
}

String _cell(List<String> cells, int? index) => index == null || index >= cells.length ? '' : cells[index];

Map<String, int>? _headerMap(List<String> cells) {
  const keys = {
    'date': 'date', 'txn date': 'date', 'transaction date': 'date', 'value date': 'date',
    'description': 'description', 'narration': 'description', 'particulars': 'description', 'details': 'description', 'remarks': 'description',
    'credit': 'credit', 'deposit': 'credit', 'deposits': 'credit', 'cr': 'credit',
    'debit': 'debit', 'withdrawal': 'debit', 'withdrawals': 'debit', 'dr': 'debit',
  };
  final map = <String, int>{};
  for (var index = 0; index < cells.length; index += 1) {
    final key = keys[cells[index].toLowerCase().replaceAll(RegExp(r'\s+'), ' ').trim()];
    if (key != null && !map.containsKey(key)) map[key] = index;
  }
  if (!map.containsKey('date')) return null;
  if (!map.containsKey('description') && !map.containsKey('credit') && !map.containsKey('debit')) return null;
  return map;
}

List<String> _splitRow(String line) {
  if (line.contains('\t')) return line.split('\t').map((cell) => cell.trim()).toList();
  if (line.contains(',')) return _splitCsv(line);
  final wide = line.split(RegExp(r'\s{2,}')).map((cell) => cell.trim()).where((cell) => cell.isNotEmpty).toList();
  return wide.length > 1 ? wide : [line.trim()];
}

List<String> _splitCsv(String line) {
  final cells = <String>[];
  final current = StringBuffer();
  var quoted = false;
  for (var index = 0; index < line.length; index += 1) {
    final char = line[index];
    if (quoted) {
      if (char == '"') {
        if (index + 1 < line.length && line[index + 1] == '"') {
          current.write('"');
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current.write(char);
      }
    } else if (char == '"') {
      quoted = true;
    } else if (char == ',') {
      cells.add(current.toString().trim());
      current.clear();
    } else {
      current.write(char);
    }
  }
  cells.add(current.toString().trim());
  return cells;
}
