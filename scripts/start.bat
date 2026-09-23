@echo off
REM Nexus Forge — Windows launcher
REM Requires: Bun (https://bun.sh)  and  Node/pnpm for the UI build step.
setlocal
cd /d "%~dp0.."

echo --- NEXUS FORGE --------------------------------
where bun >nul 2>&1
if errorlevel 1 (
  echo [X] Bun not found. Install it first: https://bun.sh
  exit /b 1
)

if not exist "node_modules" (
  echo . first run: installing dependencies...
  call pnpm install || call bunx --bun pnpm install
)

if not exist "apps\ui\dist\index.html" (
  echo . building UI...
  pushd apps\ui
  call ..\..\node_modules\.bin\vite build 2>nul || call node_modules\.bin\vite build
  popd
)

echo . starting studio -^> http://127.0.0.1:5180
bun run packages\core\src\main.ts serve
endlocal
