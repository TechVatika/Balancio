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
    final client = HttpClient();
    try {
      final request = await client.openUrl(method, _uri(path, query));
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      if (cookie != null) request.headers.set(HttpHeaders.cookieHeader, cookie!);
      if (body != null) {
        request.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
        request.add(utf8.encode(jsonEncode(body)));
      }
      final response = await request.close().timeout(const Duration(seconds: 20));
      final setCookie = response.headers[HttpHeaders.setCookieHeader];
      if (setCookie != null && setCookie.isNotEmpty) {
        cookie = setCookie.map((value) => value.split(';').first).join('; ');
      }
      final text = await response.transform(utf8.decoder).join();
      final decoded = text.isEmpty ? <String, dynamic>{} : jsonDecode(text);
      final data = decoded is Map<String, dynamic> ? decoded : <String, dynamic>{'value': decoded};
      if (response.statusCode >= 400) {
        throw ApiException(data['error'] is String ? data['error'] as String : 'Something went wrong.', response.statusCode);
      }
      return data;
    } on ApiException {
      rethrow;
    } on SocketException {
      throw ApiException('The Balancio server did not respond. Check the server address.', 0);
    } catch (error) {
      if (error is ApiException) rethrow;
      throw ApiException('The Balancio server did not respond. Check the server address.', 0);
    } finally {
      client.close(force: true);
    }
  }
}
