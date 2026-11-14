@echo off
rem Habit Tracker — launch the whole stack (web + optional Telegram bot).
rem Double-click this file: it installs dependencies and creates the database
rem on the first run, then starts the web app at http://localhost:3000
chcp 65001 >nul
title Habit Tracker
cd /d "%~dp0"

rem --- 1. Node.js -----------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ОШИБКА] Не найден Node.js.
  echo Скачайте LTS-версию с https://nodejs.org/en, установите её
  echo и запустите start.bat снова.
  echo.
  pause
  exit /b 1
)

rem --- 2. Dependencies ------------------------------------------------------
if not exist "node_modules" (
  echo.
  echo Устанавливаю зависимости, это займет пару минут...
  echo.
  call npm install
  if errorlevel 1 goto failed
)

rem --- 3. Database ----------------------------------------------------------
if not exist "data\habit-tracker.db" (
  echo.
  echo Создаю базу данных...
  echo.
  call npm run db:migrate
  if errorlevel 1 goto failed
)

rem --- 4. Start the app -----------------------------------------------------
call npm run start:all
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo [ОШИБКА] Запуск не удался. Скопируйте текст ошибки выше —
echo он поможет понять, что пошло не так.
echo.
pause
exit /b 1
