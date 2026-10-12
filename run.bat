@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is not available on PATH.
  echo Install Node.js 22.5 or newer, then run this file again.
  pause
  exit /b 1
)

node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major < 22 || (major === 22 && minor < 5)) { console.error('Node.js 22.5 or newer is required.'); process.exit(1); }"
if errorlevel 1 (
  pause
  exit /b 1
)

node server.js
if errorlevel 1 pause
