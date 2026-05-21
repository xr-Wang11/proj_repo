@echo off
setlocal

set "ROOT_DIR=%~dp0"

pushd "%ROOT_DIR%"

where node >nul 2>nul
if errorlevel 1 (
  echo node was not found in PATH.
  echo Please make sure Node.js is installed correctly.
  pause
  popd
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd was not found in PATH.
  echo Please make sure Node.js and npm are installed correctly.
  pause
  popd
  exit /b 1
)

echo Building web-vue...
call npm.cmd run build
if errorlevel 1 (
  echo Build failed.
  pause
  popd
  exit /b 1
)

call node serve-dist.cjs
if errorlevel 1 (
  echo.
  echo Failed to start or open the local page.
  pause
  popd
  exit /b 1
)

popd
endlocal
