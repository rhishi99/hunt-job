@echo off
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
    echo  ERROR: Node.js not found.
    echo  Download from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: ── Direct command-line mode ─────────────────────────────────────────────────
::  Usage:  hunt-job.bat <command> [args...]
::  e.g.:   hunt-job.bat evaluate "https://careers.google.com/..."
::          hunt-job.bat scan --archetype "Backend Engineer"
::          hunt-job.bat resume job_1234567890
::          hunt-job.bat prep "job_description.txt"
::          hunt-job.bat setup
::          hunt-job.bat profile init
::          hunt-job.bat profile edit
::          hunt-job.bat parse-resume "resume.pdf"

if /i "%~1"=="evaluate"     goto CMD_EVALUATE
if /i "%~1"=="scan"         goto CMD_SCAN
if /i "%~1"=="resume"       goto CMD_RESUME
if /i "%~1"=="prep"         goto CMD_PREP
if /i "%~1"=="setup"        goto CMD_SETUP
if /i "%~1"=="parse-resume" goto CMD_PARSE
if /i "%~1"=="profile"      goto CMD_PROFILE
if /i "%~1"=="start"        goto CMD_INTERACTIVE
if /i "%~1"=="menu"         goto CMD_INTERACTIVE

:: ── No args — show launcher menu ─────────────────────────────────────────────
:MENU
cls
echo.
echo  ========================================
echo    HUNT-JOB - AI Job Search Agent
echo  ========================================
echo.
echo  -- Job Search --------------------------
echo   [1] Full Interactive Menu (recommended)
echo   [2] Evaluate a Job
echo   [3] Scan Job Portals
echo   [4] Generate Resume
echo   [5] Interview Prep
echo.
echo  -- Profile ----------------------------
echo   [6] Setup API Keys
echo   [7] Initialize Profile
echo   [8] Edit Profile
echo   [9] Parse Resume PDF (build from PDF)
echo.
echo  -- Resume Builder ---------------------
echo   [R] Open Resume Builder (6 templates, edit + export PDF)
echo.
echo   [0] Exit
echo.
set /p choice=  Enter your choice:

if "%choice%"=="1" goto CMD_INTERACTIVE
if "%choice%"=="2" goto ASK_EVALUATE
if "%choice%"=="3" goto ASK_SCAN
if "%choice%"=="4" goto ASK_RESUME
if "%choice%"=="5" goto ASK_PREP
if "%choice%"=="6" goto CMD_SETUP
if "%choice%"=="7" goto CMD_PROFILE_INIT
if "%choice%"=="8" goto CMD_PROFILE_EDIT
if "%choice%"=="9" goto ASK_PARSE
if /i "%choice%"=="R" goto CMD_RESUME_BUILDER
if "%choice%"=="0" exit /b 0
goto MENU

:: ── Interactive prompts for menu-driven mode ──────────────────────────────────
:ASK_EVALUATE
echo.
set /p job_input=  Paste job URL or description (or press Enter for interactive):
node src/cli/evaluateJob.js "%job_input%"
goto END

:ASK_SCAN
echo.
set /p archetype=  Target archetype (e.g. Backend Engineer, Data Engineer):
node src/cli/scanPortals.js --archetype "%archetype%"
goto END

:ASK_RESUME
echo.
set /p job_id=  Job ID from evaluation (e.g. job_1234567890):
node src/cli/generateResume.js "%job_id%"
goto END

:ASK_PREP
echo.
set /p prep_input=  Job description text or path to .txt file:
node src/cli/prepareInterview.js "%prep_input%"
goto END

:ASK_PARSE
echo.
set /p pdf_path=  Path to resume PDF:
node src/cli/parseResume.js "%pdf_path%"
goto END

:: ── Direct CLI commands ───────────────────────────────────────────────────────
:CMD_INTERACTIVE
node src/cli/interactive.js
goto END

:CMD_EVALUATE
node src/cli/evaluateJob.js %~2 %~3 %~4
goto END

:CMD_SCAN
node src/cli/scanPortals.js %~2 %~3 %~4 %~5
goto END

:CMD_RESUME
node src/cli/generateResume.js %~2
goto END

:CMD_PREP
node src/cli/prepareInterview.js %~2 %~3
goto END

:CMD_SETUP
node src/cli/setupApiKey.js
goto END

:CMD_PARSE
node src/cli/parseResume.js %~2
goto END

:CMD_PROFILE
if /i "%~2"=="init" goto CMD_PROFILE_INIT
if /i "%~2"=="edit" goto CMD_PROFILE_EDIT
goto CMD_PROFILE_EDIT

:CMD_PROFILE_INIT
node src/cli/profileInit.js
goto END

:CMD_PROFILE_EDIT
node src/cli/profileEdit.js
goto END

:CMD_RESUME_BUILDER
echo.
echo  Opening Resume Builder in your browser...
start "" "%~dp0resume-builder\index.html"
goto END

:: ── Done ─────────────────────────────────────────────────────────────────────
:END
echo.
pause
