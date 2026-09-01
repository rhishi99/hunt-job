#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Hunt-Job interactive service and workflow manager.
    Run: .\hunt-job.ps1
    Non-interactive: .\hunt-job.ps1 start|stop|restart|status|scan|list|test|e2e|dashboard [target]
#>

param(
    [Parameter(Position=0)][string]$Command = "",
    [Parameter(Position=1)][string]$Target  = "dashboard",
    [Parameter(ValueFromRemainingArguments=$true)][string[]]$ExtraArgs
)

$ROOT     = $PSScriptRoot
$LogsDir  = Join-Path $ROOT ".logs"
$DataDir  = Join-Path $ROOT "data"
$DbFile   = Join-Path $DataDir "hunt-job.db"

# Force UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8

$WEB_PORT = 7777
$WEB_HOST = "http://127.0.0.1:$WEB_PORT"

if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
}

# ---- Colors -----------------------------------------------------------------
function cGreen  ($t) { Write-Host $t -ForegroundColor Green  -NoNewline }
function cRed    ($t) { Write-Host $t -ForegroundColor Red    -NoNewline }
function cCyan   ($t) { Write-Host $t -ForegroundColor Cyan   -NoNewline }
function cYellow ($t) { Write-Host $t -ForegroundColor Yellow -NoNewline }
function cGray   ($t) { Write-Host $t -ForegroundColor DarkGray -NoNewline }
function cWhite  ($t) { Write-Host $t -ForegroundColor White  -NoNewline }
function nl       ()  { Write-Host "" }

function Show-Banner {
    nl
    cCyan "  ================================================================"; nl
    cCyan "   🏹 HUNT-JOB :: AI Job Search & ATS Scanner Platform"; nl
    cCyan "  ================================================================"; nl
    cGray "   Root: $ROOT"; nl
    cGray "   Dashboard: $WEB_HOST | DB: $DbFile"; nl
    nl
}

function Get-PortPID ($Port) {
    try {
        $lines = netstat -ano | Select-String ":$Port\s" | Select-String "LISTENING"
        if ($lines) {
            $parts = ($lines[0] -split '\s+') | Where-Object { $_ -ne '' }
            return [int]$parts[-1]
        }
    } catch {}
    return $null
}

function Is-DashboardRunning {
    $targetPid = Get-PortPID $WEB_PORT
    return ($null -ne $targetPid -and $targetPid -gt 0)
}

function Get-DbStats {
    if (-not (Test-Path $DbFile)) {
        return @{ Exists = $false; Companies = 0; Jobs = 0; Apps = 0; Size = "0 KB" }
    }
    $sizeKb = [math]::Round((Get-Item $DbFile).Length / 1KB, 1)
    
    # Query sqlite if sqlite3 cli exists or node script
    $statsScript = "
      import Database from 'better-sqlite3';
      try {
        const db = new Database('$($DbFile.Replace('\', '/'))', { readonly: true });
        const comp = db.prepare('SELECT count(*) as c FROM companies').get().c;
        const jobs = db.prepare('SELECT count(*) as c FROM jobs').get().c;
        const apps = db.prepare('SELECT count(*) as c FROM applications').get().c;
        console.log(JSON.stringify({ comp, jobs, apps }));
      } catch(e) {
        console.log(JSON.stringify({ comp: 0, jobs: 0, apps: 0 }));
      }
    "
    try {
        $out = node --input-type=module -e "$statsScript" 2>$null
        $json = $out | ConvertFrom-Json
        return @{ Exists = $true; Companies = $json.comp; Jobs = $json.jobs; Apps = $json.apps; Size = "$sizeKb KB" }
    } catch {
        return @{ Exists = $true; Companies = 0; Jobs = 0; Apps = 0; Size = "$sizeKb KB" }
    }
}

function Show-Status {
    Show-Banner
    cWhite " [Service Status]"; nl
    $dashRunning = Is-DashboardRunning
    $dashPid = Get-PortPID $WEB_PORT

    Write-Host "   - Web Dashboard (:$WEB_PORT): " -NoNewline
    if ($dashRunning) {
        cGreen "RUNNING (PID: $dashPid)"
        cGray " -> $WEB_HOST"
    } else {
        cRed "STOPPED"
    }
    nl

    $stats = Get-DbStats
    Write-Host "   - SQLite Database:      " -NoNewline
    if ($stats.Exists) {
        cGreen "ONLINE"
        cGray " (Companies: $($stats.Companies) | Jobs: $($stats.Jobs) | Applications: $($stats.Apps) | Size: $($stats.Size))"
    } else {
        cYellow "NOT INITIALIZED"
    }
    nl
    nl
}

function Start-Dashboard {
    if (Is-DashboardRunning) {
        $dashPid = Get-PortPID $WEB_PORT
        cYellow " [!] Dashboard already running on port $WEB_PORT (PID: $dashPid)"; nl
        return
    }
    cGreen " [*] Starting Hunt-Job Web Dashboard on $WEB_HOST..."; nl
    $logOut = Join-Path $LogsDir "dashboard.log"
    $proc = Start-Process -FilePath "node" -ArgumentList "src/web/server.js" -WorkingDirectory $ROOT -RedirectStandardOutput $logOut -RedirectStandardError $logOut -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 1
    if (Is-DashboardRunning) {
        $dashPid = Get-PortPID $WEB_PORT
        cGreen " [✓] Dashboard online at $WEB_HOST (PID: $dashPid)"; nl
    } else {
        cRed " [✗] Failed to start dashboard. Check log at $logOut"; nl
    }
}

function Stop-Dashboard {
    $dashPid = Get-PortPID $WEB_PORT
    if ($dashPid) {
        cYellow " [*] Stopping Dashboard (PID: $dashPid)..."; nl
        Stop-Process -Id $dashPid -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
        cGreen " [✓] Dashboard stopped."; nl
    } else {
        cGray " [-] Dashboard is not running."; nl
    }
}

function Run-Tests {
    cWhite " [*] Executing Vitest & Runner Test Suites..."; nl
    & npm test
}

function Run-E2E {
    cWhite " [*] Running Standalone Browser E2E Smoke Tests..."; nl
    $wasRunning = Is-DashboardRunning
    if (-not $wasRunning) {
        Start-Dashboard
    }
    node huntjob_e2e_test_standalone.mjs
}

function Run-Scan {
    param([string]$Archetype)
    cWhite " [*] Executing live ATS portal scan..."; nl
    if ($Archetype) {
        node hunt-job.js scan -a "$Archetype"
    } else {
        node hunt-job.js scan
    }
}

function Run-Watch {
    cWhite " [*] Starting Live ATS Watcher..."; nl
    node hunt-job.js watch @ExtraArgs
}

# ---- Dispatcher -------------------------------------------------------------
switch ($Command.ToLower()) {
    "start" {
        Start-Dashboard
    }
    "stop" {
        Stop-Dashboard
    }
    "restart" {
        Stop-Dashboard
        Start-Sleep -Seconds 1
        Start-Dashboard
    }
    "status" {
        Show-Status
    }
    "dashboard" {
        Start-Dashboard
        Start-Process $WEB_HOST
    }
    "scan" {
        Run-Scan $Target
    }
    "list" {
        node hunt-job.js list @ExtraArgs
    }
    "test" {
        Run-Tests
    }
    "e2e" {
        Run-E2E
    }
    "audit" {
        node hunt-job.js audit-portals
    }
    "watch" {
        Run-Watch
    }
    default {
        Show-Status
        cWhite " Usage: .\hunt-job.ps1 <command> [target]"; nl
        cGray  "   start     - Start web dashboard in background"; nl
        cGray  "   stop      - Stop web dashboard"; nl
        cGray  "   restart   - Restart dashboard"; nl
        cGray  "   status    - Show active services and SQLite DB health"; nl
        cGray  "   dashboard - Start and open dashboard in browser"; nl
        cGray  "   scan      - Trigger ATS scan (e.g. .\hunt-job.ps1 scan 'Backend')"; nl
        cGray  "   list      - Offline browse cached jobs"; nl
        cGray  "   watch     - Run background ATS watcher with toast notifications"; nl
        cGray  "   test      - Run full unit/integration test suites"; nl
        cGray  "   e2e       - Run standalone Playwright browser smoke test"; nl
        cGray  "   audit     - Audit and verify all company ATS endpoints"; nl
        nl
    }
}
