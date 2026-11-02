<#
  VMOA 백엔드 재시작 (관리자 PowerShell)
    powershell -ExecutionPolicy Bypass -File deploy\windows\restart.ps1         # 서버(node)만 → 감독이 몇 초 안에 다시 띄움
    powershell -ExecutionPolicy Bypass -File deploy\windows\restart.ps1 -Full   # 감독까지 재시작 (스크립트 수정 직후 등)
#>
param([switch]$Full)
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')

if (-not (Test-IsAdmin)) { Write-Host '관리자 권한 PowerShell 에서 실행하세요.' -ForegroundColor Red; exit 1 }
if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
  Write-Host ('작업 {0} 이(가) 없습니다 — setup.ps1 먼저 실행' -f $TaskName) -ForegroundColor Red; exit 1
}

if ($Full) {
  Stop-ScheduledTask -TaskName $TaskName
  Stop-ServerProcess
  Start-Sleep -Seconds 2
  Start-ScheduledTask -TaskName $TaskName
  Write-Host '감독 + 서버 재시작 요청 완료' -ForegroundColor Green
} else {
  $p = Get-ServerProcess
  if ($p) {
    Stop-ServerProcess $p
    Write-Host ('서버(pid={0}) 종료 — 감독이 몇 초 안에 다시 띄웁니다' -f $p.Id) -ForegroundColor Green
  } else {
    Start-ScheduledTask -TaskName $TaskName
    Write-Host '서버가 실행 중이 아니어서 감독 작업을 시작했습니다' -ForegroundColor Yellow
  }
}
Write-Host '확인: powershell -ExecutionPolicy Bypass -File deploy\windows\status.ps1'
