<#
  키리누키(팬 편집 클립) 관리 (배포 PC). 서버와 같은 DB·설정(server\.env)을 쓰고, 바꾼 내용은 바로 사이트에 반영된다.

    powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 status                 # 수집 상태·채널/클립 개수·오늘 검색 횟수
    powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 channels [상태] [개수]  # 키리누키 채널 (상태: auto, approved, blocked)
    powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 recent [개수]           # 최근 분류된 클립
    powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 block "채널 이름"       # 차단 (클립도 사이트에서 빠짐)
    powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 unblock UC...           # 차단 해제 → 승인
    powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 add https://www.youtube.com/@채널 "버튜버 이름"   # 직접 추가
    powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 discover [개수]         # 지금 바로 채널 찾기 (search.list)
    powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 classify                # 지금 바로 분류 1회 (Claude) — 새 클립이 없으면 예전 분류 보강
    powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 enrich                  # 지금 바로 예전 분류 보강 1회 (대표 순간·주제 통일·사건)
    powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 topics [개수]           # 많이 쓰인 주제 이름 (같은 게임이 다른 이름으로 갈렸는지)
    powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 alias 마크 마인크래프트   # 주제 이름 통일 (기존 클립에도 반영)
    powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 events [일수]           # 최근 사건·밈 이름과 클립 수
    powershell -ExecutionPolicy Bypass -File deploy\windows\clips.ps1 recstats [일수]         # 추천 묶음별 노출·열기·재생·클릭률 (익명 합계)
#>
param(
  [Parameter(Position = 0)][string]$Command = 'status',
  [Parameter(Position = 1)][string]$Arg = '',
  [Parameter(Position = 2)][string]$Arg2 = ''
)
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')
$Conf = Get-DeployConfig
if (-not $Conf.NodeExe) { Write-Host 'node.exe 를 찾을 수 없습니다 — setup.ps1 먼저 실행' -ForegroundColor Red; exit 1 }

$nodeArgs = @('--env-file-if-exists=.env', '--disable-warning=ExperimentalWarning', '--import', 'tsx', 'src/clips/admin.ts', $Command)
if ($Arg) { $nodeArgs += $Arg }
if ($Arg2) { $nodeArgs += $Arg2 }
Push-Location $ServerDir
try {
  & $Conf.NodeExe @nodeArgs
  $code = $LASTEXITCODE
} finally { Pop-Location }
exit $code
