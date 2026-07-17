$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

function New-Shortcut {
    param(
        [Parameter(Mandatory = $true)][string]$ShortcutPath,
        [Parameter(Mandatory = $true)][string]$TargetPath,
        [string]$WorkingDirectory = '',
        [string]$Description = ''
    )

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = $TargetPath
    if ($WorkingDirectory) { $shortcut.WorkingDirectory = $WorkingDirectory }
    if ($Description) { $shortcut.Description = $Description }
    $shortcut.Save()
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$payloadZip = Join-Path $scriptDir 'whatsapp_bundle.zip'
$installRoot = Join-Path ${env:ProgramFiles} 'WhatsApp Automation Pro'

if (-not (Test-Path -LiteralPath $payloadZip)) {
    throw "Installer payload not found: $payloadZip"
}

if (Test-Path -LiteralPath $installRoot) {
    Remove-Item -LiteralPath $installRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
Expand-Archive -LiteralPath $payloadZip -DestinationPath $installRoot -Force

$desktop = [Environment]::GetFolderPath('Desktop')
$startMenuPrograms = Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs\\CA SaaS Suite'
New-Item -ItemType Directory -Force -Path $startMenuPrograms | Out-Null

$waExe = Join-Path $installRoot 'WhatsAppAutomationPro Patched.exe'

New-Shortcut -ShortcutPath (Join-Path $desktop 'WhatsApp Automation Pro.lnk') -TargetPath $waExe -WorkingDirectory $installRoot -Description 'WhatsApp Automation Pro'
New-Shortcut -ShortcutPath (Join-Path $startMenuPrograms 'WhatsApp Automation Pro.lnk') -TargetPath $waExe -WorkingDirectory $installRoot -Description 'WhatsApp Automation Pro'

[System.Windows.Forms.MessageBox]::Show(
    "Installation completed.`n`nInstalled to:`n$installRoot`n`nDesktop shortcut created:`n- WhatsApp Automation Pro",
    'WhatsApp Automation Pro Installed',
    'OK',
    'Information'
) | Out-Null
