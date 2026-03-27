@echo off
:: Workday Admin Dashboard — startup script
:: Double-click this file to start the app, then open http://localhost:3000

SET NODE_DIR=C:\Users\KaraPrigodich\Downloads\node-v24.14.1-win-x64\node-v24.14.1-win-x64
SET NODE_EXE=%NODE_DIR%\node.exe
SET NPM_CMD=%NODE_DIR%\npm.cmd
SET DASHBOARD_DIR=%~dp0workday-dashboard

echo ============================================
echo   Workday Admin Dashboard
echo ============================================
echo.
echo Node path : %NODE_EXE%
echo App path  : %DASHBOARD_DIR%
echo.

:: Check node.exe actually exists
IF NOT EXIST "%NODE_EXE%" (
    echo ERROR: Could not find node.exe at:
    echo   %NODE_EXE%
    echo.
    echo Please check that the zip was fully extracted.
    echo.
    pause
    exit /b 1
)
echo [OK] Found node.exe

:: Check dashboard folder exists
IF NOT EXIST "%DASHBOARD_DIR%" (
    echo ERROR: Could not find the workday-dashboard folder at:
    echo   %DASHBOARD_DIR%
    echo.
    echo Make sure you ran: git pull origin claude/workday-admin-dashboard-gFQn3
    echo.
    pause
    exit /b 1
)
echo [OK] Found workday-dashboard folder

cd /d "%DASHBOARD_DIR%"

:: Install dependencies if needed
IF NOT EXIST "node_modules" (
    echo.
    echo Installing dependencies for the first time ~30 seconds...
    "%NPM_CMD%" install
    echo.
)
echo [OK] Dependencies ready

echo.
echo Dashboard starting — open http://localhost:3000 in your browser.
echo Press Ctrl+C to stop.
echo.
"%NPM_CMD%" run dev

echo.
echo The app stopped. See any error above.
pause
