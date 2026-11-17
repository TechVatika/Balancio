import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'secure_config.dart';

/// Obfuscated session vault (no extra native plugin).
/// Cookie is XOR-masked + base64 before SharedPreferences — not plaintext.
class SessionVault {
  SessionVault(this.prefs);

  final SharedPreferences prefs;
  static const _sessionKey = 'b_sess';

  // Split key material so a single string search won't reveal it.
  static const _k1 = <int>[0x3C, 0x91, 0xA7, 0x12, 0x5E, 0x88, 0xF4, 0x2B];
  static const _k2 = <int>[0x67, 0xD0, 0x19, 0xBE, 0x4C, 0xE3, 0x0A, 0x95];

  List<int> get _key => [..._k1, ..._k2];

  String _seal(String plain) {
    final key = _key;
    final data = utf8.encode(plain);
    final out = List<int>.generate(data.length, (i) => data[i] ^ key[i % key.length]);
    return base64Url.encode(out);
  }

  String? _open(String sealed) {
    try {
      final key = _key;
      final data = base64Url.decode(sealed);
      final out = List<int>.generate(data.length, (i) => data[i] ^ key[i % key.length]);
      return utf8.decode(out);
    } catch (_) {
      return null;
    }
  }

  Future<String?> readSession() async {
    final sealed = prefs.getString(_sessionKey);
    if (sealed == null || sealed.isEmpty) return null;
    return _open(sealed);
  }

  Future<void> writeSession(String? value) async {
    if (value == null || value.isEmpty) {
      await prefs.remove(_sessionKey);
      return;
    }
    await prefs.setString(_sessionKey, _seal(value));
  }

  Future<void> clearSession() async {
    await prefs.remove(_sessionKey);
  }

  /// Move old plaintext SharedPreferences secrets into the vault, then wipe them.
  Future<void> migrateAndScrub() async {
    final oldCookie = prefs.getString('cookie');
    if (oldCookie != null && oldCookie.isNotEmpty) {
      final current = await readSession();
      if (current == null || current.isEmpty) {
        await writeSession(oldCookie);
      }
    }

    final oldBook = prefs.getInt('book');
    if (oldBook != null && prefs.getInt(SecureConfig.prefBook) == null) {
      await prefs.setInt(SecureConfig.prefBook, oldBook);
    }

    final oldConfigured = prefs.getBool('configured');
    if (oldConfigured != null && prefs.getBool(SecureConfig.prefConfigured) == null) {
      await prefs.setBool(SecureConfig.prefConfigured, oldConfigured);
    }

    for (final key in SecureConfig.legacyKeys) {
      await prefs.remove(key);
    }
  }
}
