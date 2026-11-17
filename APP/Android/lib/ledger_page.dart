import 'package:material_ui/material_ui.dart';

import 'api.dart';
import 'money.dart';
import 'sheets.dart';
import 'store.dart';
import 'theme.dart';

class LedgerPage extends StatefulWidget {
  const LedgerPage({super.key, required this.store, required this.yearly, this.year, this.month});
  final BookStore store;
  final bool yearly;
  final int? year;
  final int? month;

  @override
  State<LedgerPage> createState() => _LedgerPageState();
}

class _LedgerPageState extends State<LedgerPage> {
  Map<String, dynamic>? data;
  String error = '';
  String query = '';
  String side = 'all';
  int? year;
  int? month;
  int seen = -1;

  @override
  void initState() {
    super.initState();
    year = widget.year;
    month = widget.yearly ? null : widget.month;
    widget.store.addListener(_reload);
    _load();
  }

  @override
  void didUpdateWidget(covariant LedgerPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.year != oldWidget.year || widget.month != oldWidget.month || widget.yearly != oldWidget.yearly) {
      year = widget.year ?? year;
      month = widget.yearly ? null : (widget.month ?? month);
      _load();
    }
  }

  @override
  void dispose() {
    widget.store.removeListener(_reload);
    super.dispose();
  }

  void _reload() {
    if (seen != widget.store.tick) _load();
  }

  Future<void> _load() async {
    seen = widget.store.tick;
    try {
      if (year == null) {
        final overview = await widget.store.api.get('/api/overview', withBook: true);
        if (widget.yearly) {
          year = (overview['year'] as Map)['year'] as int;
        } else {
          final today = overview['today'] as Map;
          year = today['year'] as int;
          month ??= today['month'] as int;
        }
      }
      final query = <String, String>{'year': '$year'};
      if (!widget.yearly && month != null) query['month'] = '$month';
      final next = await widget.store.api.get('/api/ledger', query: query, withBook: true);
      if (mounted) {
        setState(() {
          data = next;
          error = '';
        });
      }
    } on ApiException catch (err) {
      if (mounted) setState(() => error = err.message);
    }
  }

  void _shift(int delta) {
    if (widget.yearly) {
      setState(() => year = (year ?? DateTime.now().year) + delta);
    } else {
      var nextMonth = (month ?? DateTime.now().month) + delta;
      var nextYear = year ?? DateTime.now().year;
      if (nextMonth == 0) {
        nextMonth = 12;
        nextYear -= 1;
      } else if (nextMonth == 13) {
        nextMonth = 1;
        nextYear += 1;
      }
      setState(() {
        year = nextYear;
        month = nextMonth;
      });
    }
    _load();
  }

  Future<void> _edit(Map<String, dynamic>? entry) async {
    final saved = await showEntrySheet(context, widget.store, entry: entry);
    if (saved) widget.store.bump();
  }

  Future<void> _remove(Map<String, dynamic> row) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete this entry?'),
        content: Text('${row['description']} will leave the book, and the balance will be recalculated.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: debit), onPressed: () => Navigator.pop(context, true), child: const Text('Delete')),
        ],
      ),
    );
    if (yes != true) return;
    try {
      await widget.store.api.send('DELETE', '/api/transactions/${row['id']}');
      widget.store.bump();
    } on ApiException catch (err) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (data == null) {
      return Center(child: error.isEmpty ? const CircularProgressIndicator() : Text(error));
    }
    final ledger = data!;
    final rows = (ledger['rows'] as List? ?? []).cast<Map<String, dynamic>>().where((row) {
      if (side == 'in' && row['credit'] == '0.00') return false;
      if (side == 'out' && row['debit'] == '0.00') return false;
      final needle = query.trim().toLowerCase();
      if (needle.isEmpty) return true;
      final hay = '${row['date']} ${displayDate('${row['date']}')} ${row['description']} ${row['credit']} ${row['debit']}'.toLowerCase();
      return hay.contains(needle);
    }).toList();
    final totals = ledger['totals'] as Map<String, dynamic>;
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Eyebrow(widget.yearly ? 'Financial year ledger' : 'Month ledger'),
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(8, 0, 8, 0),
        child: Row(children: [
          IconButton(onPressed: () => _shift(-1), icon: const Icon(Icons.chevron_left)),
          Expanded(child: Text('${ledger['label']}', textAlign: TextAlign.center, style: const TextStyle(fontFamily: fontDisplay, fontWeight: FontWeight.w700, fontSize: 20, color: navy))),
          IconButton(onPressed: () => _shift(1), icon: const Icon(Icons.chevron_right)),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: TextField(
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search description, date, or amount'),
          onChanged: (value) => setState(() => query = value),
        ),
      ),
      const SizedBox(height: 8),
      SegmentedButton<String>(
        segments: const [
          ButtonSegment(value: 'all', label: Text('All')),
          ButtonSegment(value: 'in', label: Text('In')),
          ButtonSegment(value: 'out', label: Text('Out')),
        ],
        selected: {side},
        onSelectionChanged: (value) => setState(() => side = value.first),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Row(children: [
          Expanded(child: _Stat('In', totals['credit'], false)),
          Expanded(child: _Stat('Out', totals['debit'], true)),
          Expanded(child: _Stat('Balance', ledger['closingBalance'], false)),
        ]),
      ),
      Expanded(
        child: rows.isEmpty
            ? Center(child: Text(query.trim().isEmpty ? 'No entries in this period. Add one, or paste a statement.' : 'No lines match this search.', style: const TextStyle(color: muted), textAlign: TextAlign.center))
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(8, 8, 8, 96),
                itemCount: rows.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  final row = rows[index];
                  final moneyIn = row['credit'] != '0.00';
                  return ListTile(
                    title: LedgerText('${row['description']}'),
                    subtitle: Text(displayDate('${row['date']}')),
                    trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                      AmountText(moneyIn ? row['credit'] : row['debit'], out: !moneyIn),
                      Text(formatRupee(row['balance']), style: TextStyle(fontSize: 12, color: isNegativeAmount(row['balance']) ? debit : muted)),
                    ]),
                    onTap: () => _edit(row),
                    onLongPress: () => _remove(row),
                  );
                },
              ),
      ),
    ]);
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.amount, this.out);
  final String label;
  final Object? amount;
  final bool out;
  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(color: muted, fontSize: 12)),
      AmountText(amount, out: out, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
    ]);
  }
}
