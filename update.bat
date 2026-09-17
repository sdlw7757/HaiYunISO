@echo off
REM One-click update: crawl sites, export static data, push to GitHub (auto-deploys Pages)
cd /d %~dp0

echo === 1/3 Crawl all active sites (52ybcj / MSDN / HelloWindows activators) ===
node crawler/crawler.js --site=active
if errorlevel 1 goto :err

echo === 2/3 Export static data snapshot ===
node scripts/export-data.js
if errorlevel 1 goto :err

echo === 3/3 Commit and push to GitHub (triggers Pages deployment) ===
git add -A
git commit -m "Update data snapshot %date% %time%"
git push
if errorlevel 1 goto :err

echo.
echo DONE! Live site updates in about 1 minute: https://sdlw7757.github.io/HaiYunISO/
pause
exit /b 0

:err
echo.
echo FAILED - check the error message above
pause
exit /b 1
