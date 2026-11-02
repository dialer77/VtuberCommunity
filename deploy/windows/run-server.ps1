<#
  VMOA 백엔드 상주 감독 스크립트.
  작업 스케줄러(VMOA-Server)가 SYSTEM 계정으로 실행한다. (부팅 시 + 5분마다 살아있는지 보장)

  하는 일
    1) server 를 띄우고, 죽으면 다시 띄운다. (곧바로 다시 죽으면 점점 늦게: 10초 → 최대 5분)
    2) 주기적으로 GitHub(origin/<branch>)를 확인해 새 커밋을 반영한다.
         server/ 변경          → 서버 중지 → pull → (package*.json 변경 시 npm ci) → 재시작
         web/·docs/ 등만 변경  → pull 만 (재시작 없음)
         deploy/windows/ 변경  → pull 후 이 스크립트 종료 → 작업 스케줄러가 5분 안에 새 버전으로 다시 실행

  수동 실행(테스트용):
    powershell -ExecutionPolicy Bypass -File deploy\windows\run-server.ps1 -CheckIntervalSec 30
#>
param(
  [int]$CheckIntervalSec = 300,
  [switch]$NoUpdate
)
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_common.ps1')

New-Item -ItemType Directory -Force $LogDir | Out-Null
$SupLog = Join-Path $LogDir 'supervisor.log'
$script:LastFailedSha = ''

function Write-Sup([string]$Message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -Path $SupLog -Value $line -Encoding UTF8
  Write-Host $line
}

function Invoke-LogRotation {
  if ((Test-Path $SupLog) -and (Get-Item $SupLog).Length -gt 5MB) {
    Move-Item $SupLog "$SupLog.old" -Force
  }
  # 서버 로그는 실행(시작)마다 1쌍(.log / .err.log) — 최근 10회분만 보관
  Get-ChildItem $LogDir -Filter 'server-*.log' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -Skip 20 |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

# 중복 실행 방지 (작업 스케줄러 + 수동 실행이 겹치는 경우)
function Get-SingleInstanceLock {
  try {
    $m = New-Object System.Threading.Mutex($false, 'Global\VMOA-Server-Supervisor')
  } catch [System.UnauthorizedAccessException] {
    return $null  # 다른 계정(SYSTEM)의 감독이 이미 잡고 있음
  }
  try {
    if ($m.WaitOne(0)) { return $m }
  } catch [System.Threading.AbandonedMutexException] {
    return $m     # 이전 감독이 비정상 종료 — 우리가 인수
  }
  $m.Dispose()
  return $null
}

function Invoke-NpmCi {
  Write-Sup 'npm ci 실행 중...'
  $r = Invoke-Native $Conf.NpmCmd @('ci', '--omit=dev', '--no-audit', '--no-fund') $ServerDir
  if ($r.Code -eq 0) {
    Remove-Item $NpmMarker -Force -ErrorAction SilentlyContinue
    Write-Sup 'npm ci 완료'
  } else {
    New-Item -ItemType File -Force $NpmMarker | Out-Null
    Write-Sup ('npm ci 실패 (code={0}): {1}' -f $r.Code, (($r.Output | Select-Object -Last 5) -join ' | '))
  }
}

function Start-Server {
  $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
  $out = Join-Path $LogDir "server-$ts.log"
  $err = Join-Path $LogDir "server-$ts.err.log"
  # tsx 를 로더로 직접 붙여 node 단일 프로세스로 실행 (종료/재시작 제어가 확실함)
  $nodeArgs = @('--env-file-if-exists=.env', '--disable-warning=ExperimentalWarning', '--import', 'tsx', 'src/index.ts')
  $p = Start-Process -FilePath $Conf.NodeExe -ArgumentList $nodeArgs -WorkingDirectory $ServerDir `
    -RedirectStandardOutput $out -RedirectStandardError $err -NoNewWindow -PassThru
  $null = $p.Handle  # 종료코드를 나중에 읽으려면 핸들을 미리 잡아둬야 함
  Set-Content -Path $PidFile -Value $p.Id -Encoding ASCII
  Write-Sup ('서버 시작 pid={0} 로그={1}' -f $p.Id, (Split-Path $out -Leaf))
  return $p
}

function Get-ErrTail {
  $f = Get-ChildItem $LogDir -Filter 'server-*.err.log' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $f -or $f.Length -eq 0) { return '' }
  return ((Get-Content $f.FullName -Tail 5 -Encoding UTF8) -join ' | ')
}

# origin 에 새 커밋이 있으면 변경 정보 반환, 없으면 $null
function Get-PendingUpdate {
  $branch = $Conf.Branch
  $f = Invoke-Git @('fetch', '--quiet', 'origin', $branch)
  if ($f.Code -ne 0) {
    Write-Sup ('git fetch 실패 (네트워크?): {0}' -f ($f.Output -join ' | '))
    return $null
  }
  $local  = "$((Invoke-Git @('rev-parse', 'HEAD')).Output | Select-Object -First 1)".Trim()
  $remote = "$((Invoke-Git @('rev-parse', "origin/$branch")).Output | Select-Object -First 1)".Trim()
  if (-not $remote -or $local -eq $remote) { return $null }
  if ($remote -eq $script:LastFailedSha) { return $null }  # 이미 실패를 보고한 커밋 — 반복 로그 방지

  $ff = Invoke-Git @('merge-base', '--is-ancestor', 'HEAD', "origin/$branch")
  if ($ff.Code -ne 0) {
    $script:LastFailedSha = $remote
    Write-Sup '배포 PC 의 브랜치가 origin 과 갈라짐 — 자동 업데이트 불가 (배포 PC 에서 git status 확인)'
    return $null
  }
  $files = @((Invoke-Git @('diff', '--name-only', $local, $remote)).Output | Where-Object { $_ })
  return [pscustomobject]@{
    Local         = $local
    Remote        = $remote
    Files         = $files
    ServerChanged = [bool]($files | Where-Object { $_ -like 'server/*' })
    DepsChanged   = [bool]($files | Where-Object { $_ -eq 'server/package.json' -or $_ -eq 'server/package-lock.json' })
    SelfChanged   = [bool]($files | Where-Object { $_ -like 'deploy/windows/*' })
  }
}

# ---------------------------------------------------------------- main
$lock = Get-SingleInstanceLock
if (-not $lock) { Write-Host '감독이 이미 실행 중 — 종료'; exit 0 }

$Conf = Get-DeployConfig
if (-not $Conf.NodeExe) { Write-Sup 'node.exe 를 찾을 수 없음 — setup.ps1 을 다시 실행하세요'; exit 1 }
if (-not $Conf.GitExe -and -not $NoUpdate) { Write-Sup 'git.exe 를 찾을 수 없음 — 자동 업데이트 끔'; $NoUpdate = $true }
Write-Sup ('감독 시작 (repo={0}, branch={1}, 확인주기={2}초, 자동업데이트={3})' -f $RepoRoot, $Conf.Branch, $CheckIntervalSec, (-not $NoUpdate))

$stale = Get-ServerProcess
if ($stale) {
  Write-Sup ('이전 서버 프로세스 정리 pid={0}' -f $stale.Id)
  Stop-ServerProcess $stale
}

$backoff = 0
while ($true) {
  try {
    Invoke-LogRotation
    if ((Test-Path $NpmMarker) -or -not (Test-Path (Join-Path $ServerDir 'node_modules\tsx'))) {
      Invoke-NpmCi
    }

    $p = Start-Server
    $startedAt = Get-Date
    $nextCheck = (Get-Date).AddSeconds([Math]::Min(60, $CheckIntervalSec))
    $reason = ''

    while ($true) {
      if ($p.WaitForExit(5000)) { $reason = 'exited'; break }
      if ($NoUpdate -or (Get-Date) -lt $nextCheck) { continue }
      $nextCheck = (Get-Date).AddSeconds($CheckIntervalSec)

      $u = Get-PendingUpdate
      if (-not $u) { continue }
      Write-Sup ('업데이트 발견 {0} -> {1} (변경 파일 {2}개)' -f $u.Local.Substring(0, 7), $u.Remote.Substring(0, 7), $u.Files.Count)

      if ($u.ServerChanged) {
        Write-Sup '서버 중지 (업데이트 적용)'
        Stop-ServerProcess $p
      }
      $m = Invoke-Git @('merge', '--ff-only', '--quiet', "origin/$($Conf.Branch)")
      if ($m.Code -ne 0) {
        $script:LastFailedSha = $u.Remote
        Write-Sup ('pull 실패 — 배포 PC 에 로컬 수정이 있는지 확인 (git status): {0}' -f ($m.Output -join ' | '))
        if ($u.ServerChanged) { $reason = 'update-failed'; break }  # 기존 코드로 다시 기동
        continue
      }
      Write-Sup ('pull 완료 -> {0}' -f $u.Remote.Substring(0, 7))
      if ($u.DepsChanged) { New-Item -ItemType File -Force $NpmMarker | Out-Null }
      if ($u.SelfChanged) {
        Write-Sup '감독 스크립트 변경 — 종료 후 작업 스케줄러가 새 버전으로 재실행 (최대 5분)'
        $lock.ReleaseMutex()
        exit 0
      }
      if ($u.ServerChanged) { $reason = 'update'; break }
      Write-Sup '서버 외 파일만 변경 — 재시작 없음'
    }

    if ($reason -eq 'exited') {
      $ran = [int]((Get-Date) - $startedAt).TotalSeconds
      Write-Sup ('서버 종료 code={0} (가동 {1}초) {2}' -f $p.ExitCode, $ran, (Get-ErrTail))
      Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
      if ($ran -lt 120) { $backoff = [Math]::Min([Math]::Max($backoff * 2, 10), 300) } else { $backoff = 5 }
      Write-Sup ('{0}초 후 재시작' -f $backoff)
      Start-Sleep -Seconds $backoff
    } else {
      $backoff = 0
    }
  } catch {
    Write-Sup ('감독 오류: {0}' -f $_.Exception.Message)
    Start-Sleep -Seconds 30
  }
}
