import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:path_provider/path_provider.dart';

import 'api_client.dart';
import 'api_exception.dart';

// ─────────────────────────────────────────────
//  Client HTTP réel.
//
//  Le back authentifie par cookie de session (btp.sid), sans jeton : Dio le
//  garde dans un PersistCookieJar rangé dans l'espace privé de l'app, donc
//  un redémarrage retrouve la session — l'équivalent mobile de
//  `credentials: "include"` sur le web.
// ─────────────────────────────────────────────
class HttpApiClient implements ApiClient {
  HttpApiClient._(this._dio);

  final Dio _dio;

  static Future<HttpApiClient> create(String baseUrl) async {
    final dir = await getApplicationSupportDirectory();
    final jar = PersistCookieJar(storage: FileStorage('${dir.path}/.cookies/'));
    final dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        // Les erreurs HTTP sont lues dans l'enveloppe, pas levées par Dio.
        validateStatus: (_) => true,
        responseType: ResponseType.json,
      ),
    )..interceptors.add(CookieManager(jar));
    return HttpApiClient._(dio);
  }

  Future<ApiResponse> _send(String method, String path, Object? body) async {
    final Response<dynamic> response;
    try {
      response = await _dio.request<dynamic>(
        path,
        data: body,
        options: Options(method: method),
      );
    } on DioException {
      throw const ApiException('Serveur injoignable. Vérifiez votre connexion.', 0);
    }

    final payload = response.data is Map ? (response.data as Map).cast<String, dynamic>() : null;
    final status = response.statusCode ?? 0;
    final message = payload?['message'] as String? ?? '';

    if (status < 200 || status >= 300) {
      throw ApiException(
        message.isEmpty ? 'Une erreur est survenue.' : message,
        payload?['statusCode'] as int? ?? status,
      );
    }

    return ApiResponse(
      success: payload?['success'] as bool? ?? true,
      message: message,
      statusCode: payload?['statusCode'] as int? ?? status,
      data: payload?['data'],
    );
  }

  @override
  Future<ApiResponse> get(String path) => _send('GET', path, null);
  @override
  Future<ApiResponse> post(String path, [Object? body]) => _send('POST', path, body);
  @override
  Future<ApiResponse> put(String path, [Object? body]) => _send('PUT', path, body);
  @override
  Future<ApiResponse> patch(String path, [Object? body]) => _send('PATCH', path, body);
  @override
  Future<ApiResponse> delete(String path) => _send('DELETE', path, null);
}
