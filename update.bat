@echo off
setlocal enabledelayedexpansion
REM One-click update: ensure Node.js (system or portable), crawl sites,
REM export static data, push to GitHub (auto-deploys Pages).
cd /d %~dp0

REM ---- 0) Check the WHOLE project folder was copied (not just this bat) ----
if not exist "crawler\crawler.js" goto :missing_files
if not exist "scripts\export-data.js" goto :missing_files

REM ---- 1) Make sure Node.js >= 22.13 is available ----
REM Priority: system node (if new enough) > bundled portable tools\node > auto-download
set "NODE_CMD="
set "VER_MAJ=0"
set "VER_MIN=0"
where node >nul 2>nul
if not errorlevel 1 (
  set "NODE_CMD=node"
  for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
  if defined NODE_VER (
    for /f "tokens=1-2 delims=.v " %%a in ("!NODE_VER!") do (
      set "VER_MAJ=%%a"
      set "VER_MIN=%%b"
    )
  )
  if !VER_MAJ! LSS 22 set "NODE_CMD="
  if !VER_MAJ! EQU 22 if !VER_MIN! LSS 13 set "NODE_CMD="
)
if defined NODE_CMD (
  echo [Node] using system Node !NODE_VER!
) else if exist "%~dp0tools\node\node.exe" (
  set "NODE_CMD=%~dp0tools\node\node.exe"
  for /f "delims=" %%v in ('"!NODE_CMD!" -v 2^>nul') do set "NODE_VER=%%v"
  echo [Node] using bundled portable Node !NODE_VER!
) else (
  echo [Node] Node.js not found or too old. Downloading portable Node.js v22 LTS...
  echo        source: npmmirror.com ^(Chinese mirror^)
  if not exist "%~dp0tools" mkdir "%~dp0tools"
  curl.exe -L --fail -o "%~dp0tools\node.zip" "https://npmmirror.com/mirrors/node/v22.14.0/node-v22.14.0-win-x64.zip"
  if errorlevel 1 (
    echo.
    echo ERROR: failed to download Node.js. Install Node.js v22.13+ manually from
    echo https://nodejs.org/ then run this script again.
    goto :err
  )
  tar -xf "%~dp0tools\node.zip" -C "%~dp0tools"
  if errorlevel 1 (
    echo.
    echo ERROR: failed to extract Node.js. Install Node.js v22.13+ manually from
    echo https://nodejs.org/ then run this script again.
    goto :err
  )
  if exist "%~dp0tools\node" rmdir /s /q "%~dp0tools\node"
  move /y "%~dp0tools\node-v22.14.0-win-x64" "%~dp0tools\node" >nul
  del "%~dp0tools\node.zip" >nul 2>nul
  set "NODE_CMD=%~dp0tools\node\node.exe"
  echo [Node] portable Node ready at tools\node
)

REM ---- 2) Check git is available ----
where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: git not found. Install git from https://git-scm.com/ then run again.
  goto :err
)

echo === 1/3 Crawl all active sites (52ybcj / MSDN / HelloWindows activators) ===
"%NODE_CMD%" crawler/crawler.js --site=active
if errorlevel 1 goto :err

echo === 2/3 Export static data snapshot ===
"%NODE_CMD%" scripts/export-data.js
if errorlevel 1 goto :err

echo === 3/3 Commit and push to GitHub (triggers Pages deployment) ===
REM Use HTTPS so push only needs GitHub username + password (no SSH key).
REM On first push Git asks for your GitHub username and a Personal Access Token
REM as the password (https://github.com/settings/tokens, scope: repo), then saves it.
git remote set-url origin "https://github.com/sdlw7757/HaiYunISO.git" >nul 2>nul
REM github.com connections from CN are often reset: force HTTP/1.1 and retry
git config http.version HTTP/1.1
git add -A
git commit -m "Update data snapshot %date% %time%"
set "PUSHED=0"
for /l %%i in (1,1,4) do (
  git push
  if not errorlevel 1 (
    set "PUSHED=1"
    goto :pushed
  )
  echo [push] attempt %%i of 4 failed - retrying in 6s...
  timeout /t 6 /nobreak >nul
)
goto :err
:pushed
if not "%PUSHED%"=="1" goto :err

echo.
echo DONE! Live site updates in about 1 minute: https://sdlw7757.github.io/HaiYunISO/
pause
exit /b 0

:missing_files
echo.
echo ERROR: project files not found. You must copy the WHOLE project folder
echo (crawler\, scripts\, data\, config.js ...) together with update.bat,
echo not just this single batch file.
goto :err

:err
echo.
echo FAILED - check the error message above
pause
exit /b 1
