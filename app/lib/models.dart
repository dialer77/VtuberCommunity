/// 백엔드 /api/lives 응답의 라이브 아이템.
class LiveItem {
  final String channelId;
  final String channelName;
  final String platform;
  final String title;
  final int viewers;
  final String channelUrl;

  const LiveItem({
    required this.channelId,
    required this.channelName,
    required this.platform,
    required this.title,
    required this.viewers,
    required this.channelUrl,
  });

  factory LiveItem.fromJson(Map<String, dynamic> j) => LiveItem(
    channelId: j['channelId'] as String? ?? '',
    channelName: j['channelName'] as String? ?? '',
    platform: j['platform'] as String? ?? '',
    title: j['title'] as String? ?? '',
    viewers: (j['viewers'] as num?)?.toInt() ?? 0,
    channelUrl: j['channelUrl'] as String? ?? '',
  );
}
