ONLINE V14 - GITHUB FIXED

WHY THE PREVIOUS BAT FILE FAILED
The previous Windows batch files contained UTF-8 Russian text and Unix line endings.
Some Windows command processors read those files incorrectly and tried to run words as commands.

CORRECT ORDER
1. Run 1_OPEN_GITHUB_NEW_REPO.bat
2. Create a PRIVATE empty repository named roo-achkhoy-martan
3. Run 2_INSTALL_GIT_IF_NEEDED.bat
4. Run 3_UPLOAD_TO_GITHUB.bat and paste the repository HTTPS URL
5. Run 4_OPEN_VERCEL_DEPLOY.bat
6. After deployment, run 5_OPEN_SUPABASE_URL_SETTINGS.bat

All BAT files in V14 are ASCII-only and use Windows CRLF line endings.
