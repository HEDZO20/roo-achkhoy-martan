@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
title Upload ROO site to GitHub

echo ========================================================
echo   STEP 2 - UPLOAD SITE TO PRIVATE GITHUB REPOSITORY
echo ========================================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo ERROR: Git is not installed or Windows has not refreshed PATH.
  echo Run 2_INSTALL_GIT_IF_NEEDED.bat first.
  pause
  exit /b 1
)

set "REPO_URL="
set /p "REPO_URL=Paste the HTTPS repository address: "
if not defined REPO_URL (
  echo ERROR: Repository address was not entered.
  pause
  exit /b 1
)

for /f "delims=" %%A in ('git config --global user.name 2^>nul') do set "GIT_NAME=%%A"
if not defined GIT_NAME (
  set /p "GIT_NAME=Enter your name for Git commits: "
  git config --global user.name "%GIT_NAME%"
)
for /f "delims=" %%A in ('git config --global user.email 2^>nul') do set "GIT_EMAIL=%%A"
if not defined GIT_EMAIL (
  set /p "GIT_EMAIL=Enter the email used in GitHub: "
  git config --global user.email "%GIT_EMAIL%"
)

if not exist ".git\config" (
  git init
  if errorlevel 1 goto :fail
)
git branch -M main

git add -A
if errorlevel 1 goto :fail

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Initial ONLINE V14 deployment"
  if errorlevel 1 goto :fail
) else (
  echo No new files need to be committed.
)

git remote get-url origin >nul 2>&1
if not errorlevel 1 git remote remove origin
git remote add origin "%REPO_URL%"
if errorlevel 1 goto :fail

echo.
echo GitHub may open a browser window for secure sign-in.
git push -u origin main
if errorlevel 1 goto :fail

echo.
echo SUCCESS: The project is stored in GitHub.
echo Now run 4_OPEN_VERCEL_DEPLOY.bat
pause
exit /b 0

:fail
echo.
echo ERROR: Upload was not completed.
echo Check the repository address, Internet connection and GitHub sign-in.
pause
exit /b 1
