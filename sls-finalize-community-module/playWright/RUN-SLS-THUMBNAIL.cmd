@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\@playwright\test" (
  echo First-time setup is required. Running installation and checks...
  call 00-install-and-check.cmd
  if errorlevel 1 exit /b 1
)

echo.
echo Generates the module's cover picture with Authoring Copilot.
echo The picture is an image component inside the module, so nothing else is changed:
echo no activity is copied, renamed or deleted, and no tags are touched.
echo.
echo Optional: describe the picture yourself by passing --prompt "your description".
echo Without it, a prompt is built from the module title.
echo.

call npm.cmd run sls:thumbnail -- %*
set result=%errorlevel%
echo.
if "%result%"=="0" (
  echo Thumbnail generation finished. Review the screenshot and report under output.
) else (
  echo Thumbnail generation stopped at a guard. Nothing was saved; read the message above,
  echo which lists the controls SLS actually offered.
)
pause
exit /b %result%
