@echo off
REM Double-click to open Jarvis in a new PowerShell window (not the editor terminal)
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-jarvis-window.ps1" dev
pause
