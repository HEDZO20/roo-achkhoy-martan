@echo off
setlocal
title Install Git for Windows

where git >nul 2>&1
if not errorlevel 1 goto :installed

echo Git is not installed.
echo Trying to install Git with Windows Package Manager...
where winget >nul 2>&1
if errorlevel 1 goto :browser
winget install --id Git.Git -e --source winget
if errorlevel 1 goto :browser

echo.
echo Git installation finished.
echo Close this window, restart File Explorer, and run 3_UPLOAD_TO_GITHUB.bat.
pause
exit /b 0

:browser
echo Opening the official Git for Windows download page...
start "" "https://git-scm.com/download/win"
echo Install Git using the default settings.
echo Then restart File Explorer and run 3_UPLOAD_TO_GITHUB.bat.
pause
exit /b 1

:installed
echo Git is already installed:
git --version
echo.
echo Now run 3_UPLOAD_TO_GITHUB.bat
pause
