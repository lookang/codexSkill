@echo off
setlocal
cd /d "%~dp0"

echo This pass applies section outcomes, creates or reuses copies, and verifies every question.
echo It will NOT delete original activities.
echo.
set "default_url=https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/428156f1-90f1-4b64-865f-66b354b5501f"
echo Paste the exact module URL inspected in step 2.
echo Press Enter for the configured P3 multiplication module.
set "sls_url="
set /p "sls_url=Module URL: "
if not defined sls_url set "sls_url=%default_url%"
echo.
choice /C YN /M "Run the non-deleting apply pass"
if errorlevel 2 exit /b 0

call npm.cmd run sls:apply -- --config configs/p3-multiplication-algorithms.json --url "%sls_url%" --keep-originals
set result=%errorlevel%
echo.
if "%result%"=="0" (
  echo Non-deleting apply pass completed. Review report.json and trace.zip before replacement.
) else (
  echo Apply stopped at a guard. Review the newest output folder before resuming.
)
pause
exit /b %result%
