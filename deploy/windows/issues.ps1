<#
  이슈 관리 (배포 PC). 서버와 같은 DB·설정(server\.env)을 쓴다.

    powershell -ExecutionPolicy Bypass -File deploy\windows\issues.ps1 status        # 자동 수집 상태·마지막 결과
    powershell -ExecutionPolicy Bypass -File deploy\windows\issues.ps1 list [개수]   # 최근 이슈 (숨김 포함)
    powershell -ExecutionPolicy Bypass -File deploy\windows\issues.ps1 hide <slug>   # 사이트에서 숨김 (즉시 반영)
    powershell -ExecutionPolicy Bypass -File deploy\windows\issues.ps1 show <slug>   # 다시 공개
    powershell -ExecutionPolicy Bypass -File deploy\windows\issues.ps1 run [시간]    # 지금 바로 수집
    powershell -ExecutionPolicy Bypass -File deploy\windows\issues.ps1 interval 720  # 자동 수집 주기(분) 바꾸기 — 관리자 권한, 서버 재시작
#>
param(
  [Parameter(Position = 0)][string]$Command = 'status',
  [Parameter(Position = 1)][string]$Arg = ''
)
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')
$Conf = Get-DeployConfig
if (-not $Conf.NodeExe) { Write-Host 'node.exe 를 찾을 수 없습니다 — setup.ps1 먼저 실행' -ForegroundColor Red; exit 1 }

# 수집 주기 바꾸기 (server\.env 의 ISSUES_INTERVAL_MIN). 이슈 수집과 키리누키 분류가 같은 Claude 구독을 나눠 쓴다
if ($Command -eq 'interval') {
  if (-not (Test-IsAdmin)) { Write-Host '관리자 권한 PowerShell 에서 실행하세요 (server\.env 수정).' -ForegroundColor Red; exit 1 }
  $min = 0
  if (-not [int]::TryParse($Arg, [ref]$min) -or $min -lt 60) {
    Write-Host ('지금 주기: {0}분. 바꾸려면 60 이상의 분을 적으세요 (예: interval 720 = 12시간)' -f (Get-EnvValue 'ISSUES_INTERVAL_MIN' '180')) -ForegroundColor Yellow
    exit 1
  }
  Set-EnvValue 'ISSUES_INTERVAL_MIN' ([string]$min)
  Write-Host ('이슈 자동 수집 주기: {0}분 ({1}시간)' -f $min, [math]::Round($min / 60, 1)) -ForegroundColor Green
  $p = Get-ServerProcess
  if ($p) { Stop-ServerProcess $p; Write-Host '서버 재시작 요청 (감독이 몇 초 안에 다시 띄움)' -ForegroundColor Green }
  exit 0
}

$nodeArgs = @('--env-file-if-exists=.env', '--disable-warning=ExperimentalWarning', '--import', 'tsx', 'src/issues/admin.ts', $Command)
if ($Arg) { $nodeArgs += $Arg }
Push-Location $ServerDir
try {
  & $Conf.NodeExe @nodeArgs
  $code = $LASTEXITCODE
} finally { Pop-Location }
exit $code
