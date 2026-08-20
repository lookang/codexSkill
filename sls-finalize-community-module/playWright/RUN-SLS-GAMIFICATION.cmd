@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\@playwright\test" (
  echo First-time setup is required. Running installation and checks...
  call 00-install-and-check.cmd
  if errorlevel 1 exit /b 1
)

call npm.cmd run sls:gamify -- %*
set result=%errorlevel%
echo.
if "%result%"=="0" (
  echo Gamification finished. Review the verified browser state and report under output.
) else (
  echo Gamification stopped at a guard. Review the newest report and trace under output.
  pause
)
exit /b %result%
