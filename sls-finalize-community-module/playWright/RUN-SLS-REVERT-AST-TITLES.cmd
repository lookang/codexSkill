@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\@playwright\test" (
  call 00-install-and-check.cmd
  if errorlevel 1 (
    set "result=1"
    goto finish
  )
)
call npm.cmd run sls:revert-ast-titles -- %*
set "result=%errorlevel%"
:finish
echo.
echo The window stays open so you can read and copy the output.
if /I "%SLS_NO_PAUSE%"=="1" goto end
echo Press any key when you are ready to close it...
pause >nul
:end
exit /b %result%
