@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\@playwright\test" (
  echo Installing the local Playwright dependency...
  call npm.cmd install
  if errorlevel 1 exit /b 1
)
call npm.cmd run sls:add-teacher -- %*
if errorlevel 1 (
  echo.
  echo Teacher addition stopped at a guard. Review the newest report and trace under output.
  pause
  exit /b 1
)
endlocal
