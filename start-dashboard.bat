@echo off
:: Workday Admin Dashboard — startup script
:: Double-click this file to start the app, then open http://localhost:3000

SET NODE_DIR=C:\Users\KaraPrigodich\Downloads\node-v24.14.1-win-x64\node-v24.14.1-win-x64
SET NODE_EXE=%NODE_DIR%\node.exe
SET NPM_CMD=%NODE_DIR%\npm.cmd
SET DASHBOARD_DIR=%~dp0workday-dashboard

echo Starting Workday Admin Dashboard...
echo.

:: Check node.exe actually exists
IF NOT EXIST "%NODE_EXE%" (
    echo ERROR: Could not find node.exe at:
    echo   %NODE_EXE%
    echo.
    echo Please check that the file exists and try again.
    pause
    exit /b 1
)

cd /d "%DASHBOARD_DIR%"

:: Install dependencies if needed
IF NOT EXIST "node_modules" (
    echo Installing dependencies for the first time — this takes ~30 seconds...
    "%NPM_CMD%" install
    echo.
)

echo Dashboard is starting. Open http://localhost:3000 in your browser.
echo Press Ctrl+C to stop.
echo.
"%NPM_CMD%" run dev
