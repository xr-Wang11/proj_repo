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

if not exist "%ROOT_DIR%dist\index.html" (
  echo dist\index.html was not found.
  echo Run build-and-open.bat first.
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
