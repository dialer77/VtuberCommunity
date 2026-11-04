<#
  VMOA 백엔드 — 배포 PC 1회 설치 (Windows 10/11)
  관리자 PowerShell 에서 저장소 루트로 이동 후 실행:

    cd C:\vmoa
    powershell -ExecutionPolicy Bypass -File deploy\windows\setup.ps1 `
      -SeedDb "$env:USERPROFILE\Desktop\vmoa-seed.db" -TunnelCredFile "$env:USERPROFILE\Desktop\vmoa-tunnel.json"
    (-PublicHost 기본값은 api.vmoa.live — 다른 주소를 쓸 때만 지정)

  터널 지정 방식 (둘 중 하나)
    -TunnelCredFile : 개발 PC 에서 `cloudflared tunnel create` 로 만든 터널의 인증 JSON (현재 방식)
    -TunnelToken    : 대시보드에서 만든 터널의 토큰 (대안)

  하는 일 (다시 실행해도 안전 — 이미 된 단계는 유지)
    1. Node.js(24+) / Git 확인 (없으면 winget 으로 설치)
    2. server/.env 생성 (INTERNAL_SECRET 자동 생성) · deploy.json 기록
    3. 시드 DB 복사 (DB 가 아직 없을 때만)
    4. npm ci (server 의존성)
    5. 절전/최대절전 끔 (전원 연결 시)
    6. 작업 스케줄러 'VMOA-Server' 등록 → 부팅 시 자동 시작, SYSTEM 계정 (로그인 불필요)
    7. cloudflared 설치 + 터널 서비스 등록 (-TunnelCredFile 또는 -TunnelToken 지정 시)
#>
param(
  [string]$TunnelCredFile = '',
  [string]$TunnelToken = '',
  [string]$PublicHost = 'api.vmoa.live',
  [string]$SeedDb = '',
  [int]$Port = 4000,
  [string]$Branch = 'main',
  [switch]$SkipPowerConfig,
  [switch]$NoService   # 작업 스케줄러 등록/시작 생략 (테스트용)
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

function Step([string]$m) { Write-Host ''; Write-Host "== $m" -ForegroundColor Cyan }
function Ok([string]$m)   { Write-Host "   OK  $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "   !!  $m" -ForegroundColor Yellow }
function Fail([string]$m) { Write-Host "   XX  $m" -ForegroundColor Red; exit 1 }

function Update-PathFromRegistry {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Install-WithWinget([string]$Id, [string]$Label) {
  if (-not (Find-Exe 'winget.exe')) {
    Fail ('{0} 이(가) 없고 winget 도 없습니다. 직접 설치 후 새 PowerShell 에서 다시 실행하세요.' -f $Label)
  }
  Warn ('{0} 설치 중 (winget {1})...' -f $Label, $Id)
  & winget install --id $Id -e --silent --accept-package-agreements --accept-source-agreements | Out-Host
  Update-PathFromRegistry
}

function Find-Cloudflared {
  $p = Find-Exe 'cloudflared.exe'
  if ($p) { return $p }
  foreach ($dir in @(${env:ProgramFiles(x86)}, $env:ProgramFiles)) {
    if (-not $dir) { continue }
    $cand = Join-Path $dir 'cloudflared\cloudflared.exe'
    if (Test-Path $cand) { return $cand }
  }
  return ''
}

$needAdmin = (-not $NoService) -or (-not $SkipPowerConfig) -or [bool]$TunnelToken -or [bool]$TunnelCredFile
if ($TunnelCredFile -and $TunnelToken) { Fail '-TunnelCredFile 와 -TunnelToken 중 하나만 지정하세요.' }
if ($TunnelCredFile -and -not (Test-Path $TunnelCredFile)) { Fail ('터널 인증 파일이 없습니다: {0}' -f $TunnelCredFile) }
if ($needAdmin -and -not (Test-IsAdmin)) {
  Fail '관리자 권한이 필요합니다. 시작 메뉴에서 PowerShell 을 우클릭 → "관리자 권한으로 실행" 후 다시 실행하세요.'
}

# ------------------------------------------------------------------ 0. 저장소
Step '저장소 확인'
if (-not (Test-Path (Join-Path $RepoRoot '.git'))) { Fail ('git 저장소가 아닙니다: {0} (git clone 으로 받은 폴더에서 실행)' -f $RepoRoot) }
Ok $RepoRoot
if ($RepoRoot -like "$env:USERPROFILE*") { Warn '사용자 폴더 안에 있습니다. 동작은 하지만 C:\vmoa 처럼 사용자와 무관한 위치를 권장합니다.' }

# ------------------------------------------------------------------ 1. Node / Git
Step 'Node.js / Git'
$git = Find-Exe 'git.exe'
if (-not $git) { Install-WithWinget 'Git.Git' 'Git'; $git = Find-Exe 'git.exe' }
if (-not $git) { Fail 'Git 설치 후에도 찾을 수 없습니다. 새 관리자 PowerShell 에서 다시 실행하세요.' }
Ok ('git  : {0}' -f $git)

$node = Find-Exe 'node.exe'
if (-not $node) { Install-WithWinget 'OpenJS.NodeJS.LTS' 'Node.js'; $node = Find-Exe 'node.exe' }
if (-not $node) { Fail 'Node.js 설치 후에도 찾을 수 없습니다. 새 관리자 PowerShell 에서 다시 실행하세요.' }
$node = "$(& $node -p 'process.execPath')".Trim()   # nvm/volta 등 shim 대신 실제 실행 파일
$nodeVer = "$(& $node --version)".Trim()
if ([int]($nodeVer.TrimStart('v').Split('.')[0]) -lt 24) {
  Fail ('Node {0} 은(는) 너무 낮습니다. 24 이상 필요 (node:sqlite). 업데이트: winget upgrade OpenJS.NodeJS.LTS' -f $nodeVer)
}
Ok ('node : {0} ({1})' -f $node, $nodeVer)
if ($node -like 'C:\Users\*') {
  Warn 'Node 가 사용자 폴더에 설치돼 있습니다(nvm/volta 등). 서버는 SYSTEM 계정으로 돌기 때문에 공식 설치본(winget install OpenJS.NodeJS.LTS)을 권장합니다.'
}
$npm = Join-Path (Split-Path $node) 'npm.cmd'
if (-not (Test-Path $npm)) { $npm = Find-Exe 'npm.cmd' }
if (-not $npm) { Fail 'npm.cmd 를 찾을 수 없습니다.' }

# ------------------------------------------------------------------ 2. 설정 파일
Step '설정 파일'
New-Item -ItemType Directory -Force $DataDir | Out-Null
$conf = [ordered]@{ NodeExe = $node; NpmCmd = $npm; GitExe = $git; Branch = $Branch; PublicHost = $PublicHost }
if (-not $PublicHost -and (Test-Path $ConfFile)) {
  $prev = Get-Content $ConfFile -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($prev.PublicHost) { $conf.PublicHost = [string]$prev.PublicHost }  # 재실행 시 기존 값 유지
}
Write-Utf8NoBom $ConfFile ($conf | ConvertTo-Json)
Ok ('deploy.json -> {0}' -f $ConfFile)

if (Test-Path $EnvFile) {
  Ok '.env 이미 있음 — 그대로 유지'
} else {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
  $envText = @(
    '# VMOA 백엔드 운영 설정 (deploy/windows/setup.ps1 이 생성). 커밋 금지.',
    "PORT=$Port",
    'DB_PATH=./data/vmoa.db',
    'POLL_INTERVAL_MS=60000',
    'CHZZK_PAGES=8',
    'RETENTION_DAYS=7',
    "INTERNAL_SECRET=$secret",
    '# YouTube 수집을 켜려면 키 입력:',
    '# YOUTUBE_API_KEY='
  ) -join "`r`n"
  Write-Utf8NoBom $EnvFile ($envText + "`r`n")
  Ok ('.env 생성 -> {0}' -f $EnvFile)
}
$Port = Get-ServerPort
$secret = Get-EnvValue 'INTERNAL_SECRET'

# ------------------------------------------------------------------ 3. 시드 DB
Step '데이터베이스'
$dbPath = Join-Path $DataDir 'vmoa.db'
if ($SeedDb) {
  if (-not (Test-Path $SeedDb)) { Fail ('시드 DB 파일이 없습니다: {0}' -f $SeedDb) }
  if (Test-Path $dbPath) { Warn ('DB 가 이미 있어 시드 복사는 건너뜀: {0}' -f $dbPath) }
  else { Copy-Item $SeedDb $dbPath; Ok ('시드 DB 복사 -> {0}' -f $dbPath) }
} elseif (Test-Path $dbPath) {
  Ok ('기존 DB 사용: {0}' -f $dbPath)
} else {
  Warn '시드 DB 없이 시작합니다 — 처음 관측되는 채널이 모두 신규(데뷔 후보)로 잡힙니다.'
}

# ------------------------------------------------------------------ 4. 의존성
Step 'server 의존성 (npm ci)'
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue   # 재설치: 감독/서버를 먼저 멈춤
}
Stop-ServerProcess
$r = Invoke-Native $npm @('ci', '--omit=dev', '--no-audit', '--no-fund') $ServerDir
if ($r.Code -ne 0) { $r.Output | Select-Object -Last 20 | Out-Host; Fail 'npm ci 실패' }
Remove-Item $NpmMarker -Force -ErrorAction SilentlyContinue
Ok 'npm ci 완료'

# ------------------------------------------------------------------ 5. 전원
if (-not $SkipPowerConfig) {
  Step '전원 설정 (전원 연결 시 절전 끔)'
  & powercfg /change standby-timeout-ac 0 | Out-Null
  & powercfg /change hibernate-timeout-ac 0 | Out-Null
  Ok '절전/최대절전 = 사용 안 함'
}

# ------------------------------------------------------------------ 6. 작업 스케줄러
if (-not $NoService) {
  Step ('작업 스케줄러 등록: {0}' -f $TaskName)
  $runScript = Join-Path $PSScriptRoot 'run-server.ps1'
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}"' -f $runScript) `
    -WorkingDirectory $RepoRoot
  $triggers = @(
    (New-ScheduledTaskTrigger -AtStartup),
    # 감독이 어떤 이유로든 꺼져 있으면 5분 안에 다시 띄움 (실행 중이면 무시됨)
    (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5))
  )
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -Priority 5
  Register-ScheduledTask -TaskName $TaskName -Description 'VMOA 백엔드 (수집기 + API) 감독 — deploy/windows/run-server.ps1' `
    -Action $action -Trigger $triggers -Principal $principal -Settings $settings -Force | Out-Null
  Start-ScheduledTask -TaskName $TaskName
  Ok '등록 + 시작 (부팅 시 자동 실행, 로그인 불필요)'
}

# ------------------------------------------------------------------ 7. Cloudflare 터널
if ($TunnelToken -or $TunnelCredFile) {
  Step 'Cloudflare 터널 (cloudflared)'
  $cf = Find-Cloudflared
  if (-not $cf -and (Find-Exe 'winget.exe')) {
    Install-WithWinget 'Cloudflare.cloudflared' 'cloudflared'
    $cf = Find-Cloudflared
  }
  if (-not $cf) {
    Warn 'winget 설치 실패/불가 — GitHub 에서 MSI 직접 설치'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $msi = Join-Path $env:TEMP 'cloudflared-windows-amd64.msi'
    Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi' -OutFile $msi -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList ('/i "{0}" /qn' -f $msi) -Wait
    $cf = Find-Cloudflared
  }
  if (-not $cf) { Fail 'cloudflared 를 설치하지 못했습니다.' }
  Ok ('cloudflared: {0}' -f $cf)

  if ($TunnelCredFile) {
    # 인증 JSON 방식: 설정·인증 파일을 ProgramData 에 두고, 서비스가 그 설정으로 실행되게 한다.
    $cred = Get-Content $TunnelCredFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $tunnelId = [string]$cred.TunnelID
    if (-not $tunnelId) { Fail ('터널 인증 파일 형식이 아닙니다 (TunnelID 없음): {0}' -f $TunnelCredFile) }
    $cfDir = Join-Path $env:ProgramData 'vmoa\cloudflared'
    New-Item -ItemType Directory -Force $cfDir | Out-Null
    $credDst = Join-Path $cfDir ('{0}.json' -f $tunnelId)
    Copy-Item $TunnelCredFile $credDst -Force
    $cfgPath = Join-Path $cfDir 'config.yml'
    $cfg = @(
      ('tunnel: {0}' -f $tunnelId),
      ('credentials-file: {0}' -f $credDst),
      'ingress:',
      ('  - hostname: {0}' -f $conf.PublicHost),
      ('    service: http://localhost:{0}' -f $Port),
      '  - service: http_status:404'
    ) -join "`r`n"
    Write-Utf8NoBom $cfgPath ($cfg + "`r`n")
    # 인증 파일은 SYSTEM·Administrators 만 읽도록 (상속 제거)
    & icacls $cfDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
    Ok ('터널 {0} 설정 -> {1}' -f $tunnelId.Substring(0, 8), $cfgPath)

    $svc = Get-Service -Name 'cloudflared' -ErrorAction SilentlyContinue
    if (-not $svc) {
      $r = Invoke-Native $cf @('service', 'install')
      $svc = Get-Service -Name 'cloudflared' -ErrorAction SilentlyContinue
      if (-not $svc) {
        Warn ('cloudflared service install 실패 — 서비스 직접 생성: {0}' -f ($r.Output -join ' | '))
        New-Service -Name 'Cloudflared' -DisplayName 'Cloudflared agent' -StartupType Automatic `
          -BinaryPathName ('"{0}"' -f $cf) | Out-Null
      }
    }
    # 서비스 실행 명령을 우리 설정 파일로 고정 + 비정상 종료 시 자동 재시작
    Stop-Service -Name 'cloudflared' -Force -ErrorAction SilentlyContinue
    Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\Cloudflared' -Name ImagePath `
      -Value ('"{0}" --config "{1}" tunnel run' -f $cf, $cfgPath)
    Set-Service -Name 'cloudflared' -StartupType Automatic
    & sc.exe failure Cloudflared reset= 86400 actions= restart/10000/restart/10000/restart/60000 | Out-Null
    Start-Service -Name 'cloudflared'
    Ok '터널 서비스 등록 + 시작 (부팅 시 자동 실행)'
  } elseif (Get-Service -Name 'cloudflared' -ErrorAction SilentlyContinue) {
    Warn '터널 서비스가 이미 설치돼 있어 건너뜀. 토큰을 바꾸려면: cloudflared service uninstall → setup 재실행'
  } else {
    $r = Invoke-Native $cf @('service', 'install', $TunnelToken)
    if ($r.Code -ne 0) { $r.Output | Out-Host; Fail 'cloudflared service install 실패 (토큰 확인)' }
    Ok '터널 서비스 등록 + 시작 (부팅 시 자동 실행)'
  }
}

# ------------------------------------------------------------------ 확인
if (-not $NoService) {
  Step '서버 응답 확인'
  $healthy = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try {
      $h = Invoke-RestMethod ('http://localhost:{0}/health' -f $Port) -TimeoutSec 3
      if ($h.ok) { $healthy = $true; break }
    } catch { }
  }
  if ($healthy) { Ok ('http://localhost:{0}/health 응답 OK' -f $Port) }
  else { Warn '아직 응답이 없습니다. 잠시 후 status.ps1 로 로그를 확인하세요.' }

  if (($TunnelCredFile -or $TunnelToken) -and $conf.PublicHost) {
    $pubOk = $false
    for ($i = 0; $i -lt 15; $i++) {
      Start-Sleep -Seconds 2
      try {
        $h = Invoke-RestMethod ('https://{0}/health' -f $conf.PublicHost) -TimeoutSec 5
        if ($h.ok) { $pubOk = $true; break }
      } catch { }
    }
    if ($pubOk) { Ok ('https://{0}/health 응답 OK (터널 연결됨)' -f $conf.PublicHost) }
    else { Warn ('https://{0}/health 아직 응답 없음 — 서비스 상태: Get-Service cloudflared' -f $conf.PublicHost) }
  }
}

$pubHost = $conf.PublicHost
if (-not $pubHost) { $pubHost = 'api.<도메인>' }
Write-Host ''
Write-Host '================ 설치 완료 ================' -ForegroundColor Cyan
Write-Host ('Cloudflare Public Hostname : {0}  ->  http://localhost:{1}' -f $pubHost, $Port)
Write-Host ('Vercel BACKEND_URL         : https://{0}' -f $pubHost)
Write-Host ('Vercel INTERNAL_SECRET     : {0}' -f $secret)
Write-Host '상태 확인 : powershell -ExecutionPolicy Bypass -File deploy\windows\status.ps1'
Write-Host '서버 재시작: powershell -ExecutionPolicy Bypass -File deploy\windows\restart.ps1'
