<#
  로그인·최애·알림용 사용자 DB 준비 (배포 PC, 관리자 PowerShell) — 자세한 설명: docs\user-accounts.md

    powershell -ExecutionPolicy Bypass -File deploy\windows\setup-userdb.ps1

  하는 일 (여러 번 실행해도 안전)
    1. 이 PC 의 Postgres 찾기 → 관리자(postgres) 비밀번호 입력받아 접속 확인
    2. 전용 계정 vmoa_app 과 DB vmoa_users 만들기 (기존 다른 DB 는 건드리지 않음)
    3. server\.env 에 USER_DATABASE_URL · VAPID 키 기록 (이미 있으면 유지)
    4. 서버 재시작 → 테이블 생성·알림 활성화 확인

  옵션
    -PgPort 5433       Postgres 포트가 5432 가 아닐 때
    -PgAdmin 이름      관리자 계정이 postgres 가 아닐 때
    -Psql 경로         psql.exe 를 자동으로 못 찾을 때
    -RotatePassword    vmoa_app 비밀번호 새로 발급
#>
param(
  [string]$PgHost = 'localhost',
  [int]$PgPort = 5432,
  [string]$PgAdmin = 'postgres',
  [string]$Psql = '',
  [switch]$RotatePassword
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

$AppRole = 'vmoa_app'
$AppDb   = 'vmoa_users'

function Step([string]$m) { Write-Host ''; Write-Host "== $m" -ForegroundColor Cyan }
function Ok([string]$m)   { Write-Host "   OK  $m" -ForegroundColor Green }
function Warn([string]$m) { Write-Host "   !!  $m" -ForegroundColor Yellow }
function Fail([string]$m) { $env:PGPASSWORD = $null; Write-Host "   XX  $m" -ForegroundColor Red; exit 1 }

if (-not (Test-IsAdmin)) { Fail '관리자 권한 PowerShell 에서 실행하세요.' }
if (-not (Test-Path $EnvFile)) { Fail ('server\.env 가 없습니다. setup.ps1 을 먼저 실행하세요: {0}' -f $EnvFile) }
$Conf = Get-DeployConfig
if (-not $Conf.NodeExe) { Fail 'node.exe 를 찾을 수 없습니다. setup.ps1 을 먼저 실행하세요.' }
foreach ($pkg in @('pg', 'web-push')) {
  if (-not (Test-Path (Join-Path $ServerDir ('node_modules\{0}' -f $pkg)))) {
    Fail ('서버 패키지 {0} 가 아직 없습니다. 자동 업데이트(npm ci)가 끝나도록 1~2분 뒤 다시 실행하세요.' -f $pkg)
  }
}

function New-RandomHex([int]$Bytes) {
  $buf = New-Object byte[] $Bytes
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buf) } finally { $rng.Dispose() }
  return (($buf | ForEach-Object { $_.ToString('x2') }) -join '')
}

# ------------------------------------------------------------------ 1. Postgres 접속
Step 'Postgres 찾기'
function Find-Psql {
  if ($Psql) { if (Test-Path $Psql) { return (Resolve-Path $Psql).Path } else { return '' } }
  # 실제로 돌고 있는 서비스의 설치 경로를 우선 사용
  $services = @(Get-CimInstance Win32_Service -Filter "Name LIKE 'postgresql%'" -ErrorAction SilentlyContinue | Sort-Object { $_.State -ne 'Running' })
  foreach ($s in $services) {
    if ($s.PathName -match '^"?(.+?\\bin)\\pg_ctl\.exe') {
      $cand = Join-Path $Matches[1] 'psql.exe'
      if (Test-Path $cand) { return $cand }
    }
  }
  $onPath = Find-Exe 'psql.exe'
  if ($onPath) { return $onPath }
  $found = @(Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe', 'D:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending)
  if ($found.Count -gt 0) { return $found[0].FullName }
  return ''
}
$PsqlExe = Find-Psql
if (-not $PsqlExe) { Fail 'psql.exe 를 찾지 못했습니다. -Psql "C:\...\bin\psql.exe" 로 경로를 지정하세요.' }
Ok $PsqlExe

$sec = Read-Host ('   Postgres 관리자({0}) 비밀번호 입력 (화면에 보이지 않음)' -f $PgAdmin) -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try { $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

# SQL 은 stdin 으로 넘긴다 — 비밀번호가 프로세스 인자에 남지 않게
function Invoke-Psql([string]$Db, [string]$Sql) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = @($Sql | & $PsqlExe -X -q -w -t -A -v ON_ERROR_STOP=1 -h $PgHost -p $PgPort -U $PgAdmin -d $Db 2>&1 | ForEach-Object { "$_" })
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $prev }
  return [pscustomobject]@{ Code = $code; Output = $out }
}
function Psql-Do([string]$Db, [string]$Sql, [string]$What) {
  $r = Invoke-Psql $Db $Sql
  if ($r.Code -ne 0) { Fail ('{0} 실패: {1}' -f $What, ($r.Output -join ' ')) }
  return (($r.Output -join "`n").Trim())
}

$r = Invoke-Psql 'postgres' 'SHOW server_version;'
if ($r.Code -ne 0) {
  Fail ('접속 실패 ({0}:{1}, 계정 {2}). 비밀번호·포트(-PgPort)를 확인하세요. 오류: {3}' -f $PgHost, $PgPort, $PgAdmin, ($r.Output -join ' '))
}
Ok ('Postgres {0} 접속 ({1}:{2})' -f ($r.Output -join ''), $PgHost, $PgPort)

# ------------------------------------------------------------------ 2. 계정·DB
Step ('전용 계정 {0} · DB {1}' -f $AppRole, $AppDb)
$existingUrl = Get-EnvValue 'USER_DATABASE_URL'
$password = ''
if ($existingUrl -match ('^postgres(ql)?://{0}:([0-9a-f]+)@' -f $AppRole)) { $password = $Matches[2] }

$roleExists = (Psql-Do 'postgres' ("SELECT 1 FROM pg_roles WHERE rolname = '{0}';" -f $AppRole) '계정 확인') -eq '1'
if ($RotatePassword -or -not $password -or -not $roleExists) { $password = New-RandomHex 24 }

if ($roleExists) {
  $null = Psql-Do 'postgres' ("ALTER ROLE {0} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '{1}';" -f $AppRole, $password) '계정 갱신'
  Ok ('계정 {0} 갱신' -f $AppRole)
} else {
  $null = Psql-Do 'postgres' ("CREATE ROLE {0} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '{1}';" -f $AppRole, $password) '계정 생성'
  Ok ('계정 {0} 생성' -f $AppRole)
}

$dbExists = (Psql-Do 'postgres' ("SELECT 1 FROM pg_database WHERE datname = '{0}';" -f $AppDb) 'DB 확인') -eq '1'
if ($dbExists) {
  $null = Psql-Do 'postgres' ('ALTER DATABASE {0} OWNER TO {1};' -f $AppDb, $AppRole) 'DB 소유자 지정'
  Ok ('DB {0} 이미 있음 — 데이터 유지' -f $AppDb)
} else {
  $null = Psql-Do 'postgres' ("CREATE DATABASE {0} OWNER {1} ENCODING 'UTF8' TEMPLATE template0;" -f $AppDb, $AppRole) 'DB 생성'
  Ok ('DB {0} 생성' -f $AppDb)
}
# 다른 DB 사용자가 이 DB 에 붙지 못하게
$null = Psql-Do 'postgres' ('REVOKE CONNECT ON DATABASE {0} FROM PUBLIC;' -f $AppDb) '접속 권한 정리'

# ------------------------------------------------------------------ 3. server\.env
Step '설정 기록 (server\.env)'
Set-EnvValue 'USER_DATABASE_URL' ('postgres://{0}:{1}@{2}:{3}/{4}' -f $AppRole, $password, $PgHost, $PgPort, $AppDb)
Ok 'USER_DATABASE_URL'

if ((Get-EnvValue 'VAPID_PUBLIC_KEY') -and (Get-EnvValue 'VAPID_PRIVATE_KEY')) {
  Ok 'VAPID 키 기존 값 유지 (바꾸면 모든 기기의 알림 구독이 끊어짐)'
} else {
  $js = "import { generateVAPIDKeys } from 'web-push'; const k = generateVAPIDKeys(); console.log(k.publicKey + ' ' + k.privateKey);"
  $g = Invoke-Native $Conf.NodeExe @('--input-type=module', '-e', $js) $ServerDir
  $line = @($g.Output | Where-Object { $_ -match '^[A-Za-z0-9_-]{60,}\s+[A-Za-z0-9_-]{30,}$' } | Select-Object -Last 1)
  if ($g.Code -ne 0 -or $line.Count -eq 0) { Fail ('VAPID 키 생성 실패: {0}' -f ($g.Output -join ' ')) }
  $parts = $line[0].Trim() -split '\s+'
  Set-EnvValue 'VAPID_PUBLIC_KEY' $parts[0]
  Set-EnvValue 'VAPID_PRIVATE_KEY' $parts[1]
  Ok 'VAPID 키 생성'
}
if (-not (Get-EnvValue 'INTERNAL_SECRET')) {
  Set-EnvValue 'INTERNAL_SECRET' (New-RandomHex 32)
  Warn 'INTERNAL_SECRET 이 비어 있어 새로 만들었습니다 — Vercel 에도 같은 값을 넣어야 합니다.'
}
# 비밀번호가 들어 있으므로 .env 는 SYSTEM·Administrators 만 읽게
& icacls $EnvFile /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
Ok 'server\.env 권한: SYSTEM·Administrators 전용'

# ------------------------------------------------------------------ 4. 재시작·확인
Step '서버 재시작 · 확인'
$p = Get-ServerProcess
if ($p) {
  Stop-ServerProcess $p
  Ok '서버 재시작 요청 (감독이 몇 초 안에 다시 띄움)'
} else {
  Warn '서버가 실행 중이 아닙니다 — 감독 작업을 시작합니다.'
  Start-ScheduledTask -TaskName $TaskName
}

$port = Get-ServerPort
$enabled = $false
for ($i = 0; $i -lt 30 -and -not $enabled; $i++) {
  Start-Sleep -Seconds 3
  try {
    $res = Invoke-RestMethod -Uri ('http://127.0.0.1:{0}/api/push/public-key' -f $port) -TimeoutSec 3
    if ($res.enabled) { $enabled = $true }
  } catch { }
}
if ($enabled) { Ok '서버가 알림 활성 상태로 시작됨' } else { Warn '90초 안에 알림 활성을 확인하지 못했습니다. status.ps1 과 server\data\logs 를 확인하세요.' }

$tables = Invoke-Psql $AppDb "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
$env:PGPASSWORD = $null
if ($tables.Code -eq 0 -and [int]($tables.Output -join '') -ge 5) {
  Ok ('테이블 {0}개 확인' -f ($tables.Output -join ''))
} else {
  Warn '테이블 생성을 확인하지 못했습니다. 서버 로그의 "사용자 DB" 항목을 확인하세요.'
}

Write-Host ''
Write-Host '================ 사용자 DB 준비 완료 ================' -ForegroundColor Cyan
Write-Host '다음 단계 (docs\user-accounts.md): Google 로그인 키 발급 → Vercel 환경변수 입력'
Write-Host ''
Write-Host 'Vercel 에 넣을 INTERNAL_SECRET 값 (Vercel 화면에 직접 붙여넣고, 채팅에는 올리지 마세요):' -ForegroundColor Yellow
Write-Host (Get-EnvValue 'INTERNAL_SECRET')
