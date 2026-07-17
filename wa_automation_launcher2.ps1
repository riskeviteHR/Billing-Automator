param(
    [Parameter(Mandatory = $true)]
    [string]$ExcelPath
)

$ErrorActionPreference = 'Stop'

$waDir = Join-Path $PSScriptRoot 'WA Automation'
$exePath = Join-Path $waDir 'WhatsAppAutomationPro.exe'
$patchedExePath = Join-Path $waDir 'WhatsAppAutomationPro Patched.exe'
$patchedScriptPath = Join-Path $waDir 'whatsapp_saas_patched.py'

if (-not (Test-Path -LiteralPath $ExcelPath)) {
    throw "Excel file not found: $ExcelPath"
}

if (-not (Test-Path -LiteralPath $exePath) -and -not (Test-Path -LiteralPath $patchedExePath) -and -not (Test-Path -LiteralPath $patchedScriptPath)) {
    throw "WhatsApp automation executable not found in: $waDir"
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class NativeAutomation {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@

$MOUSEEVENTF_LEFTDOWN = 0x0002
$MOUSEEVENTF_LEFTUP = 0x0004
$mainWindowTitle = 'WhatsApp Automation Pro'
$loginWindowTitle = 'Login - WhatsApp Automation Pro'
$wsh = New-Object -ComObject WScript.Shell

function Invoke-UiClick {
    param(
        [int]$X,
        [int]$Y
    )

    [NativeAutomation]::SetCursorPos($X, $Y) | Out-Null
    Start-Sleep -Milliseconds 150
    [NativeAutomation]::mouse_event($MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 60
    [NativeAutomation]::mouse_event($MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
}

function Wait-ForWindow {
    param(
        [string]$Title,
        [int]$TimeoutSeconds = 20
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $match = Get-Process | Where-Object {
            $_.MainWindowTitle -eq $Title
        } | Select-Object -First 1
        if ($match) {
            return $match
        }
        Start-Sleep -Milliseconds 500
    }
    return $null
}

# Reuse existing window if already running; launch only if not.
$existingMain = Get-Process | Where-Object { $_.MainWindowTitle -eq $mainWindowTitle } | Select-Object -First 1

if (-not $existingMain) {
    if (Test-Path -LiteralPath $patchedExePath) {
        Start-Process -FilePath $patchedExePath -WorkingDirectory $waDir | Out-Null
    } elseif (Test-Path -LiteralPath $exePath) {
        Start-Process -FilePath $exePath -WorkingDirectory $waDir | Out-Null
    } elseif (Test-Path -LiteralPath $patchedScriptPath) {
        # Python script fallback is for local development only.
        $pythonCommand = Get-Command pythonw.exe -ErrorAction SilentlyContinue
        $pythonPath = if ($pythonCommand) { $pythonCommand.Source } else { $null }
        if (-not $pythonPath) {
            $pythonPath = (Get-Command python.exe -ErrorAction Stop).Source
        }
        Start-Process -FilePath $pythonPath -ArgumentList "`"$patchedScriptPath`"" -WorkingDirectory $waDir | Out-Null
    }

    $loginWindow = Wait-ForWindow -Title $loginWindowTitle -TimeoutSeconds 8
    if ($loginWindow) {
        throw 'WhatsAppAutomationPro opened the login screen. Please activate that tool first before using Send Now.'
    }
}

$mainWindow = if ($existingMain) { $existingMain } else { Wait-ForWindow -Title $mainWindowTitle -TimeoutSeconds 20 }
if (-not $mainWindow) {
    throw 'WhatsAppAutomationPro did not open its main window in time.'
}

[NativeAutomation]::SetForegroundWindow($mainWindow.MainWindowHandle) | Out-Null
[void]$wsh.AppActivate($mainWindowTitle)
Start-Sleep -Milliseconds 900

$rect = New-Object NativeAutomation+RECT
if (-not [NativeAutomation]::GetWindowRect($mainWindow.MainWindowHandle, [ref]$rect)) {
    throw 'Unable to read WhatsAppAutomationPro window bounds.'
}

$windowWidth = $rect.Right - $rect.Left
$windowHeight = $rect.Bottom - $rect.Top
$browseX = [int]($rect.Left + ($windowWidth * 0.848))
$browseY = [int]($rect.Top + ($windowHeight * 0.304))
$startX = [int]($rect.Left + ($windowWidth * 0.284))
$startY = [int]($rect.Top + ($windowHeight * 0.792))

Invoke-UiClick -X $browseX -Y $browseY
Start-Sleep -Milliseconds 1500

Set-Clipboard -Value $ExcelPath
$wsh.SendKeys('^l')
Start-Sleep -Milliseconds 250
$wsh.SendKeys('^v')
Start-Sleep -Milliseconds 250
$wsh.SendKeys('{ENTER}')
Start-Sleep -Seconds 2

[NativeAutomation]::SetForegroundWindow($mainWindow.MainWindowHandle) | Out-Null
[void]$wsh.AppActivate($mainWindowTitle)
Start-Sleep -Milliseconds 500
Invoke-UiClick -X $startX -Y $startY

Write-Output "Started WhatsApp automation with file: $ExcelPath"
