@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\@playwright\test" (
  echo First-time setup is required. Running installation and checks...
  call 00-install-and-check.cmd
  if errorlevel 1 exit /b 1
)

call npm.cmd run sls:one-shot -- %*
set result=%errorlevel%
echo.
if "%result%"=="0" (
  echo SLS automation finished at a requested safe stop or completed successfully.
) else (
  echo SLS automation stopped at a guard. Review the message and newest output report.
)
pause
exit /b %result%
