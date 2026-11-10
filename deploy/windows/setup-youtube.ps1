<#
  YouTube Data API 키 등록 (배포 PC, 관리자 PowerShell) — 키 발급 방법: docs\youtube-api.md

    powershell -ExecutionPolicy Bypass -File deploy\windows\setup-youtube.ps1

  하는 일
    1. 키 입력 (화면에 보이지 않음. 그냥 Enter 면 저장된 키를 다시 시험)
    2. YouTube 에 시험 요청 1회 (할당량 1 소모) → 키·제한 설정 확인
    3. server\.env 에 YOUTUBE_API_KEY 저장 → 서버 재시작

  붙여넣기: 이 창에서는 Ctrl+V 가 안 될 수 있다 → 마우스 오른쪽 클릭으로 붙여넣기.
  그래도 안 되면 키를 복사해 둔 상태에서 -FromClipboard 로 실행.

  옵션
    -FromClipboard  입력 대신 클립보드의 키를 사용
    -Disable        키 삭제 (YouTube 연동 끄기)
#>
param([switch]$Disable, [switch]$FromClipboard)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

function Step([string]$m) { Write-Host ''; Write-Host "== $m" -ForegroundColor Cyan }
function Ok([string]$m)   { Write-Host "   OK  $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "   !!  $m" -ForegroundColor Yellow }
function Fail([string]$m) { Write-Host "   XX  $m" -ForegroundColor Red; exit 1 }

if (-not (Test-IsAdmin)) { Fail '관리자 권한 PowerShell 에서 실행하세요.' }
if (-not (Test-Path $EnvFile)) { Fail ('server\.env 가 없습니다. setup.ps1 을 먼저 실행하세요: {0}' -f $EnvFile) }

function Restart-Server {
  $p = Get-ServerProcess
  if ($p) {
    Stop-ServerProcess $p
    Ok '서버 재시작 요청 (감독이 몇 초 안에 다시 띄움)'
  } else {
    Warn '서버가 실행 중이 아닙니다 — status.ps1 로 확인하세요.'
  }
}

if ($Disable) {
  Step 'YouTube 연동 끄기'
  Set-EnvValue 'YOUTUBE_API_KEY' ''
  Ok 'YOUTUBE_API_KEY 삭제'
  Restart-Server
  exit 0
}

# ------------------------------------------------------------------ 1. 키 입력
Step 'API 키 입력'
$saved = Get-EnvValue 'YOUTUBE_API_KEY'
$pasteHelp = 'Ctrl+V 대신 마우스 오른쪽 클릭으로 붙여넣거나, 키를 복사한 뒤 -FromClipboard 를 붙여 실행하세요.'
if ($FromClipboard) {
  $key = "$(Get-Clipboard -Raw)"
  Ok '클립보드에서 키를 읽었습니다.'
} else {
  Write-Host '   붙여넣기는 마우스 오른쪽 클릭 (Ctrl+V 는 이 창에서 안 될 수 있음). 별표(*)가 39개쯤 찍히면 정상.'
  $prompt = '   YouTube API 키 붙여넣고 Enter (화면에 보이지 않음)'
  if ($saved) { $prompt = '   새 키 붙여넣고 Enter — 그냥 Enter 면 저장된 키를 다시 시험 (화면에 보이지 않음)' }
  $sec = Read-Host $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
# 공백·줄바꿈·제어 문자(Ctrl+V 가 그대로 들어간 경우 등) 제거
$key = $key -replace '[\s\x00-\x1F\x7F]', ''
if (-not $key -and -not $FromClipboard) { $key = $saved }
if (-not $key) { Fail ('키가 비어 있습니다. {0}' -f $pasteHelp) }
if ($key -notmatch '^[A-Za-z0-9_-]{30,60}$') {
  Fail ('키 형식이 아닙니다 ({0}자). 붙여넣기가 제대로 안 된 것 같습니다. {1}' -f $key.Length, $pasteHelp)
}
if ($key -notmatch '^AIza[A-Za-z0-9_-]{35}$') { Warn ('보통 키는 AIza 로 시작하는 39자인데 {0}자입니다. 그대로 시험합니다.' -f $key.Length) }

# ------------------------------------------------------------------ 2. 시험 요청
Step '시험 요청 (YouTube 공식 채널 정보 1건, 할당량 1)'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$url = 'https://www.googleapis.com/youtube/v3/channels?part=snippet&id=UCBR8-60-B28hp2BmDPdntcQ'
$body = ''
$status = 0
try {
  # 키는 주소가 아닌 헤더로 보낸다 (프록시·로그에 남지 않게)
  $res = Invoke-WebRequest -Uri $url -Headers @{ 'X-Goog-Api-Key' = $key } -UseBasicParsing -TimeoutSec 20
  $status = [int]$res.StatusCode
  $body = $res.Content
} catch [System.Net.WebException] {
  if ($_.Exception.Response) {
    $status = [int]$_.Exception.Response.StatusCode
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $body = $reader.ReadToEnd()
  } else {
    Fail ('YouTube 에 연결하지 못했습니다: {0}' -f $_.Exception.Message)
  }
} catch {
  Fail ('시험 요청 실패: {0}' -f $_.Exception.Message)
}

if ($status -eq 200) {
  $title = ''
  try { $title = ($body | ConvertFrom-Json).items[0].snippet.title } catch { }
  Ok ('응답 정상 (채널: {0})' -f $title)
} else {
  if ($body -match 'API_KEY_INVALID|keyInvalid') {
    Fail '키가 올바르지 않습니다. 복사할 때 앞뒤가 잘리지 않았는지 확인하세요.'
  } elseif ($body -match 'SERVICE_DISABLED|accessNotConfigured') {
    Fail '이 프로젝트에서 YouTube Data API v3 가 사용 설정되지 않았습니다. 라이브러리에서 "사용" 을 누르고 몇 분 뒤 다시 실행하세요.'
  } elseif ($body -match 'API_KEY_HTTP_REFERRER_BLOCKED') {
    Fail '키에 "웹사이트(HTTP 리퍼러)" 제한이 걸려 있습니다. 서버에서 호출하므로 애플리케이션 제한을 "없음" 으로 바꾸세요.'
  } elseif ($body -match 'API_KEY_IP_ADDRESS_BLOCKED') {
    Fail '키의 IP 제한에 이 PC 의 공인 IP 가 없습니다. IP 를 추가하거나 애플리케이션 제한을 "없음" 으로 바꾸세요.'
  } elseif ($body -match 'API_KEY_SERVICE_BLOCKED') {
    Fail '키의 API 제한 목록에 YouTube Data API v3 가 없습니다. 키 수정 화면에서 추가하세요.'
  } elseif ($body -match 'quotaExceeded|RATE_LIMIT_EXCEEDED') {
    Warn '오늘 할당량을 다 썼습니다 (태평양 시간 자정, 한국 오후 4~5시에 초기화). 키는 저장합니다.'
  } else {
    $short = $body
    if ($short.Length -gt 400) { $short = $short.Substring(0, 400) }
    Fail ('예상하지 못한 응답 (HTTP {0}): {1}' -f $status, $short)
  }
}

# ------------------------------------------------------------------ 3. 저장·재시작
Step '설정 기록 (server\.env)'
Set-EnvValue 'YOUTUBE_API_KEY' $key
Ok 'YOUTUBE_API_KEY 저장'
& icacls $EnvFile /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
Ok 'server\.env 권한: SYSTEM·Administrators 전용'
Restart-Server

Write-Host ''
Write-Host '================ YouTube API 키 등록 완료 ================' -ForegroundColor Cyan
Write-Host '키는 이 PC 의 server\.env 에만 있습니다. 채팅·저장소·Vercel 에는 올리지 마세요.'
Write-Host '사용량 확인: Google Cloud 콘솔 → API 및 서비스 → YouTube Data API v3 → 할당량'
