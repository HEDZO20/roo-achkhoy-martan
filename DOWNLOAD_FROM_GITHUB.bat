@echo off
setlocal
title Download project from GitHub

echo This file is only needed if you delete the local folder later.
echo Open your private GitHub repository, click Code, and copy the HTTPS URL.
echo Then run this command in a new empty folder:
echo git clone REPOSITORY_URL
start "" "https://github.com/"
pause
