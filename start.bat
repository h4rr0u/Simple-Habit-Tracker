@echo off
rem Habit Tracker — launch the whole stack (web + optional Telegram bot).
chcp 65001 >nul
title Habit Tracker
cd /d "%~dp0"
node scripts\start.mjs
pause
