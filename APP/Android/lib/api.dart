import 'dart:async';
import 'dart:convert';
import 'dart:io';

class ApiException implements Exception {
  ApiException(this.message, this.status);
  final String message;
  final int status;
  @override
  String toString() => message;
}

class BalancioApi {
  BalancioApi(this.baseUrl);

  String baseUrl;
  String? cookie;
  int bookId = 1;

  HttpClient? _client;
  static const _connectTimeout = Duration(seconds: 3);
  static const _requestTimeout = Duration(seconds: 8);

  HttpClient get _http {
    return _client ??= HttpClient()
      ..connectionTimeout = _connectTimeout
      ..idleTimeout = const Duration(seconds: 30)
      ..autoUncompress = true;
  }

  void close() {
    _client?.close(force: true);
    _client = null;
  }

  Uri _uri(String path, [Map<String, String>? query]) {
    final uri = Uri.parse('$baseUrl$path');
    return uri.replace(queryParameters: {...uri.queryParameters, ...?query});
  }

  Map<String, String> _bookQuery([Map<String, String>? extra]) => {'book': '$bookId', ...?extra};

  Future<Map<String, dynamic>> get(String path, {Map<String, String>? query, bool withBook = false}) {
    return _send('GET', path, query: withBook ? _bookQuery(query) : query);
  }

  Future<Map<String, dynamic>> send(String method, String path, {Map<String, dynamic>? body, bool withBook = false}) {
    final payload = body == null
        ? null
        : withBook
            ? {...body, 'bookId': bookId}
            : body;
    return _send(method, path, body: payload);
  }

  Future<Map<String, dynamic>> _send(String method, String path, {Map<String, String>? query, Map<String, dynamic>? body}) async {
    try {
      final request = await _http.openUrl(method, _uri(path, query)).timeout(_connectTimeout);
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      request.headers.set(HttpHeaders.connectionHeader, 'keep-alive');
      if (cookie != null) request.headers.set(HttpHeaders.cookieHeader, cookie!);
      if (body != null) {
        final bytes = utf8.encode(jsonEncode(body));
        request.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
        request.contentLength = bytes.length;
        request.add(bytes);
      }
      final response = await request.close().timeout(_requestTimeout);
      final setCookie = response.headers[HttpHeaders.setCookieHeader];
      if (setCookie != null && setCookie.isNotEmpty) {
        cookie = setCookie.map((value) => value.split(';').first).join('; ');
      }
      final text = await response.transform(utf8.decoder).join().timeout(_requestTimeout);
      final decoded = text.isEmpty ? <String, dynamic>{} : jsonDecode(text);
      final data = decoded is Map<String, dynamic> ? decoded : <String, dynamic>{'value': decoded};
      if (response.statusCode >= 400) {
        throw ApiException(data['error'] is String ? data['error'] as String : 'Something went wrong.', response.statusCode);
      }
      return data;
    } on ApiException {
      rethrow;
    } on SocketException {
      throw ApiException('Couldn’t reach the book service. Check your connection and try again.', 0);
    } on TimeoutException {
      throw ApiException('The book service took too long to respond. Try again.', 0);
    } catch (error) {
      if (error is ApiException) rethrow;
      // Recreate client after unexpected transport failures.
      close();
      throw ApiException('Couldn’t reach the book service. Check your connection and try again.', 0);
    }
  }
}
