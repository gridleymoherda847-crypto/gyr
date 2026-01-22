@echo off
setlocal

cd /d %~dp0
echo Restarting LittlePhone...

REM Kill occupied ports
npx --yes kill-port 5173 5174 5175

REM Start dev server
cd /d %~dp0
npm run dev

endlocal
