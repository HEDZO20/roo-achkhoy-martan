@echo off
setlocal
cd /d "%~dp0"
title Open Supabase setup
start "" "supabase\SETUP_CLEAN_SUPABASE.sql"
start "" "https://supabase.com/dashboard/project/qidtbympraxtluywvtyh/sql/new"
echo SQL file and Supabase SQL Editor were opened.
echo Copy all SQL text, paste it into the editor and click Run.
pause
