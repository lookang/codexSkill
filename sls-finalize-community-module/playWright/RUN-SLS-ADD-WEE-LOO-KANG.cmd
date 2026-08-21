@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\@playwright\test" (
  echo First-time setup is required. Running installation and checks...
  call 00-install-and-check.cmd
  if errorlevel 1 exit /b 1
)

echo.
echo Add WEE LOO KANG and Completed-Assignment Printing
echo --------------------------------------------------
echo This run preserves existing teachers and permissions, adds Wee Loo Kang when
echo needed, and enables Allow viewing as print-friendly completed assignment.
echo It saves Module Settings, reopens them, and verifies both results.
echo.

call npm.cmd run sls:add-teacher -- %*
set result=%errorlevel%
echo.
if "%result%"=="0" (
  echo Teacher credit finished. Review the verified browser state and report under output.
) else (
  echo Teacher addition stopped at a guard. Review the newest report and trace under output.
  pause
)
exit /b %result%
