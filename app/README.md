# 버모아 VMOA — Flutter 앱 (스타터)

> ⚠️ **아직 빌드/검증 안 됨.** 이 폴더는 `lib/` 소스와 `pubspec.yaml`만 있는 스타터입니다.
> Flutter SDK가 설치돼 있지 않아(현재 환경) 플랫폼 폴더(android/ios 등) 생성과 빌드는 하지 못했습니다.
> 아래 절차로 SDK 설치 후 이어가면 됩니다.

## 무엇인가
백엔드(`server/`)의 REST API(`/api/lives`)를 소비해 **지금 방송 중인 버튜버 목록**을 보여주는 최소 앱.
웹과 **동일한 백엔드**를 쓰므로, 앱은 API만 바꿔 붙이면 됩니다.

## 실행 절차 (Flutter SDK 필요)
1. [Flutter SDK 설치](https://docs.flutter.dev/get-started/install) 후 `flutter --version` 확인.
2. 이 폴더에서 플랫폼 스캐폴딩 생성 (기존 `lib/`·`pubspec.yaml`은 유지됨):
   ```bash
   cd app
   flutter create .
   flutter pub get
   ```
3. 백엔드 실행 (별도 터미널):
   ```bash
   cd ../server && npm start   # http://localhost:4000
   ```
4. 앱 실행:
   ```bash
   flutter run
   ```
   - **Android 에뮬레이터**는 PC의 localhost를 `10.0.2.2`로 접근합니다(기본값 반영됨).
   - 실기기/다른 호스트는 주소를 주입:
     ```bash
     flutter run --dart-define=BACKEND_URL=http://<PC-IP>:4000
     ```

## 구조
```
app/
├─ pubspec.yaml        # 의존성: flutter, http
└─ lib/
   ├─ main.dart        # 앱 진입 + 라이브 목록 화면(FutureBuilder)
   ├─ api.dart         # 백엔드 /api/lives 조회 (BACKEND_URL dart-define)
   └─ models.dart      # LiveItem 모델
```

## 다음
- 데뷔/랭킹/급상승 탭 추가 (`/api/debuts`, `/api/ranking`, `/api/rising`)
- 방송 시작 푸시 알림 (앱의 강점)
- 광고는 AdSense가 아니라 **AdMob**(`google_mobile_ads`) 연동
