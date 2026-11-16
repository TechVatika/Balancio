import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'ledger_page.dart';
import 'overview_page.dart';
import 'reports_page.dart';
import 'sheets.dart';
import 'statement.dart';
import 'store.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final store = BookStore(prefs);
  runApp(BalancioApp(store: store));
  await store.boot();
}

class BalancioApp extends StatelessWidget {
  const BalancioApp({super.key, required this.store});
  final BookStore store;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Balancio',
      debugShowCheckedModeBanner: false,
      theme: balancioTheme(),
      home: AnimatedBuilder(
        animation: store,
        builder: (context, _) {
          if (store.booting) return const Scaffold(body: Center(child: CircularProgressIndicator()));
          if (!store.authenticated) return SignInPage(store: store);
          return HomeShell(store: store);
        },
      ),
    );
  }
}

class SignInPage extends StatefulWidget {
  const SignInPage({super.key, required this.store});
  final BookStore store;
  @override
  State<SignInPage> createState() => _SignInPageState();
}

class _SignInPageState extends State<SignInPage> {
  late final TextEditingController server;
  final password = TextEditingController();
  final confirm = TextEditingController();
  String error = '';
  bool busy = false;

  @override
  void initState() {
    super.initState();
    server = TextEditingController(text: widget.store.api.baseUrl);
    error = widget.store.bootError ?? '';
  }

  @override
  void dispose() {
    server.dispose();
    password.dispose();
    confirm.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    setState(() {
      busy = true;
      error = '';
    });
    try {
      if (server.text.trim() != widget.store.api.baseUrl || widget.store.bootError != null) {
        await widget.store.setServer(server.text);
      }
      if (widget.store.bootError != null) throw ApiException(widget.store.bootError!, 0);
      if (!widget.store.configured) {
        if (password.text.length < 8) throw ApiException('Use at least 8 characters.', 400);
        if (password.text != confirm.text) throw ApiException('The two passwords do not match.', 400);
        await widget.store.setup(password.text);
      } else {
        await widget.store.login(password.text);
      }
    } on ApiException catch (err) {
      setState(() => error = err.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final setup = !widget.store.configured && widget.store.bootError == null;
    return Scaffold(
      backgroundColor: navy,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Image.asset('assets/logo.png', height: 72),
                  const SizedBox(height: 16),
                  const Text('Balancio', style: TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w700)),
                  const Text('Your money, on hand.', style: TextStyle(color: Color(0xFFD6E4F5))),
                  const SizedBox(height: 24),
                  TextField(controller: server, style: const TextStyle(color: navy), decoration: const InputDecoration(labelText: 'Server', helperText: 'This computer: http://127.0.0.1:4000. An emulator uses http://10.0.2.2:4000.')),
                  const SizedBox(height: 12),
                  TextField(controller: password, obscureText: true, style: const TextStyle(color: navy), decoration: InputDecoration(labelText: setup ? 'Choose a password' : 'Password')),
                  if (setup) ...[
                    const SizedBox(height: 12),
                    TextField(controller: confirm, obscureText: true, style: const TextStyle(color: navy), decoration: const InputDecoration(labelText: 'Confirm password')),
                  ],
                  if (error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error, style: const TextStyle(color: Color(0xFFFFD0CC)))),
                  const SizedBox(height: 16),
                  FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: navy),
                    onPressed: busy ? null : submit,
                    child: Text(busy ? 'Opening…' : setup ? 'Create the book' : 'Sign in'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.store});
  final BookStore store;
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int tab = 0;
  int? monthYear;
  int? month;
  int? fyYear;

  Future<void> _opening() async {
    final current = widget.store.books.cast<Map<String, dynamic>?>().firstWhere((book) => book?['id'] == widget.store.api.bookId, orElse: () => null);
    final field = TextEditingController(text: '${current?['openingBalance'] ?? '0.00'}');
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Opening balance'),
        content: TextField(controller: field, keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true), decoration: const InputDecoration(prefixText: '₹ ')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
        ],
      ),
    );
    if (saved != true) return;
    final paise = toPaise(field.text);
    if (paise == null) return;
    try {
      await widget.store.api.send('PUT', '/api/settings', body: {'openingBalance': paiseToAmount(paise)}, withBook: true);
      await widget.store.loadBooks();
      widget.store.bump();
    } on ApiException catch (err) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err.message)));
    }
  }

  Future<void> _newBook() async {
    final field = TextEditingController();
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New book'),
        content: TextField(controller: field, decoration: const InputDecoration(labelText: 'Name')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Create')),
        ],
      ),
    );
    if (saved != true || field.text.trim().isEmpty) return;
    try {
      final created = await widget.store.api.send('POST', '/api/books', body: {'name': field.text.trim()});
      await widget.store.loadBooks();
      await widget.store.chooseBook(created['id'] as int);
      widget.store.bump();
    } on ApiException catch (err) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final titles = ['Balancio', 'This month', 'This year', 'Reports'];
    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          Image.asset('assets/logo.png', height: 32),
          const SizedBox(width: 10),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(titles[tab], style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            Text(widget.store.bookName, style: const TextStyle(fontSize: 12, color: Color(0xFFD6E4F5))),
          ]),
        ]),
        actions: [
          PopupMenuButton<String>(
            onSelected: (value) async {
              if (value == 'opening') return _opening();
              if (value == 'new') return _newBook();
              if (value == 'logout') return widget.store.logout();
              if (value.startsWith('book:')) {
                await widget.store.chooseBook(int.parse(value.substring(5)));
                widget.store.bump();
              }
            },
            itemBuilder: (context) => [
              for (final book in widget.store.books)
                PopupMenuItem(value: 'book:${book['id']}', child: Text('${book['name']}')),
              const PopupMenuDivider(),
              const PopupMenuItem(value: 'new', child: Text('New book')),
              const PopupMenuItem(value: 'opening', child: Text('Opening balance')),
              const PopupMenuItem(value: 'logout', child: Text('Sign out')),
            ],
          ),
        ],
      ),
      body: IndexedStack(
        index: tab,
        children: [
          OverviewPage(
            store: widget.store,
            onOpenMonth: (year, month) => setState(() {
              monthYear = year;
              this.month = month;
              tab = 1;
            }),
            onOpenYear: (year) => setState(() {
              fyYear = year;
              tab = 2;
            }),
          ),
          LedgerPage(store: widget.store, yearly: false, year: monthYear, month: month),
          LedgerPage(store: widget.store, yearly: true, year: fyYear),
          ReportsPage(store: widget.store),
        ],
      ),
      floatingActionButton: tab == 3
          ? null
          : Column(mainAxisSize: MainAxisSize.min, children: [
              FloatingActionButton.small(
                heroTag: 'paste',
                backgroundColor: Colors.white,
                foregroundColor: navy,
                onPressed: () async {
                  if (await showPasteSheet(context, widget.store)) widget.store.bump();
                },
                child: const Icon(Icons.content_paste),
              ),
              const SizedBox(height: 12),
              FloatingActionButton(
                heroTag: 'add',
                backgroundColor: navy,
                foregroundColor: Colors.white,
                onPressed: () async {
                  if (await showEntrySheet(context, widget.store)) widget.store.bump();
                },
                child: const Icon(Icons.add),
              ),
            ]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (index) => setState(() => tab = index),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet), label: 'On hand'),
          NavigationDestination(icon: Icon(Icons.calendar_month_outlined), selectedIcon: Icon(Icons.calendar_month), label: 'Month'),
          NavigationDestination(icon: Icon(Icons.date_range_outlined), selectedIcon: Icon(Icons.date_range), label: 'Year'),
          NavigationDestination(icon: Icon(Icons.summarize_outlined), selectedIcon: Icon(Icons.summarize), label: 'Reports'),
        ],
      ),
    );
  }
}
