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
echo SLS Community Gallery Automation
echo --------------------------------
echo If a module has no section curriculum, the run first opens its existing
echo saved Module Tag and crawls that map's official learning objectives.
echo Only when no saved map can be read does it crawl the live unsaved
echo Subject ^> Level ^> Content Map cascade and reload without saving.
echo Explicit multi-stream titles such as G2G3 harvest and retain both maps.
echo If the curriculum cannot be selected confidently, the run shows numbered
echo candidates. Choose 1, 2, 3, and so on to record the reviewed exact SLS
echo wording and continue in the same run. Press Enter to stop without guessing.
echo.

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
