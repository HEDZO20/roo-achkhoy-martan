@echo off
setlocal
cd /d "%~dp0"
title Create private GitHub repository

echo ========================================================
echo   STEP 1 - CREATE PRIVATE GITHUB REPOSITORY
echo ========================================================
echo.
echo A GitHub page will open in your browser.
echo Repository name: roo-achkhoy-martan
echo Visibility: Private
echo Do NOT add README, .gitignore or License on GitHub.
echo.
start "" "https://github.com/new?name=roo-achkhoy-martan&description=ROO-information-system&visibility=private"
echo After creating the repository, copy its HTTPS address.
echo Then run: 3_UPLOAD_TO_GITHUB.bat
pause
