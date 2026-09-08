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
echo SLS FA Math ChatGPT Interactives
echo ---------------------------------
echo This launcher reviews every section, activity and page before changing SLS.
echo It builds the same iwant2study Prompt Library specification used by ACP,
echo then uses ChatGPT in the same browser and prefers GPT-5.6 Sol High.
echo If that exact model is unavailable, a warning is printed and the currently
echo selected ChatGPT model is used instead.
echo The real downloaded ZIP must contain a non-empty index.html at its root.
echo Only then is it uploaded to the exact SLS question page and reopen-verified.
echo Existing native ACP ZIPs are preserved for side-by-side comparison.
echo A deterministic ChatGPT ZIP already on the page is skipped on later runs.
echo The first run may pause once for ChatGPT sign-in in its dedicated profile.
echo By default this continues through every eligible question. Use
echo --max-interactives N for a deliberately capped trial, or --dry-run to review.
echo.

call npm.cmd run sls:gpt-interactive -- %*
set "result=%errorlevel%"

:finish
echo.
if "%result%"=="0" (
  echo SLS ChatGPT interactive review or verified apply run finished successfully.
) else (
  echo SLS ChatGPT interactive automation stopped at a guard. Review the newest report and trace under output.
)
echo.
echo The window will remain open so you can read or copy the output.
echo Press any key when you are ready to close it...
pause >nul
exit /b %result%
