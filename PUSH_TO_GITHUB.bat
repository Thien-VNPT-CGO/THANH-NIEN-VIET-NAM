@echo off
chcp 65001 >nul
echo ========================================================
echo   ĐANG ĐẨY MÃ NGUỒN LÊN GITHUB ĐỂ BẬT WEB ONLINE...
echo ========================================================
echo.
cd /d "%~dp0"
git push -u origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo   ✔ ĐÃ ĐẨY LÊN GITHUB THÀNH CÔNG!
    echo   GitHub đang tự động kích hoạt trang web...
    echo   Đường link online của bạn:
    echo   👉 https://thien-vnpt-cgo.github.io/THANH-NI-N-VI-T-NAM---T-N-H-A/
    echo ========================================================
) else (
    echo ✖ Có lỗi xảy ra, vui lòng kiểm tra lại đăng nhập GitHub.
)
echo.
pause
