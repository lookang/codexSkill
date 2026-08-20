@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\@playwright\test" (
  echo First-time setup is required. Running installation and checks...
  call 00-install-and-check.cmd
  if errorlevel 1 (
    set "result=1"
    goto finish
  )
)

call npm.cmd run sls:one-shot -- %*
set "result=%errorlevel%"

:finish
echo.
if "%result%"=="0" (
  echo SLS automation finished at a requested safe stop or completed successfully.
) else (
  echo SLS automation stopped at a guard. Review the message and newest output report.
)
echo.
echo The window will remain open so you can read or copy the output.
echo Press any key when you are ready to close it...
pause >nul
exit /b %result%
