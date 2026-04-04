<#
.SYNOPSIS
  Opens Jarvis in a new PowerShell window instead of the editor terminal.

.USAGE
  npm run dev:window    → runs npm run dev in a new window
  npm run start:window  → runs npm start in a new window
  Double-click: scripts\run-jarvis-window.cmd
#>
param(
    [ValidateSet('dev', 'start')]
    [string] $Mode = 'dev'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$npmScript = if ($Mode -eq 'start') { 'start' } else { 'dev' }
$title = if ($Mode -eq 'start') { 'Jarvis — npm start' } else { 'Jarvis — npm run dev' }

# Child session: temp script avoids fragile -Command quoting
$runnerPath = Join-Path ([System.IO.Path]::GetTempPath()) "jarvis-run-$([Guid]::NewGuid().ToString('n')).ps1"
$rootEsc = $ProjectRoot -replace "'", "''"
$runnerContent = @"
`$Host.UI.RawUI.WindowTitle = '$title'
Write-Host ''
Write-Host '  Jarvis Assistant' -ForegroundColor Cyan
Write-Host '  $ProjectRoot' -ForegroundColor DarkGray
Write-Host ''
Set-Location -LiteralPath '$rootEsc'
npm run $npmScript
"@
Set-Content -LiteralPath $runnerPath -Value $runnerContent -Encoding UTF8

$psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path -LiteralPath $psExe)) {
    $psExe = 'powershell.exe'
}

$psArgs = @(
    '-NoExit',
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $runnerPath
)

$wtPath = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\wt.exe'

try {
    $launched = $false
    if (Test-Path -LiteralPath $wtPath) {
        try {
            $allArgs = @('new-tab', '-d', $ProjectRoot, $psExe) + $psArgs
            Start-Process -FilePath $wtPath -ArgumentList $allArgs -ErrorAction Stop
            $launched = $true
        }
        catch {
            Write-Host '(Windows Terminal launch failed, using standalone PowerShell.)' -ForegroundColor DarkYellow
        }
    }
    if (-not $launched) {
        Start-Process -FilePath $psExe -WorkingDirectory $ProjectRoot -ArgumentList $psArgs
    }

    Write-Host 'Launched Jarvis in a new PowerShell window.' -ForegroundColor Green
    Write-Host 'You can close this editor terminal if you want.' -ForegroundColor DarkGray
}
catch {
    Remove-Item -LiteralPath $runnerPath -Force -ErrorAction SilentlyContinue
    Write-Host "Could not open a new window: $_" -ForegroundColor Red
    exit 1
}
