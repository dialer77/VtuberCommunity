<#
  유튜브 공식 채널 매핑 관리 (배포 PC). 서버와 같은 DB·설정(server\.env)을 쓰고, 바꾼 내용은 바로 사이트에 반영된다.

    powershell -ExecutionPolicy Bypass -File deploy\windows\youtube.ps1 status                 # 연동 상태·매핑 개수·오늘 할당량
    powershell -ExecutionPolicy Bypass -File deploy\windows\youtube.ps1 list [상태] [개수]      # 상위 채널부터 매핑 결과 (상태: auto, manual, pending, nolink, none)
    powershell -ExecutionPolicy Bypass -File deploy\windows\youtube.ps1 pending                # 확인이 필요한 채널과 후보
    powershell -ExecutionPolicy Bypass -File deploy\windows\youtube.ps1 show "버튜버 이름"
    powershell -ExecutionPolicy Bypass -File deploy\windows\youtube.ps1 set "버튜버 이름" https://www.youtube.com/@핸들   # 공식 채널 확정
    powershell -ExecutionPolicy Bypass -File deploy\windows\youtube.ps1 none "버튜버 이름"     # 공식 채널 없음 (자동 연결 안 함)
    powershell -ExecutionPolicy Bypass -File deploy\windows\youtube.ps1 auto "버튜버 이름"     # 확정 해제 → 자동 추정으로
    powershell -ExecutionPolicy Bypass -File deploy\windows\youtube.ps1 run [개수]             # 지금 바로 매핑

  이름 대신 chzzk:<채널ID> 또는 soop:<아이디> 로 적어도 된다 (같은 이름이 여럿일 때).

  유튜브 전용 버튜버 (치지직·SOOP 채널 없이 유튜브에서 활동 — 7일마다 웹 수집으로 자동 추가)
    ... youtube.ps1 vtubers                    # 목록 (vtubers all = 제외한 것 포함, vtubers queue = 확인 대기)
    ... youtube.ps1 vtuber-add https://www.youtube.com/@핸들 "이름" ["소속"] [ko|foreign]   # 직접 추가 (해외면 foreign)
    ... youtube.ps1 vtuber-block "이름"         # 버튜버가 아니거나 잘못 찾은 채널 제외
    ... youtube.ps1 vtuber-ok "이름"            # 확인 (자동 수집이 덮어쓰지 않음)
    ... youtube.ps1 vtuber-name "이름" "새 이름"
    ... youtube.ps1 vtuber-discover             # 지금 바로 웹 수집 (Claude, 3~6분)

  노래 (공식 채널 커버·오리지널)
    ... youtube.ps1 songs [개수]                # 수집 상태 + 최근 노래
#>
param(
  [Parameter(Position = 0)][string]$Command = 'status',
  [Parameter(Position = 1)][string]$Arg = '',
  [Parameter(Position = 2)][string]$Arg2 = '',
  [Parameter(Position = 3)][string]$Arg3 = '',
  [Parameter(Position = 4)][string]$Arg4 = ''
)
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')
$Conf = Get-DeployConfig
if (-not $Conf.NodeExe) { Write-Host 'node.exe 를 찾을 수 없습니다 — setup.ps1 먼저 실행' -ForegroundColor Red; exit 1 }

$nodeArgs = @('--env-file-if-exists=.env', '--disable-warning=ExperimentalWarning', '--import', 'tsx', 'src/youtube/admin.ts', $Command)
if ($Arg) { $nodeArgs += $Arg }
if ($Arg2) { $nodeArgs += $Arg2 }
if ($Arg3) { $nodeArgs += $Arg3 }
if ($Arg4) { $nodeArgs += $Arg4 }
Push-Location $ServerDir
try {
  & $Conf.NodeExe @nodeArgs
  $code = $LASTEXITCODE
} finally { Pop-Location }
exit $code
