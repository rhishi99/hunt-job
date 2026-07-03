@echo off
setlocal enabledelayedexpansion
title Hunt-Job — AI Job Search Agent
cd /d "%~dp0"

:: ── Load .env if present ─────────────────────────────────────────────────────
if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        if not "%%a"=="" if not "%%a:~0,1%%"=="#" set "%%a=%%b"
    )
)

:: ── Require Node.js ──────────────────────────────────────────────────────────
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERROR: Node.js not found. Download from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: ── Direct command-line mode ─────────────────────────────────────────────────
::  Any args are forwarded verbatim to the Node CLI, so EVERY command + flag
::  works from the .bat: scan/list/watch/dashboard/detect/audit-portals/hunt/...
::    hunt-job.bat scan --archetype "Backend Engineer" --since 14 --limit 20
::    hunt-job.bat list -a "DevOps Engineer" --new
::    hunt-job.bat watch --archetype "SRE" --interval 30
if not "%~1"=="" (
    node "%~dp0hunt-job.js" %*
    echo.
    pause
    exit /b %errorlevel%
)

:: ── No args — launcher menu ───────────────────────────────────────────────────
:MENU
cls
echo.
echo  ========================================
echo    HUNT-JOB - AI Job Search Agent
echo  ========================================
echo.
echo  -- Find Jobs ---------------------------
echo   [1] Full Interactive Menu (recommended)
echo   [2] Scan Job Portals (live, with filters)
echo   [3] Browse Saved Jobs (instant, offline)
echo   [4] Watch for New Roles (auto-notify)
echo.
echo  -- Act On A Job ------------------------
echo   [5] Evaluate a Job
echo   [6] Generate Resume
echo   [7] Interview Prep
echo   [Y] Apply to a Job (AI auto-fill in browser)
echo.
echo  -- Portals ^& Dashboard -----------------
echo   [8] Web Dashboard (http://127.0.0.1:7777)
echo   [9] Detect a Company's ATS Platform
echo   [A] Audit / Re-verify Company Registry
echo.
echo  -- Profile ^& Setup ---------------------
echo   [S] Setup API Keys        [I] Init Profile
echo   [E] Edit Profile          [P] Parse Resume PDF
echo   [R] Resume Builder (6 templates, browser)
echo.
echo   [0] Exit
echo.
set /p choice=  Enter your choice:

if "%choice%"=="1" ( node hunt-job.js interactive & goto END )
if "%choice%"=="2" goto ASK_SCAN
if "%choice%"=="3" goto ASK_LIST
if "%choice%"=="4" goto ASK_WATCH
if "%choice%"=="5" goto ASK_EVALUATE
if "%choice%"=="6" goto ASK_RESUME
if "%choice%"=="7" goto ASK_PREP
if /i "%choice%"=="Y" goto ASK_APPLY
if "%choice%"=="8" ( node hunt-job.js dashboard & goto END )
if "%choice%"=="9" goto ASK_DETECT
if /i "%choice%"=="A" ( node hunt-job.js audit-portals & goto END )
if /i "%choice%"=="S" ( node hunt-job.js setup & goto END )
if /i "%choice%"=="I" ( node hunt-job.js profile init & goto END )
if /i "%choice%"=="E" ( node hunt-job.js profile edit & goto END )
if /i "%choice%"=="P" goto ASK_PARSE
if /i "%choice%"=="R" ( start "" "%~dp0resume-builder\index.html" & goto END )
if "%choice%"=="0" exit /b 0
goto MENU

:: ── Guided prompts ────────────────────────────────────────────────────────────
:ASK_SCAN
echo.
set /p archetype=  Target role (e.g. Backend Engineer):
set /p sincedays=  Only postings newer than N days (blank = all):
set "sinceflag="
if not "%sincedays%"=="" set "sinceflag=--since %sincedays%"
node hunt-job.js scan --archetype "%archetype%" %sinceflag% --limit 40
goto END

:ASK_LIST
echo.
set /p archetype=  Role to filter saved jobs by (blank = all):
set "aflag="
if not "%archetype%"=="" set "aflag=--archetype "%archetype%""
node hunt-job.js list %aflag% --limit 40
goto END

:ASK_WATCH
echo.
set /p archetype=  Role to watch:
set /p mins=  Check every how many minutes (blank = 30):
set "iflag="
if not "%mins%"=="" set "iflag=--interval %mins%"
node hunt-job.js watch --archetype "%archetype%" %iflag%
goto END

:ASK_EVALUATE
echo.
set /p job_input=  Paste job URL or description (blank = interactive):
node hunt-job.js evaluate "%job_input%"
goto END

:ASK_RESUME
echo.
set /p job_id=  Job ID from evaluation (e.g. job_1234567890):
node hunt-job.js resume "%job_id%"
goto END

:ASK_PREP
echo.
set /p prep_input=  Job description text or path to .txt file:
node hunt-job.js prep "%prep_input%"
goto END

:ASK_APPLY
echo.
set /p apply_url=  Job URL to apply to (auto-fill opens in browser):
node hunt-job.js apply "%apply_url%"
goto END

:ASK_DETECT
echo.
set /p careers_url=  Company careers URL:
node hunt-job.js detect "%careers_url%"
goto END

:ASK_PARSE
echo.
set /p pdf_path=  Path to resume PDF:
node hunt-job.js parse-resume "%pdf_path%"
goto END

:END
echo.
pause
goto MENU
