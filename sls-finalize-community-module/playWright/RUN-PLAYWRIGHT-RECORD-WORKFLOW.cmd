@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\@playwright\test" (
  echo First-time setup is required. Running installation and checks...
  call 00-install-and-check.cmd
  if errorlevel 1 exit /b 1
)

echo.
echo Playwright Workflow Recorder
echo ----------------------------
echo Demonstrate the workflow in Chrome while Playwright Codegen records it.
echo Navigation across websites and tabs is supported. Raw recordings are kept
echo local under recordings until they are reviewed and converted to automation.
echo.

call npm.cmd run sls:record -- %*
set "result=%errorlevel%"

echo.
if "%result%"=="0" (
  echo Recording finished successfully.
) else (
  echo Recording stopped before a usable script was produced.
)
echo Press any key to close this window...
pause >nul
exit /b %result%
