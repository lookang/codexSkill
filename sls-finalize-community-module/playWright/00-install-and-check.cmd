@echo off
setlocal
cd /d "%~dp0"

echo Installing the locked Playwright dependency...
call npm.cmd install --cache .npm-cache
if errorlevel 1 goto :failed

echo.
echo Running syntax checks and unit tests...
call npm.cmd run check
if errorlevel 1 goto :failed
call npm.cmd test
if errorlevel 1 goto :failed

echo.
echo SLS Playwright automation is ready.
pause
exit /b 0

:failed
echo.
echo Setup or validation failed. Review the messages above.
pause
exit /b 1
