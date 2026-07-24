@echo off
setlocal
title Deploy GitHub repository to Vercel

echo ========================================================
echo   STEP 3 - PUBLISH THE SITE WITH VERCEL
echo ========================================================
echo.
echo In Vercel:
echo 1. Click Add New - Project.
echo 2. Import the roo-achkhoy-martan GitHub repository.
echo 3. Framework Preset: Other.
echo 4. Build Command: leave empty.
echo 5. Output Directory: leave empty.
echo 6. Click Deploy.
echo.
start "" "https://vercel.com/new"
pause
