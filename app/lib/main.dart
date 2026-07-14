import 'package:flutter/material.dart';
import 'api.dart';
import 'models.dart';

void main() => runApp(const VmoaApp());

const Color _accent = Color(0xFFDA1A63);
const Color _accentDark = Color(0xFFFF4C86);

class VmoaApp extends StatelessWidget {
  const VmoaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '버모아 VMOA',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: _accent, useMaterial3: true),
      darkTheme: ThemeData(
        brightness: Brightness.dark,
        colorSchemeSeed: _accentDark,
        useMaterial3: true,
      ),
      home: const LiveListPage(),
    );
  }
}

class LiveListPage extends StatefulWidget {
  const LiveListPage({super.key});

  @override
  State<LiveListPage> createState() => _LiveListPageState();
}

class _LiveListPageState extends State<LiveListPage> {
  late Future<List<LiveItem>> _future;

  @override
  void initState() {
    super.initState();
    _future = fetchLives();
  }

  Future<void> _refresh() async {
    setState(() {
      _future = fetchLives();
    });
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('지금 방송 중'),
        titleTextStyle: const TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w800,
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<LiveItem>>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snap.hasError) {
              return ListView(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text('불러오기 실패: ${snap.error}\n백엔드가 실행 중인지 확인하세요.'),
                  ),
                ],
              );
            }
            final lives = snap.data ?? const <LiveItem>[];
            if (lives.isEmpty) {
              return const Center(child: Text('방송 중인 버튜버가 없어요'));
            }
            return ListView.separated(
              itemCount: lives.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final l = lives[i];
                final initial = l.channelName.isNotEmpty
                    ? l.channelName.substring(0, 1)
                    : '?';
                return ListTile(
                  leading: CircleAvatar(child: Text(initial)),
                  title: Text(
                    l.channelName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  subtitle: Text(
                    l.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: Text(
                    '${l.viewers}명',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
