# Jarvis AI Assistant - Windows Startup Setup Script
# Run this script as Administrator to configure auto-start

param(
    [switch]$Remove,
    [switch]$UseTaskScheduler,
    [switch]$UseStartupFolder,
    [string]$JarvisPath = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

# Get the Jarvis root directory
$JarvisRoot = Split-Path -Parent $JarvisPath
if (-not (Test-Path "$JarvisRoot\assistant.js")) {
    $JarvisRoot = $JarvisPath
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Jarvis AI Assistant - Startup Setup  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Jarvis Directory: $JarvisRoot" -ForegroundColor Gray

$TaskName = "JarvisAIAssistant"
$StartupFolderPath = [Environment]::GetFolderPath("Startup")
$ShortcutPath = "$StartupFolderPath\Jarvis.lnk"

# Function to remove startup configuration
function Remove-JarvisStartup {
    Write-Host ""
    Write-Host "Removing Jarvis from startup..." -ForegroundColor Yellow
    
    # Remove Task Scheduler task
    $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "  [OK] Removed Task Scheduler task" -ForegroundColor Green
    } else {
        Write-Host "  [--] No Task Scheduler task found" -ForegroundColor Gray
    }
    
    # Remove Startup folder shortcut
    if (Test-Path $ShortcutPath) {
        Remove-Item $ShortcutPath -Force
        Write-Host "  [OK] Removed Startup folder shortcut" -ForegroundColor Green
    } else {
        Write-Host "  [--] No Startup folder shortcut found" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "Jarvis has been removed from startup." -ForegroundColor Green
}

# Function to add via Task Scheduler (recommended)
function Add-JarvisTaskScheduler {
    Write-Host ""
    Write-Host "Setting up Jarvis via Task Scheduler..." -ForegroundColor Cyan
    
    # Check for admin rights
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host "  [!!] Warning: Running without admin rights. Task may not work for all users." -ForegroundColor Yellow
    }
    
    # Remove existing task if any
    $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "  [OK] Removed existing task" -ForegroundColor Green
    }
    
    # Create the action (what to run)
    $batPath = "$JarvisRoot\scripts\startup.bat"
    $action = New-ScheduledTaskAction -Execute $batPath -WorkingDirectory $JarvisRoot
    
    # Create the trigger (when to run - at logon)
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    
    # Create settings
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1)
    
    # Create the task
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
    
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description "Starts Jarvis AI Personal Assistant at user logon" `
        | Out-Null
    
    Write-Host "  [OK] Created Task Scheduler task" -ForegroundColor Green
    Write-Host ""
    Write-Host "Task Scheduler setup complete!" -ForegroundColor Green
    Write-Host "Jarvis will start automatically when you log in." -ForegroundColor Gray
}

# Function to add via Startup folder
function Add-JarvisStartupFolder {
    Write-Host ""
    Write-Host "Setting up Jarvis via Startup Folder..." -ForegroundColor Cyan
    
    # Create shortcut
    $WScriptShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WScriptShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = "$JarvisRoot\scripts\startup.bat"
    $Shortcut.WorkingDirectory = $JarvisRoot
    $Shortcut.Description = "Jarvis AI Personal Assistant"
    $Shortcut.WindowStyle = 1  # Normal window
    $Shortcut.Save()
    
    Write-Host "  [OK] Created shortcut in Startup folder" -ForegroundColor Green
    Write-Host "  Location: $ShortcutPath" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Startup folder setup complete!" -ForegroundColor Green
    Write-Host "Jarvis will start automatically when you log in." -ForegroundColor Gray
}

# Function to show menu
function Show-Menu {
    Write-Host ""
    Write-Host "Choose startup method:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  1. Task Scheduler (Recommended)" -ForegroundColor White
    Write-Host "     - More reliable, better error handling"
    Write-Host "     - Runs even if you're logged in via Remote Desktop"
    Write-Host ""
    Write-Host "  2. Startup Folder" -ForegroundColor White
    Write-Host "     - Simpler setup, no admin required"
    Write-Host "     - Easy to enable/disable"
    Write-Host ""
    Write-Host "  3. Remove from Startup" -ForegroundColor White
    Write-Host "     - Remove all startup configurations"
    Write-Host ""
    Write-Host "  4. Exit" -ForegroundColor White
    Write-Host ""
    
    $choice = Read-Host "Enter choice (1-4)"
    
    switch ($choice) {
        "1" { Add-JarvisTaskScheduler }
        "2" { Add-JarvisStartupFolder }
        "3" { Remove-JarvisStartup }
        "4" { Write-Host "Exiting..." -ForegroundColor Gray; exit }
        default { Write-Host "Invalid choice" -ForegroundColor Red }
    }
}

# Main execution
if ($Remove) {
    Remove-JarvisStartup
} elseif ($UseTaskScheduler) {
    Add-JarvisTaskScheduler
} elseif ($UseStartupFolder) {
    Add-JarvisStartupFolder
} else {
    Show-Menu
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Show verification
Write-Host "Verification:" -ForegroundColor Cyan
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "  [OK] Task Scheduler: Configured" -ForegroundColor Green
} else {
    Write-Host "  [--] Task Scheduler: Not configured" -ForegroundColor Gray
}

if (Test-Path $ShortcutPath) {
    Write-Host "  [OK] Startup Folder: Configured" -ForegroundColor Green
} else {
    Write-Host "  [--] Startup Folder: Not configured" -ForegroundColor Gray
}

Write-Host ""
