@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
title Update ROO site in GitHub

where git >nul 2>&1
if errorlevel 1 (
  echo ERROR: Git is not installed.
  pause
  exit /b 1
)
if not exist ".git\config" (
  echo ERROR: This folder is not connected to GitHub.
  echo Run 3_UPLOAD_TO_GITHUB.bat first.
  pause
  exit /b 1
)

git add -A
if errorlevel 1 goto :fail
git diff --cached --quiet
if not errorlevel 1 (
  echo There are no changes to upload.
  pause
  exit /b 0
)

git commit -m "Update ROO website"
if errorlevel 1 goto :fail
git push origin main
if errorlevel 1 goto :fail

echo.
echo SUCCESS: GitHub was updated.
echo Vercel will publish the new version automatically.
pause
exit /b 0

:fail
echo.
echo ERROR: Update was not uploaded.
pause
exit /b 1
