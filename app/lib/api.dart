import 'dart:convert';
import 'package:http/http.dart' as http;
import 'models.dart';

/// 백엔드 주소.
/// - Android 에뮬레이터에서 PC의 localhost는 10.0.2.2 로 접근한다.
/// - 실기기/배포에서는 --dart-define=BACKEND_URL=... 로 주입.
const String baseUrl = String.fromEnvironment(
  'BACKEND_URL',
  defaultValue: 'http://10.0.2.2:4000',
);

Future<List<LiveItem>> fetchLives() async {
  final res = await http.get(Uri.parse('$baseUrl/api/lives'));
  if (res.statusCode != 200) {
    throw Exception('API ${res.statusCode}');
  }
  final json = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
  final list = (json['lives'] as List<dynamic>?) ?? <dynamic>[];
  return list.map((e) => LiveItem.fromJson(e as Map<String, dynamic>)).toList();
}
