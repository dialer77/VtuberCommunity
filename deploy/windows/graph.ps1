<#
  관계 그래프 관리 (배포 PC) — 버튜버·소속사·게임·사건·이슈 사이의 연결. 바꾼 내용은 서버가 30분 안에 다시 읽는다.

    powershell -ExecutionPolicy Bypass -File deploy\windows\graph.ps1 status                          # 점·선 개수, 못 이은 이슈 이름 수
    powershell -ExecutionPolicy Bypass -File deploy\windows\graph.ps1 show "버튜버·게임·사건 이름"        # 그 대상의 관계도
    powershell -ExecutionPolicy Bypass -File deploy\windows\graph.ps1 issues                          # 이슈에 적혔지만 버튜버로 잇지 못한 이름
    powershell -ExecutionPolicy Bypass -File deploy\windows\graph.ps1 alias-add "리코" "유즈하 리코"     # 검색어(애칭·줄임말)를 대상에 잇기
    powershell -ExecutionPolicy Bypass -File deploy\windows\graph.ps1 alias-del "리코"
    powershell -ExecutionPolicy Bypass -File deploy\windows\graph.ps1 aliases                         # 이어 둔 검색어 목록
    powershell -ExecutionPolicy Bypass -File deploy\windows\graph.ps1 unlink "버튜버A" "버튜버B" collab   # 잘못된 관계 막기 (link 로 더하기, reset 으로 되돌리기)

  관계 종류: member(소속) · collab(합방) · plays(게임) · event(사건) · about(사건-게임) · mentions(이슈)
  이름이 여럿이면 점 id 로: v:chzzk:<채널ID> · a:<소속사> · g:<게임> · e:<사건> · i:<이슈>
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

$nodeArgs = @('--env-file-if-exists=.env', '--disable-warning=ExperimentalWarning', '--import', 'tsx', 'src/graph/admin.ts', $Command)
if ($Arg) { $nodeArgs += $Arg }
if ($Arg2) { $nodeArgs += $Arg2 }
if ($Arg3) { $nodeArgs += $Arg3 }
Push-Location $ServerDir
try {
  & $Conf.NodeExe @nodeArgs
  $code = $LASTEXITCODE
} finally { Pop-Location }
exit $code
