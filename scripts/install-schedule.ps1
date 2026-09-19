<#
.SYNOPSIS
  Registers a Windows Scheduled Task that runs the full Hunt-Job funnel on a timer.

.DESCRIPTION
  Copy of install-gig-schedule.ps1, pointed at `hunt-job run --once` instead of
  `hunt-job gigs` — the single entry point for the autonomous loop
  (docs/fable51-answers.md §1.6, §0.3 brief 5): scan -> prefilter -> evaluate
  -> morning digest, all through the durable task queue.

  Applying/tailoring/prep still require a human: `run` only scores and
  digests. `hunt-job apply <url>` pre-fills a form but never clicks submit.

  Default interval is 3h (§1.6: "3h, not 30 min — the ATS boards change
  slowly and the aggregator sources are cached for 6h anyway").

  NOTE (backlog B-27): this script is checked in but deliberately NOT run/
  installed here — that is the owner's call, not something to do silently
  during an unrelated brief.

.PARAMETER IntervalHours
  Hours between runs. Default 3.

.PARAMETER TaskName
  Scheduled Task name. Default "HuntJob-Run".

.PARAMETER Remove
  Unregister the task instead of creating it.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\install-schedule.ps1
  powershell -ExecutionPolicy Bypass -File scripts\install-schedule.ps1 -IntervalHours 6
  powershell -ExecutionPolicy Bypass -File scripts\install-schedule.ps1 -Remove
#>
[CmdletBinding()]
param(
    [int]$IntervalHours = 3,
    [string]$TaskName = 'HuntJob-Run',
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
$logFile = Join-Path $logDir 'run.log'

# cmd.exe does the append redirect since Scheduled Tasks has no redirection of its own.
$inner  = "`"$node`" `"$entry`" run --once >> `"$logFile`" 2>&1"
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
    -Description "Hunt-Job: scan + prefilter + evaluate + digest every $IntervalHours h." | Out-Null

Write-Host "Registered '$TaskName' — every $IntervalHours h, starting in 2 minutes."
Write-Host "  Log:     $logFile"
Write-Host "  Digest:  data\digest\<date>.md"
Write-Host "  Remove:  powershell -ExecutionPolicy Bypass -File scripts\install-schedule.ps1 -Remove"
