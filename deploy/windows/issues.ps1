<#
  이슈 관리 (배포 PC). 서버와 같은 DB·설정(server\.env)을 쓴다.

    powershell -ExecutionPolicy Bypass -File deploy\windows\issues.ps1 status        # 자동 수집 상태·마지막 결과
    powershell -ExecutionPolicy Bypass -File deploy\windows\issues.ps1 list [개수]   # 최근 이슈 (숨김 포함)
    powershell -ExecutionPolicy Bypass -File deploy\windows\issues.ps1 hide <slug>   # 사이트에서 숨김 (즉시 반영)
    powershell -ExecutionPolicy Bypass -File deploy\windows\issues.ps1 show <slug>   # 다시 공개
    powershell -ExecutionPolicy Bypass -File deploy\windows\issues.ps1 run [시간]    # 지금 바로 수집
#>
param(
  [Parameter(Position = 0)][string]$Command = 'status',
  [Parameter(Position = 1)][string]$Arg = ''
)
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')
$Conf = Get-DeployConfig
if (-not $Conf.NodeExe) { Write-Host 'node.exe 를 찾을 수 없습니다 — setup.ps1 먼저 실행' -ForegroundColor Red; exit 1 }

$nodeArgs = @('--env-file-if-exists=.env', '--disable-warning=ExperimentalWarning', '--import', 'tsx', 'src/issues/admin.ts', $Command)
if ($Arg) { $nodeArgs += $Arg }
Push-Location $ServerDir
try {
  & $Conf.NodeExe @nodeArgs
  $code = $LASTEXITCODE
} finally { Pop-Location }
exit $code
