@echo off
setlocal
title Configure Vercel URL in Supabase

echo ========================================================
echo   STEP 4 - ADD THE VERCEL ADDRESS TO SUPABASE
echo ========================================================
echo.
echo Copy your final address, for example:
echo https://roo-achkhoy-martan.vercel.app
echo.
echo Set it as Site URL.
echo Add this Redirect URL:
echo https://roo-achkhoy-martan.vercel.app/**
echo.
start "" "https://supabase.com/dashboard/project/qidtbympraxtluywvtyh/auth/url-configuration"
pause
