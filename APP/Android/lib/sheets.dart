import 'package:material_ui/material_ui.dart';

import 'api.dart';
import 'money.dart';
import 'statement.dart';
import 'store.dart';
import 'theme.dart';

Future<bool> showEntrySheet(BuildContext context, BookStore store, {Map<String, dynamic>? entry}) async {
  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    isDismissible: false,
    enableDrag: false,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
    builder: (context) => EntrySheet(store: store, entry: entry),
  );
  return saved == true;
}

class EntrySheet extends StatefulWidget {
  const EntrySheet({super.key, required this.store, this.entry});
  final BookStore store;
  final Map<String, dynamic>? entry;

  @override
  State<EntrySheet> createState() => _EntrySheetState();
}

class _EntrySheetState extends State<EntrySheet> {
  late final TextEditingController description;
  late final TextEditingController amount;
  late String date;
  late bool moneyIn;
  String error = '';
  bool saving = false;

  @override
  void initState() {
    super.initState();
    final entry = widget.entry;
    date = entry?['date'] as String? ?? todayIso();
    description = TextEditingController(text: entry?['description'] as String? ?? '');
    final credit = '${entry?['credit'] ?? '0.00'}';
    moneyIn = entry == null || credit != '0.00';
    amount = TextEditingController(text: entry == null ? '' : (moneyIn ? credit : '${entry['debit']}'));
  }

  @override
  void dispose() {
    description.dispose();
    amount.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (description.text.trim().isEmpty) {
      setState(() => error = 'Enter a description.');
      return;
    }
    final paise = toUnsignedPaise(amount.text);
    if (paise == null || paise == 0) {
      setState(() => error = 'Enter the amount without a minus. Choose credit for money in, or debit for money out.');
      return;
    }
    setState(() {
      saving = true;
      error = '';
    });
    final body = {
      'date': date,
      'description': description.text.trim(),
      'credit': moneyIn ? paiseToAmount(paise) : '0.00',
      'debit': moneyIn ? '0.00' : paiseToAmount(paise),
    };
    try {
      final id = widget.entry?['id'];
      if (id == null) {
        await widget.store.api.send('POST', '/api/transactions', body: body, withBook: true);
      } else {
        await widget.store.api.send('PUT', '/api/transactions/$id', body: body, withBook: true);
      }
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (err) {
      setState(() {
        saving = false;
        error = err.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.entry != null;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Eyebrow(editing ? 'Edit line' : 'New line'),
          const SizedBox(height: 4),
          Text(editing ? 'Update this entry' : 'Add an entry', style: const TextStyle(fontFamily: fontDisplay, fontSize: 22, fontWeight: FontWeight.w700, color: navy)),
          const SizedBox(height: 4),
          const Text('Your personal ledger. Credit is money in, debit is money out.', style: TextStyle(color: muted)),
          const SizedBox(height: 16),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Date'),
            subtitle: Text(displayDate(date)),
            trailing: const Icon(Icons.calendar_today_outlined),
            onTap: () async {
              final current = DateTime.tryParse(date) ?? DateTime.now();
              final picked = await showDatePicker(context: context, initialDate: current, firstDate: DateTime(1990), lastDate: DateTime(2100));
              if (picked != null) {
                setState(() => date = '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}');
              }
            },
          ),
          TextField(
            controller: description,
            maxLength: 500,
            textCapitalization: TextCapitalization.sentences,
            style: const TextStyle(fontFamily: fontGujarati, fontFamilyFallback: ['NotoSerifGujarati', fontSans]),
            decoration: const InputDecoration(labelText: 'Description', hintText: 'Salary, rent, UPI, ATM…'),
          ),
          const SizedBox(height: 12),
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: true, label: Text('Credit · in')),
              ButtonSegment(value: false, label: Text('Debit · out')),
            ],
            selected: {moneyIn},
            onSelectionChanged: (value) => setState(() => moneyIn = value.first),
          ),
          const SizedBox(height: 12),
          TextField(controller: amount, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Amount', prefixText: '₹ ')),
          if (error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error, style: const TextStyle(color: debit))),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: OutlinedButton(onPressed: saving ? null : () => Navigator.pop(context, false), child: const Text('Cancel'))),
              const SizedBox(width: 12),
              Expanded(child: FilledButton(onPressed: saving ? null : save, child: Text(saving ? 'Saving…' : editing ? 'Save changes' : 'Add entry'))),
            ],
          ),
        ],
      ),
    );
  }
}

Future<bool> showPasteSheet(BuildContext context, BookStore store) async {
  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    isDismissible: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
    builder: (context) => PasteSheet(store: store),
  );
  return saved == true;
}

class PasteSheet extends StatefulWidget {
  const PasteSheet({super.key, required this.store});
  final BookStore store;

  @override
  State<PasteSheet> createState() => _PasteSheetState();
}

class _PasteSheetState extends State<PasteSheet> {
  final text = TextEditingController();
  String error = '';
  bool saving = false;

  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  Future<void> save(ParsedStatement parsed) async {
    if (parsed.rows.isEmpty || parsed.errors.isNotEmpty) return;
    setState(() {
      saving = true;
      error = '';
    });
    try {
      await widget.store.api.send('POST', '/api/transactions/bulk', body: {'entries': parsed.rows}, withBook: true);
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (err) {
      setState(() {
        saving = false;
        error = err.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final parsed = parseStatement(text.text);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Eyebrow('Bring a statement in'),
          const SizedBox(height: 4),
          const Text('Paste entries', style: TextStyle(fontFamily: fontDisplay, fontSize: 22, fontWeight: FontWeight.w700, color: navy)),
          const SizedBox(height: 4),
          const Text('One line per entry: date, description, credit, debit. Tabs or commas both work.', style: TextStyle(color: muted)),
          const SizedBox(height: 12),
          TextField(controller: text, minLines: 6, maxLines: 10, onChanged: (_) => setState(() {}), decoration: const InputDecoration(alignLabelWithHint: true, labelText: 'Statement text')),
          if (parsed.rows.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text('${parsed.rows.length} ${parsed.rows.length == 1 ? 'entry' : 'entries'} ready', style: const TextStyle(color: navy, fontWeight: FontWeight.w700))),
          if (parsed.errors.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(parsed.errors.first, style: const TextStyle(color: debit))),
          if (error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(error, style: const TextStyle(color: debit))),
          const SizedBox(height: 16),
          FilledButton(onPressed: saving || parsed.rows.isEmpty || parsed.errors.isNotEmpty ? null : () => save(parsed), child: Text(saving ? 'Saving…' : 'Paste entries')),
        ],
      ),
    );
  }
}
