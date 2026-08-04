@echo off
chcp 65001 >nul
start "" notepad "%~dp0supabase\SETUP_V26_FULL.sql"
start "" "https://supabase.com/dashboard"
