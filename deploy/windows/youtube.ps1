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

$nodeArgs = @('--env-file-if-exists=.env', '--disable-warning=ExperimentalWarning', '--import', 'tsx', 'src/youtube/admin.ts', $Command)
if ($Arg) { $nodeArgs += $Arg }
if ($Arg2) { $nodeArgs += $Arg2 }
Push-Location $ServerDir
try {
  & $Conf.NodeExe @nodeArgs
  $code = $LASTEXITCODE
} finally { Pop-Location }
exit $code
