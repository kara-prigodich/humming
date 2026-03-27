@echo off
:: Workday Admin Dashboard — startup script
:: Double-click this file to start the app, then open http://localhost:3000

SET NODE_DIR=C:\Users\KaraPrigodich\Downloads\node-v24.14.1-win-x64\node-v24.14.1-win-x64
SET PATH=%NODE_DIR%;%PATH%
SET DASHBOARD_DIR=%~dp0workday-dashboard

echo Starting Workday Admin Dashboard...
echo.

:: Check Node is accessible
node --version >nul 2>&1
IF ERRORLEVEL 1 (
    echo ERROR: Could not find Node.js at %NODE_DIR%
    echo Please check that you extracted the zip to your Downloads folder.
    pause
    exit /b 1
)

cd /d "%DASHBOARD_DIR%"

:: Install dependencies if needed
IF NOT EXIST "node_modules" (
    echo Installing dependencies for the first time — this takes ~30 seconds...
    npm install
)

echo.
echo Dashboard is starting. Open http://localhost:3000 in your browser.
echo Press Ctrl+C to stop.
echo.
npm run dev
