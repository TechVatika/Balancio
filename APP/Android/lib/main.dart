import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'account_page.dart';
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
          if (store.booting) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
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
  final password = TextEditingController(text: 'balancio123');
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
        if (password.text.length < 8) throw ApiException('Use a password with at least 8 characters.', 400);
        if (password.text != confirm.text) throw ApiException('Those passwords don’t match.', 400);
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
                  Eyebrow(setup ? 'Before the first entry' : 'Balancio', light: true),
                  const SizedBox(height: 8),
                  Text(
                    setup ? 'Set an account password' : 'Sign in',
                    style: const TextStyle(fontFamily: fontDisplay, color: Colors.white, fontSize: 32, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    setup
                        ? 'This protects the whole book. Choose a password you’ll remember — there’s no recovery if it’s lost.'
                        : 'Your money, in balance.',
                    style: const TextStyle(color: Color(0xFFD6E4F5)),
                  ),
                  const SizedBox(height: 24),
                  TextField(
                    controller: server,
                    style: const TextStyle(color: navy),
                    decoration: const InputDecoration(
                      labelText: 'Server',
                      helperText: 'Default: http://192.168.31.70:4000 (your PC on Wi‑Fi). Emulator: http://10.0.2.2:4000.',
                      helperMaxLines: 2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: password,
                    obscureText: true,
                    style: const TextStyle(color: navy),
                    decoration: InputDecoration(
                      labelText: 'Password',
                      hintText: setup ? 'At least 8 characters' : '••••••••',
                    ),
                  ),
                  if (setup) ...[
                    const SizedBox(height: 12),
                    TextField(
                      controller: confirm,
                      obscureText: true,
                      style: const TextStyle(color: navy),
                      decoration: const InputDecoration(labelText: 'Confirm password'),
                    ),
                  ],
                  if (error.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(error, style: const TextStyle(color: Color(0xFFFFD0CC))),
                    ),
                  const SizedBox(height: 16),
                  FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: navy),
                    onPressed: busy ? null : submit,
                    child: Text(busy ? (setup ? 'Saving…' : 'Signing in…') : setup ? 'Set password and continue' : 'Sign in'),
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

  static const titles = [
    'Overview',
    'Month ledger',
    'Year ledger',
    'Reports',
    'Account',
  ];

  Future<void> _opening() async {
    final current = widget.store.activeBook;
    final field = TextEditingController(text: '${current?['openingBalance'] ?? widget.store.meta?['openingBalance'] ?? '0.00'}');
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Opening balance'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Eyebrow('Before the first entry'),
            const SizedBox(height: 8),
            const Text('This is the balance already on hand before any line in Balancio. Every later balance starts from here.', style: TextStyle(color: muted)),
            const SizedBox(height: 12),
            TextField(
              controller: field,
              keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
              decoration: const InputDecoration(labelText: 'Amount', prefixText: '₹ '),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save balance')),
        ],
      ),
    );
    if (saved != true) return;
    final paise = toPaise(field.text);
    if (paise == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Enter the opening balance as a number. Use a minus if the book starts overdrawn.')),
        );
      }
      return;
    }
    try {
      await widget.store.saveOpeningBalance(paiseToAmount(paise));
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Opening balance saved.')));
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
        content: TextField(controller: field, decoration: const InputDecoration(hintText: 'e.g. Petty Cash')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Create')),
        ],
      ),
    );
    if (saved != true || field.text.trim().isEmpty) return;
    try {
      await widget.store.createBook(field.text.trim());
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Book created.')));
    } on ApiException catch (err) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err.message)));
    }
  }

  bool get showFab => tab == 0 || tab == 1 || tab == 2;

  @override
  Widget build(BuildContext context) {
    final balance = widget.store.meta?['balance'] ?? widget.store.activeBook?['openingBalance'] ?? '0.00';
    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          Image.asset('assets/logo.png', height: 32),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(titles[tab], style: const TextStyle(fontFamily: fontDisplay, fontSize: 18, fontWeight: FontWeight.w700)),
              Text(
                '${widget.store.bookName} · Your money, in balance.',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12, color: Color(0xFFD6E4F5), fontFamily: fontSans),
              ),
            ]),
          ),
        ]),
        actions: [
          TextButton(
            onPressed: _opening,
            child: AmountText(balance, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
          ),
          PopupMenuButton<String>(
            tooltip: 'Book',
            onSelected: (value) async {
              if (value == 'opening') return _opening();
              if (value == 'new') return _newBook();
              if (value == 'logout') return widget.store.logout();
              if (value.startsWith('book:')) {
                await widget.store.chooseBook(int.parse(value.substring(5)));
              }
            },
            itemBuilder: (context) => [
              for (final book in widget.store.books)
                PopupMenuItem(
                  value: 'book:${book['id']}',
                  child: Text('${book['name']}${book['id'] == widget.store.api.bookId ? ' · active' : ''}'),
                ),
              const PopupMenuDivider(),
              const PopupMenuItem(value: 'new', child: Text('+ New book')),
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
            onOpenReports: () => setState(() => tab = 3),
            onAddEntry: () async {
              if (await showEntrySheet(context, widget.store)) widget.store.bump();
            },
          ),
          LedgerPage(store: widget.store, yearly: false, year: monthYear, month: month),
          LedgerPage(store: widget.store, yearly: true, year: fyYear),
          ReportsPage(store: widget.store),
          AccountPage(store: widget.store),
        ],
      ),
      floatingActionButton: !showFab
          ? null
          : FloatingActionButton(
              heroTag: 'add',
              backgroundColor: navy,
              foregroundColor: Colors.white,
              tooltip: 'Add entry',
              onPressed: () async {
                if (await showEntrySheet(context, widget.store)) widget.store.bump();
              },
              child: const Icon(Icons.add),
            ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (index) => setState(() => tab = index),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet), label: 'Overview'),
          NavigationDestination(icon: Icon(Icons.calendar_month_outlined), selectedIcon: Icon(Icons.calendar_month), label: 'Month'),
          NavigationDestination(icon: Icon(Icons.date_range_outlined), selectedIcon: Icon(Icons.date_range), label: 'Year'),
          NavigationDestination(icon: Icon(Icons.summarize_outlined), selectedIcon: Icon(Icons.summarize), label: 'Reports'),
          NavigationDestination(icon: Icon(Icons.manage_accounts_outlined), selectedIcon: Icon(Icons.manage_accounts), label: 'Account'),
        ],
      ),
    );
  }
}
