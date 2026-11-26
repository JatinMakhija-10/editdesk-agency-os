@echo off
cd /d "%~dp0"
if not exist "dist\index.html" (
  call npm run build
)
if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" .
) else (
  node launch-desktop.mjs
)
