import 'package:material_ui/material_ui.dart';

import 'api.dart';
import 'money.dart';
import 'store.dart';
import 'theme.dart';

class AccountPage extends StatefulWidget {
  const AccountPage({super.key, required this.store});
  final BookStore store;

  @override
  State<AccountPage> createState() => _AccountPageState();
}

class _AccountPageState extends State<AccountPage> {
  final current = TextEditingController(text: 'balancio123');
  final next = TextEditingController();
  final confirm = TextEditingController();
  String passwordError = '';
  String passwordDone = '';
  bool savingPassword = false;
  bool signingOut = false;
  List<Map<String, dynamic>> keys = [];
  String keysError = '';

  @override
  void initState() {
    super.initState();
    _loadKeys();
  }

  @override
  void dispose() {
    current.dispose();
    next.dispose();
    confirm.dispose();
    super.dispose();
  }

  Future<void> _loadKeys() async {
    try {
      final data = await widget.store.api.get('/api/security/keys');
      if (!mounted) return;
      setState(() {
        keys = (data['keys'] as List? ?? []).cast<Map<String, dynamic>>();
        keysError = '';
      });
    } on ApiException catch (err) {
      if (mounted) setState(() => keysError = err.message);
    }
  }

  Future<void> _changePassword() async {
    setState(() {
      passwordError = '';
      passwordDone = '';
    });
    if (next.text != confirm.text) {
      setState(() => passwordError = 'The new passwords don’t match.');
      return;
    }
    if (next.text.length < 8) {
      setState(() => passwordError = 'Use a password with at least 8 characters.');
      return;
    }
    setState(() => savingPassword = true);
    try {
      await widget.store.changePassword(current.text, next.text);
      current.clear();
      next.clear();
      confirm.clear();
      setState(() => passwordDone = 'Password updated.');
    } on ApiException catch (err) {
      setState(() => passwordError = err.message);
    } finally {
      if (mounted) setState(() => savingPassword = false);
    }
  }

  Future<void> _rename(Map<String, dynamic> book) async {
    final field = TextEditingController(text: '${book['name']}');
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Rename book'),
        content: TextField(controller: field, decoration: const InputDecoration(labelText: 'Name')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
        ],
      ),
    );
    if (ok != true || field.text.trim().isEmpty) return;
    try {
      await widget.store.renameBook(book['id'] as int, field.text.trim());
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Book renamed.')));
    } on ApiException catch (err) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err.message)));
    }
  }

  Future<void> _delete(Map<String, dynamic> book) async {
    final count = book['entryCount'] as int? ?? 0;
    if (count > 0 || widget.store.books.length <= 1) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Move or delete its entries first, and keep at least one book.')),
      );
      return;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete this book?'),
        content: Text('"${book['name']}" will be removed. This can’t be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: debit),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await widget.store.deleteBook(book['id'] as int);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Book deleted.')));
    } on ApiException catch (err) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.store,
      builder: (context, _) {
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            const Eyebrow('Account'),
            const SizedBox(height: 4),
            const Text('Login & security', style: TextStyle(fontFamily: fontDisplay, fontSize: 28, fontWeight: FontWeight.w700, color: navy)),
            const SizedBox(height: 4),
            const Text('Your password, session, and the encryption keys protecting this book.', style: TextStyle(color: muted)),
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton(
                onPressed: signingOut
                    ? null
                    : () async {
                        setState(() => signingOut = true);
                        await widget.store.logout();
                      },
                child: Text(signingOut ? 'Signing out…' : 'Sign out'),
              ),
            ),
            const SizedBox(height: 20),
            _Panel(
              title: 'Login details',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Single account password. There is no username — one password unlocks the whole book.', style: TextStyle(color: muted)),
                  const SizedBox(height: 12),
                  TextField(controller: current, obscureText: true, decoration: const InputDecoration(labelText: 'Current password')),
                  const SizedBox(height: 12),
                  TextField(controller: next, obscureText: true, decoration: const InputDecoration(labelText: 'New password')),
                  const SizedBox(height: 12),
                  TextField(controller: confirm, obscureText: true, decoration: const InputDecoration(labelText: 'Confirm new password')),
                  if (passwordError.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(passwordError, style: const TextStyle(color: debit))),
                  if (passwordDone.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(passwordDone, style: const TextStyle(color: credit))),
                  const SizedBox(height: 12),
                  FilledButton(onPressed: savingPassword ? null : _changePassword, child: Text(savingPassword ? 'Saving…' : 'Change password')),
                ],
              ),
            ),
            const SizedBox(height: 16),
            _Panel(
              title: 'Books',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Each book is its own ledger, with its own opening balance and entries. Switch books from the menu.', style: TextStyle(color: muted)),
                  const SizedBox(height: 8),
                  for (final book in widget.store.books)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('${book['name']}${book['id'] == widget.store.api.bookId ? ' · active' : ''}'),
                      subtitle: Text('${formatRupee(book['openingBalance'])} opening · ${book['entryCount']} ${(book['entryCount'] == 1) ? 'entry' : 'entries'}'),
                      trailing: Wrap(spacing: 4, children: [
                        TextButton(onPressed: () => _rename(book), child: const Text('Rename')),
                        TextButton(
                          onPressed: () => _delete(book),
                          style: TextButton.styleFrom(foregroundColor: debit),
                          child: const Text('Delete'),
                        ),
                      ]),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            _Panel(
              title: 'Data encryption',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Entry descriptions are encrypted at rest with AES-256-GCM. A new key is generated the first time the app is used each day; past keys are kept so older entries stay readable. Keys themselves are never shown here.',
                    style: TextStyle(color: muted),
                  ),
                  const SizedBox(height: 12),
                  if (keysError.isNotEmpty) Text(keysError, style: const TextStyle(color: debit)),
                  if (keys.isEmpty && keysError.isEmpty)
                    const Text('No encryption key yet — it’s created the first time an entry is saved.', style: TextStyle(color: muted)),
                  for (var i = 0; i < keys.length; i++)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(displayDate('${keys[i]['keyDate'] ?? ''}')),
                      subtitle: const Text('Daily encryption key'),
                      trailing: Text(
                        i == 0 ? 'Active' : 'Retained',
                        style: TextStyle(color: i == 0 ? credit : muted, fontWeight: FontWeight.w700),
                      ),
                    ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: const TextStyle(fontFamily: fontDisplay, fontSize: 20, fontWeight: FontWeight.w700, color: navy)),
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }
}
