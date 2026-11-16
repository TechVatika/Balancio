import 'package:material_ui/material_ui.dart';

import 'api.dart';
import 'money.dart';
import 'statement.dart';
import 'store.dart';
import 'theme.dart';

class OverviewPage extends StatefulWidget {
  const OverviewPage({super.key, required this.store, required this.onOpenMonth, required this.onOpenYear});
  final BookStore store;
  final void Function(int year, int month) onOpenMonth;
  final void Function(int year) onOpenYear;

  @override
  State<OverviewPage> createState() => _OverviewPageState();
}

class _OverviewPageState extends State<OverviewPage> {
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

  Future<void> _load() async {
    seen = widget.store.tick;
    try {
      final next = await widget.store.api.get('/api/overview', withBook: true);
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
    if (data == null) {
      return Center(child: error.isEmpty ? const CircularProgressIndicator() : Text(error, textAlign: TextAlign.center));
    }
    final overview = data!;
    final today = overview['today'] as Map<String, dynamic>;
    final month = overview['month'] as Map<String, dynamic>;
    final year = overview['year'] as Map<String, dynamic>;
    final recent = (overview['recent'] as List? ?? []).cast<Map<String, dynamic>>();
    final trend = (overview['trend'] as List? ?? []).cast<Map<String, dynamic>>();
    final monthRows = (month['rows'] as List? ?? []).cast<Map<String, dynamic>>();
    final payments = [...monthRows.where((row) => row['debit'] != '0.00')]..sort((a, b) => (toPaise(b['debit']) ?? 0).compareTo(toPaise(a['debit']) ?? 0));
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
        children: [
          Text('On hand · ${displayDate('${today['iso']}')}', style: const TextStyle(color: muted, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          AmountText(overview['balance'], style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(
            overview['entryCount'] == 0 ? 'The book is empty. Add the first line, or paste a statement you already have.' : 'Running balance after ${overview['entryCount']} ${overview['entryCount'] == 1 ? 'entry' : 'entries'}.',
            style: const TextStyle(color: muted),
          ),
          const SizedBox(height: 16),
          _PeriodCard(
            title: '${month['label']}',
            totals: month['totals'] as Map<String, dynamic>,
            action: 'Open this month',
            onOpen: () => widget.onOpenMonth(today['year'] as int, today['month'] as int),
          ),
          const SizedBox(height: 12),
          _PeriodCard(
            title: '${year['label']}',
            totals: year['totals'] as Map<String, dynamic>,
            action: 'Open the year ledger',
            onOpen: () => widget.onOpenYear(year['year'] as int),
          ),
          const SizedBox(height: 16),
          _Panel(
            title: 'Last six months',
            child: _Bars(months: trend),
          ),
          const SizedBox(height: 16),
          _Panel(
            title: 'Largest payments',
            trailing: '${month['label']}'.split(' ').first,
            child: payments.isEmpty
                ? const Text('No payments this month.', style: TextStyle(color: muted))
                : Column(children: payments.take(5).map((row) => _Line(date: '${row['date']}', description: '${row['description']}', amount: row['debit'], out: true)).toList()),
          ),
          const SizedBox(height: 16),
          _Panel(
            title: 'Latest entries',
            child: recent.isEmpty
                ? const Text('Nothing recorded yet.', style: TextStyle(color: muted))
                : Column(children: recent.map((row) {
                    final moneyIn = row['credit'] != '0.00';
                    return _Line(date: '${row['date']}', description: '${row['description']}', amount: moneyIn ? row['credit'] : row['debit'], out: !moneyIn);
                  }).toList()),
          ),
        ],
      ),
    );
  }
}

class _PeriodCard extends StatelessWidget {
  const _PeriodCard({required this.title, required this.totals, required this.action, required this.onOpen});
  final String title;
  final Map<String, dynamic> totals;
  final String action;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w700, color: navy)),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: _Mini('In', totals['credit'], false)),
              Expanded(child: _Mini('Out', totals['debit'], true)),
              Expanded(child: _Mini('Net', totals['net'], false)),
            ]),
            TextButton(onPressed: onOpen, child: Text(action)),
          ],
        ),
      ),
    );
  }
}

class _Mini extends StatelessWidget {
  const _Mini(this.label, this.amount, this.out);
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

class _Panel extends StatelessWidget {
  const _Panel({required this.title, required this.child, this.trailing});
  final String title;
  final String? trailing;
  final Widget child;
  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, color: navy))),
            if (trailing != null) Text(trailing!, style: const TextStyle(color: muted)),
          ]),
          const SizedBox(height: 12),
          child,
        ]),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.date, required this.description, required this.amount, required this.out});
  final String date;
  final String description;
  final Object? amount;
  final bool out;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(children: [
        SizedBox(width: 88, child: Text(displayDate(date), style: const TextStyle(color: muted, fontSize: 13))),
        Expanded(child: Text(description, maxLines: 1, overflow: TextOverflow.ellipsis)),
        AmountText(amount, out: out),
      ]),
    );
  }
}

class _Bars extends StatelessWidget {
  const _Bars({required this.months});
  final List<Map<String, dynamic>> months;
  @override
  Widget build(BuildContext context) {
    if (months.isEmpty) return const Text('The last six months will appear here.', style: TextStyle(color: muted));
    var peak = 1;
    for (final month in months) {
      peak = [peak, toPaise(month['credit']) ?? 0, toPaise(month['debit']) ?? 0].reduce((a, b) => a > b ? a : b);
    }
    return SizedBox(
      height: 140,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: months.map((month) {
          final inHeight = ((toPaise(month['credit']) ?? 0) / peak) * 96;
          final outHeight = ((toPaise(month['debit']) ?? 0) / peak) * 96;
          return Expanded(
            child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
              Row(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                Container(width: 8, height: inHeight < 2 ? 2 : inHeight, color: credit),
                const SizedBox(width: 3),
                Container(width: 8, height: outHeight < 2 ? 2 : outHeight, color: debit),
              ]),
              const SizedBox(height: 6),
              Text('${month['label']}', style: const TextStyle(fontSize: 11, color: muted)),
            ]),
          );
        }).toList(),
      ),
    );
  }
}
