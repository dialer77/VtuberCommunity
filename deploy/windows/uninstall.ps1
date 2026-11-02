<#
  VMOA 백엔드 제거 (관리자 PowerShell). DB·로그(server\data)와 .env 는 남겨둔다.
    powershell -ExecutionPolicy Bypass -File deploy\windows\uninstall.ps1 [-RemoveTunnel]
#>
param([switch]$RemoveTunnel)
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')

if (-not (Test-IsAdmin)) { Write-Host '관리자 권한 PowerShell 에서 실행하세요.' -ForegroundColor Red; exit 1 }

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host ('작업 {0} 제거' -f $TaskName)
}
Stop-ServerProcess
Write-Host '서버 중지'

if ($RemoveTunnel) {
  $cf = Find-Exe 'cloudflared.exe'
  if (-not $cf) {
    foreach ($dir in @(${env:ProgramFiles(x86)}, $env:ProgramFiles)) {
      if ($dir -and (Test-Path (Join-Path $dir 'cloudflared\cloudflared.exe'))) { $cf = Join-Path $dir 'cloudflared\cloudflared.exe' }
    }
  }
  if ($cf) { & $cf service uninstall; Write-Host '터널 서비스 제거' } else { Write-Host 'cloudflared 를 찾지 못함' }
}
Write-Host ('남겨둔 것: {0} (DB·로그), {1}' -f $DataDir, $EnvFile)
