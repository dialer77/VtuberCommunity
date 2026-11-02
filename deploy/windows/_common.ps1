# VMOA 배포 스크립트 공통 정의 (dot-source 전용: . (Join-Path $PSScriptRoot '_common.ps1'))
# Windows PowerShell 5.1 호환으로 작성. 이 파일들은 UTF-8 (BOM) 으로 저장해야 한글이 깨지지 않음.

$RepoRoot  = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$ServerDir = Join-Path $RepoRoot 'server'
$DataDir   = Join-Path $ServerDir 'data'          # gitignore 대상 (DB·로그·런타임 상태)
$LogDir    = Join-Path $DataDir 'logs'
$PidFile   = Join-Path $DataDir 'server.pid'
$ConfFile  = Join-Path $DataDir 'deploy.json'     # setup.ps1 이 기록 (node/git 경로 등)
$EnvFile   = Join-Path $ServerDir '.env'          # 서버 운영 설정 (gitignore 대상)
$NpmMarker = Join-Path $DataDir 'needs-npm-ci'    # 다음 시작 전에 npm ci 가 필요하다는 표시
$TaskName  = 'VMOA-Server'

function Find-Exe([string]$Name) {
  $cmd = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd) { return $cmd.Source }
  return ''
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
  [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding $false))
}

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# .env 에서 값 하나 읽기 (없으면 기본값)
function Get-EnvValue([string]$Name, [string]$Default = '') {
  if (Test-Path $EnvFile) {
    foreach ($line in (Get-Content $EnvFile -Encoding UTF8)) {
      if ($line -match ('^\s*' + [regex]::Escape($Name) + '\s*=\s*(.*)$')) {
        return $Matches[1].Trim().Trim('"')
      }
    }
  }
  return $Default
}

function Get-ServerPort {
  return [int](Get-EnvValue 'PORT' (Get-EnvValue 'API_PORT' '4000'))
}

# deploy.json + 자동 탐색으로 실행 파일 경로 결정
function Get-DeployConfig {
  $c = [ordered]@{ NodeExe = ''; NpmCmd = ''; GitExe = ''; Branch = 'main'; PublicHost = '' }
  if (Test-Path $ConfFile) {
    $j = Get-Content $ConfFile -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($k in @($c.Keys)) {
      if ($j.PSObject.Properties[$k] -and $j.$k) { $c[$k] = [string]$j.$k }
    }
  }
  if (-not $c.NodeExe -or -not (Test-Path $c.NodeExe)) { $c.NodeExe = Find-Exe 'node.exe' }
  if (-not $c.NpmCmd -or -not (Test-Path $c.NpmCmd)) {
    $cand = ''
    if ($c.NodeExe) { $cand = Join-Path (Split-Path $c.NodeExe) 'npm.cmd' }
    if ($cand -and (Test-Path $cand)) { $c.NpmCmd = $cand } else { $c.NpmCmd = Find-Exe 'npm.cmd' }
  }
  if (-not $c.GitExe -or -not (Test-Path $c.GitExe)) { $c.GitExe = Find-Exe 'git.exe' }
  return [pscustomobject]$c
}

# 네이티브 명령 실행 → 종료코드 + 출력(문자열 배열). stderr 때문에 예외가 나지 않도록 감싼다.
function Invoke-Native([string]$Exe, [string[]]$Arguments, [string]$WorkDir = $RepoRoot) {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  Push-Location $WorkDir
  try {
    $out = @(& $Exe @Arguments 2>&1 | ForEach-Object { "$_" })
    $code = $LASTEXITCODE
  } finally {
    Pop-Location
    $ErrorActionPreference = $prevEap
  }
  return [pscustomobject]@{ Code = $code; Output = $out }
}

# git 실행. SYSTEM 계정으로 돌 때 "dubious ownership" / 자격증명 창을 피하기 위한 옵션 포함.
function Invoke-Git([string[]]$Arguments) {
  $env:GIT_TERMINAL_PROMPT = '0'
  $base = @('-c', 'safe.directory=*', '-c', 'credential.helper=', '-C', $RepoRoot)
  return Invoke-Native $Conf.GitExe ($base + $Arguments)
}

# PID 파일 기준으로 우리 서버(node) 프로세스 찾기
function Get-ServerProcess {
  if (-not (Test-Path $PidFile)) { return $null }
  $id = 0
  $raw = "$(Get-Content $PidFile -TotalCount 1 -ErrorAction SilentlyContinue)".Trim()
  if (-not [int]::TryParse($raw, [ref]$id)) { return $null }
  $p = Get-Process -Id $id -ErrorAction SilentlyContinue
  if (-not $p -or $p.ProcessName -ne 'node') { return $null }
  # PID 재사용 방지: 명령줄을 읽을 수 있으면 우리 서버인지 확인
  $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction SilentlyContinue
  if ($cim -and $cim.CommandLine -and ($cim.CommandLine -notmatch 'src[/\\]index\.ts')) { return $null }
  return $p
}

# 서버(node)와 그 자식 프로세스(esbuild 등) 종료
function Stop-ServerProcess($Process = $null) {
  if (-not $Process) { $Process = Get-ServerProcess }
  if ($Process -and -not $Process.HasExited) {
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($Process.Id)" -ErrorAction SilentlyContinue)
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    $null = $Process.WaitForExit(15000)
    foreach ($ch in $children) { Stop-Process -Id $ch.ProcessId -Force -ErrorAction SilentlyContinue }
  }
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}
