@echo off
setlocal
cd /d "%~dp0"

set "default_url=https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/00000000-0000-0000-0000-000000000000"
echo Paste the exact SLS admin module edit URL.
echo Press Enter to inspect the configured P3 multiplication module:
echo %default_url%
echo.
set "sls_url="
set /p "sls_url=Module URL: "
if not defined sls_url set "sls_url=%default_url%"
echo.

call npm.cmd run sls:inspect -- --config configs/p3-multiplication-algorithms.json --url "%sls_url%"
set result=%errorlevel%
echo.
if "%result%"=="0" (
  echo Read-only inspection completed. Review the newest folder under output.
) else (
  echo Inspection stopped. Review the newest report.json and trace.zip under output.
)
pause
exit /b %result%
