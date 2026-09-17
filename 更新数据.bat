@echo off
chcp 65001 >nul
cd /d %~dp0
echo === 1/3 采集三站（我爱云 / MSDN / HelloWindows 激活工具） ===
node crawler/crawler.js --site=active
if errorlevel 1 goto :err
echo === 2/3 导出静态数据快照 ===
node scripts/export-data.js
if errorlevel 1 goto :err
echo === 3/3 提交并推送 GitHub（自动触发 Pages 部署） ===
git add -A
git commit -m "更新数据快照 %date% %time%"
git push
if errorlevel 1 goto :err
echo.
echo ✅ 全部完成！约 1 分钟后线上更新：https://sdlw7757.github.io/HaiYunISO/
pause
exit /b 0
:err
echo.
echo ❌ 步骤失败，请检查上方报错信息
pause
exit /b 1
