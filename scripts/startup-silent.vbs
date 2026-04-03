' Jarvis AI Assistant - Silent Startup Script
' This VBScript runs Jarvis without showing a command window flash
' Perfect for Task Scheduler startup

Dim WshShell, jarvisDir, command

Set WshShell = CreateObject("WScript.Shell")

' Get the directory where this script is located
jarvisDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
jarvisDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(jarvisDir)

' Build the command to run Jarvis
' Using cmd /c to change directory and run node
command = "cmd /c cd /d """ & jarvisDir & """ && node assistant.js"

' Run the command with visible window (1 = normal window)
' Change to 0 for completely hidden, 1 for normal, 7 for minimized
WshShell.Run command, 1, False

Set WshShell = Nothing
