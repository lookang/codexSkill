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
echo SLS Meaningful Page Breaks
echo --------------------------
echo This launcher reviews every activity in every section before changing SLS.
echo It keeps side-by-side questions together and breaks before the next visual
echo question row. Single-question pages retain the length-based chunking rule.
echo After each verified split, it continues from the new next page without
echo revisiting earlier pages. The full reopen audit is skipped by default.
echo A normal run applies automatically after a clear review. Use --dry-run to
echo review without changing SLS. Ambiguous layouts stop before any changes.
echo Add --verify only when you want the slower full-module reopen audit.
echo.

call npm.cmd run sls:page-break -- %*
set "result=%errorlevel%"

:finish
echo.
if "%result%"=="0" (
  echo SLS page-break review or apply run finished successfully.
) else (
  echo SLS page-break automation stopped at a guard. Review the newest report and trace under output.
)
echo.
echo The window will remain open so you can read or copy the output.
echo Press any key when you are ready to close it...
pause >nul
exit /b %result%
