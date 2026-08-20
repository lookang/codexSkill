@echo off
setlocal
cd /d "%~dp0"

echo This pass resumes from checkpoints.
echo It can DELETE an exact original only after its retained copy and every question pass verification.
echo It then removes the - Copy suffix.
echo.
set "default_url=https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/00000000-0000-0000-0000-000000000000"
echo Paste the exact module URL inspected and applied in the earlier steps.
echo Press Enter for the configured P3 multiplication module.
set "sls_url="
set /p "sls_url=Module URL: "
if not defined sls_url set "sls_url=%default_url%"
echo.
choice /C YN /M "Run the guarded delete-and-rename pass"
if errorlevel 2 exit /b 0

call npm.cmd run sls:resume -- --config configs/p3-multiplication-algorithms.json --url "%sls_url%" --delete-originals --rename-copies
set result=%errorlevel%
echo.
if "%result%"=="0" (
  echo Guarded replacement completed. Review the final report and trace.
) else (
  echo Resume stopped at a guard. Do not rerun blindly; inspect the newest output folder.
)
pause
exit /b %result%
