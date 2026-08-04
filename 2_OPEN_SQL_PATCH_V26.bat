@echo off
chcp 65001 >nul
start "" notepad "%~dp0supabase\PATCH_V26_SMART_ANALYSIS.sql"
start "" "https://supabase.com/dashboard"
