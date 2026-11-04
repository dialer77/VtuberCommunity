<#
  이슈 자동 수집 켜기 (배포 PC, 관리자 PowerShell) — 자세한 설명: docs\issue-collector.md
  Claude 구독(Pro/Max) 으로 동작한다. API 키는 쓰지 않는다.

    powershell -ExecutionPolicy Bypass -File deploy\windows\setup-issues.ps1

  하는 일
    1. Claude Code 확인 (없으면 공식 설치 스크립트로 설치)
    2. 구독 인증 토큰 발급 (claude setup-token → 브라우저 로그인) → server\.env 에 저장
    3. ISSUES_ENABLED=1 등 설정 기록
    4. 시험 수집 1회 (약 1~3분) → 성공하면 서버 재시작 → 이후 3시간마다 자동 수집

  옵션
    -RenewToken  토큰 다시 발급 (만료·계정 변경 시)
    -SkipTest    시험 수집 생략
    -Disable     자동 수집 끄기
#>
param(
  [switch]$RenewToken,
  [switch]$SkipTest,
  [switch]$Disable
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

function Step([string]$m) { Write-Host ''; Write-Host "== $m" -ForegroundColor Cyan }
function Ok([string]$m)   { Write-Host "   OK  $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "   !!  $m" -ForegroundColor Yellow }
function Fail([string]$m) { Write-Host "   XX  $m" -ForegroundColor Red; exit 1 }

if (-not (Test-IsAdmin)) { Fail '관리자 권한 PowerShell 에서 실행하세요.' }
if (-not (Test-Path $EnvFile)) { Fail ('server\.env 가 없습니다. setup.ps1 을 먼저 실행하세요: {0}' -f $EnvFile) }
$Conf = Get-DeployConfig
if (-not $Conf.NodeExe) { Fail 'node.exe 를 찾을 수 없습니다. setup.ps1 을 먼저 실행하세요.' }

function Restart-Server {
  $p = Get-ServerProcess
  if ($p) {
    Stop-ServerProcess $p
    Ok '서버 재시작 요청 (감독이 몇 초 안에 다시 띄움)'
  } else {
    Warn '서버가 실행 중이 아닙니다 — status.ps1 로 확인하세요.'
  }
}

if ($Disable) {
  Step '이슈 자동 수집 끄기'
  Set-EnvValue 'ISSUES_ENABLED' '0'
  Ok 'ISSUES_ENABLED=0'
  Restart-Server
  exit 0
}

# ------------------------------------------------------------------ 1. Claude Code
Step 'Claude Code'
function Find-Claude {
  $cands = @(
    (Join-Path $env:USERPROFILE '.local\bin\claude.exe'),
    (Join-Path $env:APPDATA 'npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe')
  )
  $cmd = Get-Command claude.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd) { $cands += $cmd.Source }
  foreach ($c in $cands) { if ($c -and (Test-Path $c)) { return (Resolve-Path $c).Path } }
  return ''
}
$claude = Find-Claude
if (-not $claude) {
  Warn 'Claude Code 가 없어 공식 설치 스크립트로 설치합니다 (https://claude.ai/install.ps1)'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-RestMethod 'https://claude.ai/install.ps1' | Invoke-Expression
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  $claude = Find-Claude
}
if (-not $claude) { Fail 'Claude Code 설치 후에도 claude.exe 를 찾지 못했습니다. 새 관리자 PowerShell 에서 다시 실행하세요.' }
$ver = "$(& $claude --version)".Trim()
Ok ('{0} ({1})' -f $claude, $ver)

# ------------------------------------------------------------------ 2. 구독 토큰
Step '구독 인증 토큰'
$token = Get-EnvValue 'CLAUDE_CODE_OAUTH_TOKEN'
if ($token -and -not $RenewToken) {
  Ok '이미 저장된 토큰 사용 (다시 발급: -RenewToken)'
} else {
  Write-Host '   브라우저가 열리면 Claude 구독 계정으로 로그인하세요.'
  Write-Host '   완료되면 이 창에 sk-ant-oat01- 로 시작하는 토큰이 표시됩니다 → 복사해 두세요.'
  & $claude setup-token
  $sec = Read-Host '   위에 표시된 토큰을 붙여넣고 Enter (화면에 보이지 않음)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  if (-not $token) { Fail '토큰이 비어 있습니다.' }
  if ($token -notlike 'sk-ant-*') { Warn '토큰 형식이 예상과 다릅니다 (sk-ant- 로 시작). 그대로 저장합니다.' }
  Set-EnvValue 'CLAUDE_CODE_OAUTH_TOKEN' $token
  Ok '토큰 저장 (server\.env)'
}

# ------------------------------------------------------------------ 3. 설정
Step '설정 기록 (server\.env)'
Set-EnvValue 'CLAUDE_BIN' $claude
Set-EnvValue 'ISSUES_ENABLED' '1'
if (-not (Get-EnvValue 'ISSUES_INTERVAL_MIN')) { Set-EnvValue 'ISSUES_INTERVAL_MIN' '180' }
# Windows 의 Claude Code 는 Git Bash 를 찾는다 — SYSTEM 계정에서도 찾을 수 있게 경로를 박아 둔다
$bash = Join-Path $env:ProgramFiles 'Git\bin\bash.exe'
if (Test-Path $bash) { Set-EnvValue 'CLAUDE_CODE_GIT_BASH_PATH' $bash }
Ok ('CLAUDE_BIN, ISSUES_ENABLED=1, 주기 {0}분' -f (Get-EnvValue 'ISSUES_INTERVAL_MIN'))
# 토큰이 들어 있으므로 .env 는 SYSTEM·Administrators 만 읽게 (서버는 SYSTEM, 관리 스크립트는 관리자 권한으로 실행)
& icacls $EnvFile /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
Ok 'server\.env 권한: SYSTEM·Administrators 전용'

# ------------------------------------------------------------------ 4. 시험 수집
if (-not $SkipTest) {
  Step '시험 수집 1회 (1~3분 걸림)'
  Push-Location $ServerDir
  try {
    & $Conf.NodeExe '--env-file-if-exists=.env' '--disable-warning=ExperimentalWarning' '--import' 'tsx' 'src/issues/admin.ts' 'run'
    $code = $LASTEXITCODE
  } finally { Pop-Location }
  if ($code -ne 0) {
    Warn '시험 수집 실패 — 위 오류를 확인하세요. 자동 수집은 켜 두었으니 서버에서 30분마다 다시 시도합니다.'
  } else {
    Ok '시험 수집 완료 (결과는 위 JSON — added 가 비어 있으면 이번엔 새 소식이 없던 것)'
  }
}

Restart-Server
Write-Host ''
Write-Host '================ 이슈 자동 수집 켜짐 ================' -ForegroundColor Cyan
Write-Host '사이트 확인 : https://vmoa.live/issue'
Write-Host '상태 확인   : powershell -ExecutionPolicy Bypass -File deploy\windows\issues.ps1 status'
Write-Host '이슈 목록   : powershell -ExecutionPolicy Bypass -File deploy\windows\issues.ps1 list'
Write-Host '이슈 숨기기 : powershell -ExecutionPolicy Bypass -File deploy\windows\issues.ps1 hide <slug>'
