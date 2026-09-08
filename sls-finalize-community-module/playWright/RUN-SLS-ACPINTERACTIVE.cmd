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
echo SLS FA Math ACP Interactives
echo ----------------------------
echo This launcher reviews every section, activity and page before changing SLS.
echo A nested section or activity URL selects the module but does not limit traversal.
echo Each FA Math question receives one matching ACP Interactive generated from
echo the iwant2study Prompt Library. Existing interactive ZIPs are left unchanged.
echo Multiple-part questions keep their shared context, nested parts and answer
echo keys together in one ACP interactive. Randomized ranges are read per part.
echo A normal run applies automatically after a clear review. Use --dry-run to
echo review only. Pages containing several questions stop until page breaks exist.
echo By default, generation continues to the final page of the final activity.
echo ACP generation can take several minutes for every question. Use
echo --max-interactives N only when you deliberately want a capped batch.
echo.

call npm.cmd run sls:acp-interactive -- %*
set "result=%errorlevel%"

:finish
echo.
if "%result%"=="0" (
  echo SLS ACP interactive review or verified apply run finished successfully.
) else (
  echo SLS ACP interactive automation stopped at a guard. Review the newest report and trace under output.
)
echo.
echo The window will remain open so you can read or copy the output.
echo Press any key when you are ready to close it...
pause >nul
exit /b %result%
