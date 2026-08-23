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
echo SLS Selected Finalization Workflow
echo ----------------------------------
echo Select Automation, Page Break, Thumbnail, Gamification, ACP Interactive,
echo Add Wee Loo Kang, Remove Copy Suffixes, or any combination.
echo AUTO checks all seven in safe order; each stage skips work already complete.
echo After selection, the workflow runs without review pauses or DELETE prompts.
echo A guard stops the sequence before later stages are started.
echo.

call npm.cmd run sls:selected -- %*
set "result=%errorlevel%"

:finish
echo.
if "%result%"=="0" (
  echo All selected SLS stages finished successfully.
) else (
  echo The selected workflow stopped at a guard. Review the report shown above.
  echo.
  echo This window remains open only because the workflow did not finish successfully.
  echo Press any key after you have read or copied the error...
  pause >nul
)
echo.
exit /b %result%
