@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title ROO GitHub Update - Fixed
echo This updater uses the Git already installed on this computer.
echo It does not use winget or GitHub CLI.
echo GitHub may open one browser window for secure sign-in.
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%~dp0' -Recurse -File -ErrorAction SilentlyContinue ^| Unblock-File -ErrorAction SilentlyContinue; & '%~dp0UPDATE_GITHUB_FIXED.ps1'"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo The update stopped with an error.
  echo Send a screenshot of this whole window to ChatGPT.
) else (
  echo SUCCESS. The project and GitHub Pages were updated.
)
echo.
pause
exit /b %EXIT_CODE%
