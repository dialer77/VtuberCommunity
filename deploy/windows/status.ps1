<#
  VMOA 백엔드 상태 확인 (배포 PC 에서 실행, 관리자 권장)
    powershell -ExecutionPolicy Bypass -File deploy\windows\status.ps1 [-Lines 30]
#>
param([int]$Lines = 15)
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')
$Conf = Get-DeployConfig
$port = Get-ServerPort

function Section([string]$t) { Write-Host ''; Write-Host "== $t" -ForegroundColor Cyan }

Section '작업 스케줄러 (감독)'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  $info = $task | Get-ScheduledTaskInfo
  Write-Host ('상태: {0} · 마지막 실행: {1} · 결과코드: {2}' -f $task.State, $info.LastRunTime, $info.LastTaskResult)
} else {
  Write-Host '등록 안 됨 (setup.ps1 실행 필요)' -ForegroundColor Yellow
}

Section '서버 프로세스'
$p = Get-ServerProcess
if ($p) {
  $since = ''
  try { $since = ' · 시작: {0:yyyy-MM-dd HH:mm:ss}' -f $p.StartTime } catch { }
  Write-Host ('실행 중 pid={0}{1}' -f $p.Id, $since) -ForegroundColor Green
} else {
  Write-Host '실행 중 아님' -ForegroundColor Yellow
}

Section '헬스체크'
$urls = @('http://localhost:{0}/health' -f $port)
if ($Conf.PublicHost) { $urls += ('https://{0}/health' -f $Conf.PublicHost) }
foreach ($u in $urls) {
  try {
    $h = Invoke-RestMethod $u -TimeoutSec 5
    Write-Host ('OK   {0}  ({1})' -f $u, $h.ts) -ForegroundColor Green
  } catch {
    Write-Host ('FAIL {0}  {1}' -f $u, $_.Exception.Message) -ForegroundColor Red
  }
}

Section 'Cloudflare 터널 (cloudflared 서비스)'
$svc = Get-Service -Name 'cloudflared' -ErrorAction SilentlyContinue
if ($svc) { Write-Host ('{0} (시작 유형: {1})' -f $svc.Status, $svc.StartType) } else { Write-Host '설치 안 됨' -ForegroundColor Yellow }

Section '코드 버전'
if ($Conf.GitExe) {
  $log = Invoke-Git @('log', '-1', '--date=short', '--format=%h %ad %s')
  Write-Host ($log.Output -join "`n")
}

Section ('감독 로그 (최근 {0}줄)' -f $Lines)
$sup = Join-Path $LogDir 'supervisor.log'
if (Test-Path $sup) { Get-Content $sup -Tail $Lines -Encoding UTF8 } else { Write-Host '(없음)' }

$latest = Get-ChildItem $LogDir -Filter 'server-*.log' -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -notlike '*.err.log' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latest) {
  Section ('서버 로그 {0} (최근 {1}줄)' -f $latest.Name, $Lines)
  Get-Content $latest.FullName -Tail $Lines -Encoding UTF8
  $errLog = $latest.FullName -replace '\.log$', '.err.log'
  if ((Test-Path $errLog) -and (Get-Item $errLog).Length -gt 0) {
    Section '서버 오류 로그'
    Get-Content $errLog -Tail $Lines -Encoding UTF8
  }
}
