@echo off
REM Jarvis AI Assistant - Windows Startup Script
REM This script is designed to run at Windows startup

REM Set the path to the Jarvis installation directory
SET JARVIS_DIR=%~dp0..
SET NODE_PATH=node

REM Change to Jarvis directory
cd /d "%JARVIS_DIR%"

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist "%JARVIS_DIR%\node_modules" (
    echo Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo Error: Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Check if .env file exists
if not exist "%JARVIS_DIR%\.env" (
    echo Warning: .env file not found!
    echo Please copy .env.example to .env and configure it.
    echo Opening .env.example for reference...
    notepad "%JARVIS_DIR%\.env.example"
    pause
    exit /b 1
)

REM Start Jarvis
echo Starting Jarvis AI Assistant...
echo.

REM Run Jarvis with visible console window
%NODE_PATH% "%JARVIS_DIR%\assistant.js"

REM Keep window open if there's an error
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Jarvis exited with error code %ERRORLEVEL%
    pause
)
