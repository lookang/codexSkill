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
echo Press Enter or choose COMPLETE to run the same functional flow as:
echo   1. RUN-SLS-AUTOMATION.cmd
echo   2. RUN-SLS-PAGE-BREAK.cmd
echo   3. RUN-SLS-THUMBNAIL.cmd
echo   4. RUN-SLS-ADD-WEE-LOO-KANG.cmd
echo Automation is surgical: it updates existing questions without duplicating,
echo renaming or deleting any section or activity.
echo Successful stages continue without their redundant final review pause.
echo AUTO is the separate seven-stage workflow. Add --unattended only when you
echo deliberately want non-interactive curriculum choices. Legacy replacement is
echo available only with --duplicate-and-replace and is not part of COMPLETE.
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
