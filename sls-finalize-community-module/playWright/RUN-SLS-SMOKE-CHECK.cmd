@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\@playwright\test" (
  echo First-time setup is required. Running installation and checks...
  call 00-install-and-check.cmd
  if errorlevel 1 exit /b 1
)

echo.
echo Read-only SLS launcher check: no fields are changed and nothing is saved.
echo.

call npm.cmd run sls:smoke-actions -- %*
set result=%errorlevel%
echo.
if "%result%"=="0" (
  echo All four SLS launcher entry points were found in the live interface.
) else (
  echo Smoke check stopped. Review the message and screenshot under output.
  pause
)
exit /b %result%
