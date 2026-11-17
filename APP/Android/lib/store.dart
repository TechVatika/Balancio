import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';

String defaultServer() => 'http://192.168.31.70:4000';

class BookStore extends ChangeNotifier {
  BookStore(this.prefs) : api = BalancioApi(prefs.getString('server') ?? defaultServer()) {
    api.cookie = prefs.getString('cookie');
    api.bookId = prefs.getInt('book') ?? 1;
  }

  final SharedPreferences prefs;
  final BalancioApi api;

  bool configured = false;
  bool authenticated = false;
  bool booting = true;
  String? bootError;
  List<Map<String, dynamic>> books = [];
  Map<String, dynamic>? meta;
  int tick = 0;

  void bump() {
    tick += 1;
    notifyListeners();
  }

  Future<void> boot() async {
    booting = true;
    bootError = null;
    notifyListeners();
    try {
      final status = await api.get('/api/auth/status');
      configured = status['configured'] == true;
      authenticated = status['authenticated'] == true;
      if (authenticated) {
        await loadBooks();
        await loadMeta();
      }
    } on ApiException catch (error) {
      if (error.status == 401) {
        authenticated = false;
      } else {
        bootError = error.message;
      }
    } catch (error) {
      bootError = '$error';
    } finally {
      booting = false;
      notifyListeners();
    }
  }

  Future<void> setServer(String value) async {
    final trimmed = value.trim().replaceAll(RegExp(r'/+$'), '');
    api.baseUrl = trimmed;
    api.cookie = null;
    await prefs.setString('server', trimmed);
    await prefs.remove('cookie');
    await boot();
  }

  Future<void> setup(String password) async {
    await api.send('POST', '/api/auth/setup', body: {'password': password});
    await prefs.setString('cookie', api.cookie ?? '');
    configured = true;
    authenticated = true;
    await loadBooks();
    await loadMeta();
    notifyListeners();
  }

  Future<void> login(String password) async {
    await api.send('POST', '/api/auth/login', body: {'password': password});
    await prefs.setString('cookie', api.cookie ?? '');
    authenticated = true;
    await loadBooks();
    await loadMeta();
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await api.send('POST', '/api/auth/logout');
    } catch (_) {}
    api.cookie = null;
    authenticated = false;
    meta = null;
    await prefs.remove('cookie');
    notifyListeners();
  }

  Future<void> changePassword(String currentPassword, String newPassword) async {
    await api.send('POST', '/api/auth/change-password', body: {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
  }

  Future<void> loadBooks() async {
    final data = await api.get('/api/books');
    books = (data['books'] as List? ?? []).cast<Map<String, dynamic>>();
    if (books.isNotEmpty && books.every((book) => book['id'] != api.bookId)) {
      api.bookId = books.first['id'] as int;
      await prefs.setInt('book', api.bookId);
    }
  }

  Future<void> loadMeta() async {
    try {
      meta = await api.get('/api/meta', withBook: true);
    } on ApiException {
      meta = null;
    }
  }

  Future<void> chooseBook(int id) async {
    api.bookId = id;
    await prefs.setInt('book', id);
    await loadMeta();
    bump();
  }

  Future<Map<String, dynamic>> createBook(String name) async {
    final created = await api.send('POST', '/api/books', body: {'name': name});
    await loadBooks();
    await chooseBook(created['id'] as int);
    return created;
  }

  Future<void> renameBook(int id, String name) async {
    await api.send('PUT', '/api/books/$id', body: {'name': name});
    await loadBooks();
    bump();
  }

  Future<void> deleteBook(int id) async {
    await api.send('DELETE', '/api/books/$id');
    await loadBooks();
    if (api.bookId == id && books.isNotEmpty) {
      await chooseBook(books.first['id'] as int);
    } else {
      bump();
    }
  }

  Future<void> saveOpeningBalance(String amount) async {
    await api.send('PUT', '/api/settings', body: {'openingBalance': amount}, withBook: true);
    await loadBooks();
    await loadMeta();
    bump();
  }

  String get bookName {
    for (final book in books) {
      if (book['id'] == api.bookId) return '${book['name']}';
    }
    return 'Balancio';
  }

  Map<String, dynamic>? get activeBook {
    for (final book in books) {
      if (book['id'] == api.bookId) return book;
    }
    return null;
  }

  String get balanceLabel {
    final balance = meta?['balance'] ?? activeBook?['openingBalance'] ?? '0.00';
    return '$balance';
  }
}
