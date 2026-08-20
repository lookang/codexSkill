@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\@playwright\test" (
  echo Run 00-install-and-check.cmd first.
  pause
  exit /b 1
)

call npm.cmd run sls:auth
set result=%errorlevel%
echo.
if not "%result%"=="0" echo Authentication was not verified.
pause
exit /b %result%
