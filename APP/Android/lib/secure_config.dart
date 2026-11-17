import 'dart:convert';

/// Runtime config kept out of plain string literals in the binary.
///
/// Override at build time without baking a readable URL into source:
/// `flutter build apk --dart-define=BALANCIO_API=https://your.host`
class SecureConfig {
  SecureConfig._();

  // Opaque local preference keys (not human-readable labels).
  static const prefBook = 'b_ctx';
  static const prefConfigured = 'b_rdy';

  // Legacy keys to scrub from older installs.
  static const legacyKeys = ['server', 'cookie', 'book', 'configured'];

  /// XOR-masked endpoint bytes (not a plaintext URL in source).
  static const _mask = 0xA5;
  static const _ep = <int>[
    205, 209, 209, 213, 159, 138, 138, 148, 156, 151, 139, 148, 147,
    157, 139, 150, 148, 139, 146, 149, 159, 145, 149, 149, 149,
  ];

  static String endpoint() {
    const fromEnv = String.fromEnvironment('BALANCIO_API');
    if (fromEnv.isNotEmpty) return fromEnv.replaceAll(RegExp(r'/+$'), '');
    return utf8.decode(_ep.map((b) => b ^ _mask).toList(growable: false));
  }
}
