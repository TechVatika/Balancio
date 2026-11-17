import 'package:material_ui/material_ui.dart';

import 'api.dart';
import 'money.dart';
import 'store.dart';
import 'theme.dart';

class ReportsPage extends StatefulWidget {
  const ReportsPage({super.key, required this.store});
  final BookStore store;
  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends State<ReportsPage> {
  String preset = 'month';
  String side = 'all';
  bool summary = false;
  String? from;
  String? to;
  Map<String, dynamic>? data;
  String error = '';
  int seen = -1;

  @override
  void initState() {
    super.initState();
    widget.store.addListener(_reload);
    _applyPreset('month');
  }

  @override
  void dispose() {
    widget.store.removeListener(_reload);
    super.dispose();
  }

  void _reload() {
    if (seen != widget.store.tick) _load();
  }

  String _iso(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

  void _applyPreset(String next) {
    final now = DateTime.now();
    setState(() {
      preset = next;
      if (next == 'all') {
        from = null;
        to = null;
      } else if (next == 'month') {
        from = _iso(DateTime(now.year, now.month, 1));
        to = _iso(DateTime(now.year, now.month + 1, 0));
      } else if (next == 'last') {
        from = _iso(DateTime(now.year, now.month - 1, 1));
        to = _iso(DateTime(now.year, now.month, 0));
      } else if (next == 'year') {
        from = _iso(DateTime(now.year, 1, 1));
        to = _iso(DateTime(now.year, 12, 31));
      } else if (next == 'lastYear') {
        from = _iso(DateTime(now.year - 1, 1, 1));
        to = _iso(DateTime(now.year - 1, 12, 31));
      }
    });
    _load();
  }

  Future<void> _pickDate({required bool start}) async {
    final current = DateTime.tryParse(start ? (from ?? todayIso()) : (to ?? todayIso())) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime(1990),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    setState(() {
      preset = 'custom';
      if (start) {
        from = _iso(picked);
      } else {
        to = _iso(picked);
      }
    });
    _load();
  }

  Future<void> _load() async {
    seen = widget.store.tick;
    if (preset != 'all' && (from == null || to == null)) {
      setState(() => error = 'Choose a start date and an end date.');
      return;
    }
    if (from != null && to != null && from!.compareTo(to!) > 0) {
      setState(() => error = 'The start date has to be on or before the end date.');
      return;
    }
    final query = <String, String>{'side': side};
    if (from != null && to != null) {
      query['from'] = from!;
      query['to'] = to!;
    }
    try {
      final next = await widget.store.api.get('/api/report', query: query, withBook: true);
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

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        const Eyebrow('Reports'),
        const SizedBox(height: 4),
        const Text('Download a report', style: TextStyle(fontFamily: fontDisplay, fontSize: 28, fontWeight: FontWeight.w700, color: navy)),
        const SizedBox(height: 4),
        const Text('Pick the dates, the lines, and whether you want every entry or a month-by-month summary.', style: TextStyle(color: muted)),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final item in const [
              ('month', 'This month'),
              ('last', 'Last month'),
              ('year', 'This year'),
              ('lastYear', 'Last year'),
              ('all', 'All entries'),
              ('custom', 'Custom'),
            ])
              ChoiceChip(
                label: Text(item.$2),
                selected: preset == item.$1,
                onSelected: (_) {
                  if (item.$1 == 'custom') {
                    setState(() => preset = 'custom');
                  } else {
                    _applyPreset(item.$1);
                  }
                },
              ),
          ],
        ),
        if (preset == 'all')
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('Every line in the book, from the first entry to the last.', style: TextStyle(color: muted)),
          ),
        if (preset != 'all') ...[
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => _pickDate(start: true),
                child: Text(from == null ? 'From' : 'From ${displayDate(from!)}'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton(
                onPressed: () => _pickDate(start: false),
                child: Text(to == null ? 'To' : 'To ${displayDate(to!)}'),
              ),
            ),
          ]),
        ],
        const SizedBox(height: 12),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'all', label: Text('All lines')),
            ButtonSegment(value: 'in', label: Text('Money in')),
            ButtonSegment(value: 'out', label: Text('Money out')),
          ],
          selected: {side},
          onSelectionChanged: (value) {
            setState(() => side = value.first);
            _load();
          },
        ),
        const SizedBox(height: 12),
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, label: Text('Statement')),
            ButtonSegment(value: true, label: Text('Monthly summary')),
          ],
          selected: {summary},
          onSelectionChanged: (value) => setState(() => summary = value.first),
        ),
        const SizedBox(height: 16),
        if (error.isNotEmpty) Text(error, style: const TextStyle(color: debit)),
        _body(),
        const SizedBox(height: 12),
        const Text(
          'On web you can download Excel (all books) or PDF. This phone preview uses the same report data.',
          style: TextStyle(color: muted, fontSize: 13),
        ),
      ],
    );
  }

  Widget _body() {
    if (data == null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 32),
        child: Center(child: error.isEmpty ? const CircularProgressIndicator() : Text(error)),
      );
    }
    final report = data!;
    final totals = report['totals'] as Map<String, dynamic>;
    final rows = (report['rows'] as List? ?? []).cast<Map<String, dynamic>>();
    final months = (report['months'] as List? ?? []).cast<Map<String, dynamic>>();
    final sideLabel = side == 'in' ? 'Money in' : side == 'out' ? 'Money out' : 'All lines';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Eyebrow('Balancio'),
            Text(summary ? 'Monthly summary' : 'Statement', style: const TextStyle(fontFamily: fontDisplay, fontSize: 22, fontWeight: FontWeight.w700, color: navy)),
            Text(
              '${displayDate('${report['from']}')} – ${displayDate('${report['to']}')}. $sideLabel.',
              style: const TextStyle(color: muted),
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: _Stat('In', totals['credit'], false)),
              Expanded(child: _Stat('Out', totals['debit'], true)),
              Expanded(child: _Stat(side == 'all' ? 'Closing balance' : 'Net of shown lines', side == 'all' ? report['closingBalance'] : totals['net'], false)),
            ]),
            const SizedBox(height: 12),
            if (summary)
              ...months.map((month) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('${month['label']}'),
                    subtitle: Text('${month['count']} ${month['count'] == 1 ? 'entry' : 'entries'}'),
                    trailing: AmountText(month['closingBalance']),
                  ))
            else
              ...rows.map((row) {
                final moneyIn = row['credit'] != '0.00';
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: LedgerText('${row['description']}'),
                  subtitle: Text(displayDate('${row['date']}')),
                  trailing: AmountText(moneyIn ? row['credit'] : row['debit'], out: !moneyIn),
                );
              }),
            if ((summary ? months : rows).isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 12),
                child: Text('No lines in this period.', style: TextStyle(color: muted)),
              ),
          ],
        ),
      ),
    );
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
      AmountText(amount, out: out),
    ]);
  }
}
