@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
title ROO V26.3.2 Installer

rem Remove the trailing backslash from the source path.
rem A trailing backslash before a quote broke the previous git --work-tree command.
set "SRC=%~dp0"
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"

set "LOG=%SRC%\INSTALL_V26_3_2.log"
>"%LOG%" echo ROO V26.3.2 installer log
>>"%LOG%" echo Started: %DATE% %TIME%
>>"%LOG%" echo Source: %SRC%

echo ============================================================
echo ROO V26.3.2 - CONFIGURE AND PUBLISH
echo Fixed Git staging: no ROBOCOPY and no trailing-slash issue.
echo Use the ROO Supabase project, not LAMAN.
echo ============================================================
echo.

set /p ROO_URL=Project URL (https://xxxxx.supabase.co): 
set /p ROO_KEY=Publishable key (sb_publishable_...): 

if "%ROO_URL%"=="" goto BAD_INPUT
if "%ROO_KEY%"=="" goto BAD_INPUT
if /I not "%ROO_URL:~0,8%"=="https://" goto BAD_INPUT
if /I not "%ROO_KEY:~0,15%"=="sb_publishable_" goto BAD_INPUT

>"%SRC%\config.js" echo window.ROO_CONFIG = {
>>"%SRC%\config.js" echo   supabaseUrl: '%ROO_URL%',
>>"%SRC%\config.js" echo   supabaseKey: '%ROO_KEY%',
>>"%SRC%\config.js" echo   siteName: 'ROO Achkhoy-Martan',
>>"%SRC%\config.js" echo   version: '26.3.2'
>>"%SRC%\config.js" echo };

if not exist "%SRC%\index.html" goto SOURCE_ERROR
if not exist "%SRC%\app.js" goto SOURCE_ERROR
if not exist "%SRC%\app.css" goto SOURCE_ERROR
if not exist "%SRC%\config.js" goto SOURCE_ERROR
findstr /C:"V26.3.2" "%SRC%\index.html" >nul 2>nul
if errorlevel 1 goto SOURCE_ERROR

echo config.js created and source files verified.
>>"%LOG%" echo Source verification: OK

where git >nul 2>nul
if errorlevel 1 goto NO_GIT

set "WORK=%TEMP%\roo-v26-3-2-%RANDOM%%RANDOM%"
set "REPO=https://github.com/HEDZO20/roo-achkhoy-martan.git"

echo Cloning repository...
>>"%LOG%" echo Cloning to: %WORK%
git clone "%REPO%" "%WORK%" >>"%LOG%" 2>&1
if errorlevel 1 goto GIT_ERROR

set "BACKUP=backup-before-v26-3-2-%RANDOM%%RANDOM%"
git -C "%WORK%" branch "%BACKUP%" >>"%LOG%" 2>&1
if errorlevel 1 goto GIT_ERROR
git -C "%WORK%" push origin "%BACKUP%" >>"%LOG%" 2>&1
if errorlevel 1 goto GIT_ERROR

echo Backup branch created: %BACKUP%
echo Staging V26.3.2 files...

rem Use environment variables instead of --work-tree="path\".
rem This avoids the Windows argument parsing bug seen in V26.3.1.
set "GIT_DIR=%WORK%\.git"
set "GIT_WORK_TREE=%SRC%"
pushd "%SRC%" >nul 2>nul
if errorlevel 1 goto SOURCE_ERROR
git add --all -- . >>"%LOG%" 2>&1
set "STAGE_RC=%ERRORLEVEL%"
popd >nul 2>nul
if not "%STAGE_RC%"=="0" goto STAGE_ERROR

git diff --cached --quiet
if not errorlevel 1 goto NO_CHANGES

git -C "%WORK%" config user.name "HEDZO20" >>"%LOG%" 2>&1
git -C "%WORK%" config user.email "hedzo20@users.noreply.github.com" >>"%LOG%" 2>&1

git commit -m "V26.3.2 fix Git staging and open registration" >>"%LOG%" 2>&1
if errorlevel 1 goto GIT_ERROR

git push origin HEAD:main >>"%LOG%" 2>&1
if errorlevel 1 goto GIT_ERROR

echo.
echo SUCCESS: V26.3.2 was pushed to GitHub.
echo Wait for the green GitHub Pages deployment check.
>>"%LOG%" echo Publish: SUCCESS
start "" "https://github.com/HEDZO20/roo-achkhoy-martan/actions"
echo Then open: https://hedzo20.github.io/roo-achkhoy-martan/?v=2632
pause
exit /b 0

:NO_CHANGES
echo.
echo No changes were detected. V26.3.2 may already be in GitHub.
>>"%LOG%" echo Publish: NO CHANGES
start "" "https://github.com/HEDZO20/roo-achkhoy-martan/actions"
pause
exit /b 0

:BAD_INPUT
echo ERROR: Invalid Project URL or Publishable key.
>>"%LOG%" echo ERROR: BAD_INPUT
pause
exit /b 1

:SOURCE_ERROR
echo ERROR: The full V26.3.2 folder was not extracted correctly.
>>"%LOG%" echo ERROR: SOURCE_ERROR
pause
exit /b 1

:NO_GIT
echo ERROR: Git for Windows is not installed or is not in PATH.
>>"%LOG%" echo ERROR: NO_GIT
pause
exit /b 1

:STAGE_ERROR
echo ERROR: Git could not stage the V26.3.2 files.
echo Send INSTALL_V26_3_2.log if this repeats.
>>"%LOG%" echo ERROR: STAGE_ERROR code=%STAGE_RC%
pause
exit /b 1

:GIT_ERROR
echo ERROR: Git operation failed.
echo Send INSTALL_V26_3_2.log if this repeats.
>>"%LOG%" echo ERROR: GIT_ERROR code=%ERRORLEVEL%
pause
exit /b 1
