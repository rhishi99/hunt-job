<#
.SYNOPSIS
  Registers a Windows Scheduled Task that hunts part-time / contract gigs on a timer.

.DESCRIPTION
  This is the "no effort" half of the gig workflow: it runs `hunt-job gigs --once-ish`
  in the background so new part-time/contract DevOps roles land in the local DB
  without anyone remembering to scan.

  It does NOT apply to anything. Applying stays manual and human-reviewed —
  `hunt-job apply <url>` pre-fills the form but never clicks submit.

  Default interval is 6h, which matches the courtesy rate limit the aggregator
  sources (Remotive/Himalayas) are given in src/core/scan/index.js. A shorter
  interval gains nothing: those sources are skipped from cache inside 6h anyway.

.PARAMETER IntervalHours
  Hours between runs. Default 6.

.PARAMETER TaskName
  Scheduled Task name. Default "HuntJob-GigScan".

.PARAMETER Remove
  Unregister the task instead of creating it.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\install-gig-schedule.ps1
  powershell -ExecutionPolicy Bypass -File scripts\install-gig-schedule.ps1 -IntervalHours 12
  powershell -ExecutionPolicy Bypass -File scripts\install-gig-schedule.ps1 -Remove
#>
[CmdletBinding()]
param(
    [int]$IntervalHours = 6,
    [string]$TaskName = 'HuntJob-GigScan',
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$entry    = Join-Path $repoRoot 'hunt-job.js'
$logDir   = Join-Path $repoRoot 'data\logs'

if ($Remove) {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed scheduled task '$TaskName'."
    } else {
        Write-Host "No scheduled task named '$TaskName'."
    }
    return
}

if (-not (Test-Path $entry)) { throw "Cannot find $entry — run this from the hunt-job repo." }
if ($IntervalHours -lt 1) { throw "IntervalHours must be at least 1." }

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "node is not on PATH." }

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir 'gig-scan.log'

# --json keeps the log machine-readable; cmd.exe does the append redirect since
# Scheduled Tasks has no redirection of its own.
$inner  = "`"$node`" `"$entry`" gigs --json >> `"$logFile`" 2>&1"
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c $inner" -WorkingDirectory $repoRoot

# RepetitionDuration of [TimeSpan]::MaxValue means "indefinitely" to the scheduler.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) `
    -RepetitionInterval (New-TimeSpan -Hours $IntervalHours) `
    -RepetitionDuration ([TimeSpan]::MaxValue)

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
    -MultipleInstances IgnoreNew

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask -TaskName $TaskName `
    -Action $action -Trigger $trigger -Settings $settings `
    -Description "Hunt-Job: scan for part-time/contract DevOps roles every $IntervalHours h." | Out-Null

Write-Host "Registered '$TaskName' — every $IntervalHours h, starting in 2 minutes."
Write-Host "  Log:     $logFile"
Write-Host "  Review:  node hunt-job.js gigs --offline"
Write-Host "  Remove:  powershell -ExecutionPolicy Bypass -File scripts\install-gig-schedule.ps1 -Remove"
