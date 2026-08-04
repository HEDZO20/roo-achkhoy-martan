@echo off
cd /d "%~dp0"
start "" notepad.exe "PATCH_V26_3_REMOVE_INVITE_GATE.sql"
start "" "https://supabase.com/dashboard"
