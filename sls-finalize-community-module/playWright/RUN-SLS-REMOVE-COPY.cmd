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

echo.
echo SLS Remove Leftover Copies
echo --------------------------
echo This launcher reviews every section before renaming anything.
echo Only activities whose exact title ends in " - Copy" are considered.
echo It removes the suffix only when the clean title does not already exist.
echo Safe suffix removals continue automatically. Use --dry-run for review only.
echo.

call npm.cmd run sls:remove-copy -- %*
set "result=%errorlevel%"

:finish
echo.
if "%result%"=="0" (
  echo SLS copy-suffix review or verified renaming finished successfully.
) else (
  echo SLS copy-suffix cleanup stopped at a guard. Review the newest report and trace under output.
)
echo.
echo The window will remain open so you can read or copy the output.
echo Press any key when you are ready to close it...
pause >nul
exit /b %result%
