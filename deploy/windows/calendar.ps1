<#
  기념일 캘린더 관리 (배포 PC) — 버튜버 생일·데뷔일. 서버와 같은 DB·설정(server\.env)을 쓰고, 바꾼 내용은 바로 사이트에 반영된다.

    powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 status                         # 찾은 생일·데뷔일 수, 남은 대상, 마지막 수집
    powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 list [found|missing] [개수]     # 찾은 것 / 못 찾은 것
    powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 show "버튜버 이름"               # 생일·데뷔일·출처
    powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 set "버튜버 이름" birthday 03-05     # 생일 정하기 (none = 없음)
    powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 set "버튜버 이름" debut 2023-04-01   # 데뷔일 정하기 (none = 없음)
    powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 auto "버튜버 이름"               # 운영자 입력 해제 → 다시 자동으로
    powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 run [개수]                       # 지금 바로 웹 수집 (Claude, 몇 분)
    powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 month [2026-12]                  # 그 달의 기념일
    powershell -ExecutionPolicy Bypass -File deploy\windows\calendar.ps1 upcoming [14]                    # 오늘부터 다가오는 기념일

  공식 SNS 링크·팬아트 해시태그 (프로필 'SNS·팬아트' 탭)
    ... calendar.ps1 links "버튜버 이름"                          # 프로필에 보일 링크·커뮤니티·태그
    ... calendar.ps1 link-add "버튜버 이름" https://x.com/계정     # 공식 링크 추가 (link-del 로 빼기)
    ... calendar.ps1 tag-add "버튜버 이름" "#리코아트" fanart       # 공식 해시태그 추가 (tag-del 로 빼기, 종류: fanart·clip·stream·other)
    ... calendar.ps1 social-auto "버튜버 이름"                    # 링크·태그 수정 해제 → 다시 자동으로

  이름 대신 chzzk:<채널ID> · soop:<아이디> · youtube:UC… 로 적어도 된다 (같은 이름이 여럿일 때).
#>
param(
  [Parameter(Position = 0)][string]$Command = 'status',
  [Parameter(Position = 1)][string]$Arg = '',
  [Parameter(Position = 2)][string]$Arg2 = '',
  [Parameter(Position = 3)][string]$Arg3 = ''
)
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')
$Conf = Get-DeployConfig
if (-not $Conf.NodeExe) { Write-Host 'node.exe 를 찾을 수 없습니다 — setup.ps1 먼저 실행' -ForegroundColor Red; exit 1 }

$nodeArgs = @('--env-file-if-exists=.env', '--disable-warning=ExperimentalWarning', '--import', 'tsx', 'src/calendar/admin.ts', $Command)
if ($Arg) { $nodeArgs += $Arg }
if ($Arg2) { $nodeArgs += $Arg2 }
if ($Arg3) { $nodeArgs += $Arg3 }
Push-Location $ServerDir
try {
  & $Conf.NodeExe @nodeArgs
  $code = $LASTEXITCODE
} finally { Pop-Location }
exit $code
