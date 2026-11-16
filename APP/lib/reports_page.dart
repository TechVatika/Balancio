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
  Map<String, dynamic>? data;
  String error = '';
  int seen = -1;

  @override
  void initState() {
    super.initState();
    widget.store.addListener(_reload);
    _load();
  }

  @override
  void dispose() {
    widget.store.removeListener(_reload);
    super.dispose();
  }

  void _reload() {
    if (seen != widget.store.tick) _load();
  }

  (String?, String?) _range() {
    final now = DateTime.now();
    String iso(DateTime date) => '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    if (preset == 'all') return (null, null);
    if (preset == 'month') return (iso(DateTime(now.year, now.month, 1)), iso(DateTime(now.year, now.month + 1, 0)));
    if (preset == 'last') return (iso(DateTime(now.year, now.month - 1, 1)), iso(DateTime(now.year, now.month, 0)));
    if (preset == 'year') return (iso(DateTime(now.year, 1, 1)), iso(DateTime(now.year, 12, 31)));
    return (iso(DateTime(now.year - 1, 1, 1)), iso(DateTime(now.year - 1, 12, 31)));
  }

  Future<void> _load() async {
    seen = widget.store.tick;
    final range = _range();
    final query = <String, String>{'side': side};
    if (range.$1 != null) {
      query['from'] = range.$1!;
      query['to'] = range.$2!;
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
    return Column(children: [
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: Row(children: [
          for (final item in const [('month', 'This month'), ('last', 'Last month'), ('year', 'This year'), ('lastYear', 'Last year'), ('all', 'All')])
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(item.$2),
                selected: preset == item.$1,
                onSelected: (_) {
                  setState(() => preset = item.$1);
                  _load();
                },
              ),
            ),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
        child: Wrap(spacing: 8, runSpacing: 8, children: [
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'all', label: Text('All')),
              ButtonSegment(value: 'in', label: Text('In')),
              ButtonSegment(value: 'out', label: Text('Out')),
            ],
            selected: {side},
            onSelectionChanged: (value) {
              setState(() => side = value.first);
              _load();
            },
          ),
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: false, label: Text('Lines')),
              ButtonSegment(value: true, label: Text('Months')),
            ],
            selected: {summary},
            onSelectionChanged: (value) => setState(() => summary = value.first),
          ),
        ]),
      ),
      Expanded(child: _body()),
    ]);
  }

  Widget _body() {
    if (data == null) return Center(child: error.isEmpty ? const CircularProgressIndicator() : Text(error));
    final report = data!;
    final totals = report['totals'] as Map<String, dynamic>;
    final rows = (report['rows'] as List? ?? []).cast<Map<String, dynamic>>();
    final months = (report['months'] as List? ?? []).cast<Map<String, dynamic>>();
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        Text('${displayDate('${report['from']}')} – ${displayDate('${report['to']}')}', style: const TextStyle(color: muted, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: _Stat('In', totals['credit'], false)),
          Expanded(child: _Stat('Out', totals['debit'], true)),
          Expanded(child: _Stat('Net', totals['net'], false)),
        ]),
        const SizedBox(height: 12),
        if (summary)
          ...months.map((month) => Card(
                elevation: 0,
                color: Colors.white,
                child: ListTile(
                  title: Text('${month['label']}'),
                  subtitle: Text('${month['count']} ${month['count'] == 1 ? 'entry' : 'entries'}'),
                  trailing: AmountText(month['closingBalance']),
                ),
              ))
        else
          ...rows.map((row) {
            final moneyIn = row['credit'] != '0.00';
            return ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('${row['description']}'),
              subtitle: Text(displayDate('${row['date']}')),
              trailing: AmountText(moneyIn ? row['credit'] : row['debit'], out: !moneyIn),
            );
          }),
        if ((summary ? months : rows).isEmpty) const Padding(padding: EdgeInsets.only(top: 24), child: Text('No lines in this period.', style: TextStyle(color: muted))),
      ],
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
