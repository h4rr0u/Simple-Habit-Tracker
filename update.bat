@echo off
rem Habit Tracker — safe updater.
rem Double-click this file to update the tracker. It backs up the database
rem first, then pulls the latest version (or explains how to update a ZIP copy).
chcp 65001 >nul
title Habit Tracker Updater
cd /d "%~dp0"

rem --- Node.js ---------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ОШИБКА] Не найден Node.js.
  echo Установите LTS-версию с https://nodejs.org/en и запустите update.bat снова.
  echo.
  pause
  exit /b 1
)

rem --- Update ----------------------------------------------------------------
node scripts\update.mjs
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo [ИНФО] Обновление не завершено. Прочитайте сообщение выше.
  echo.
)

rem Keep the window open so the result and any error stay readable.
pause
exit /b %EXIT_CODE%
