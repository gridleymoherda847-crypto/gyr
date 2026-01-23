@echo off
setlocal

cd /d %~dp0
title LittlePhone Dev Server
echo Restarting LittlePhone...

REM Kill occupied ports
npx --yes kill-port 5173 5174 5175
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Failed to kill ports (npx/kill-port may have issues). Continuing...
  echo.
)

REM Start dev server
cd /d %~dp0
echo Starting Vite on http://localhost:5173 (LAN enabled) ...
npm run dev -- --host --port 5173

echo.
echo Dev server exited. Press any key to close.
pause >nul

endlocal
