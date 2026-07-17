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
$payloadZip = Join-Path $scriptDir 'combined_bundle.zip'
$installRoot = Join-Path ${env:ProgramFiles} 'CA SaaS Suite'
$invoiceDir = Join-Path $installRoot 'CA Invoice Utility'

if (-not (Test-Path -LiteralPath $payloadZip)) {
    throw "Installer payload not found: $payloadZip"
}

New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
if (Test-Path -LiteralPath $invoiceDir) {
    Remove-Item -LiteralPath $invoiceDir -Recurse -Force
}
Expand-Archive -LiteralPath $payloadZip -DestinationPath $invoiceDir -Force

$desktop = [Environment]::GetFolderPath('Desktop')
$startMenuPrograms = Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs\\CA SaaS Suite'
New-Item -ItemType Directory -Force -Path $startMenuPrograms | Out-Null

$invoiceExe = Join-Path $invoiceDir 'CA Invoice Utility.exe'
$waExe = Join-Path $invoiceDir 'WA Automation\\WhatsAppAutomationPro Patched.exe'

New-Shortcut -ShortcutPath (Join-Path $desktop 'CA Invoice Utility.lnk') -TargetPath $invoiceExe -WorkingDirectory $invoiceDir -Description 'CA Invoice Utility'
New-Shortcut -ShortcutPath (Join-Path $desktop 'WhatsApp Automation Pro.lnk') -TargetPath $waExe -WorkingDirectory (Join-Path $invoiceDir 'WA Automation') -Description 'WhatsApp Automation Pro'
New-Shortcut -ShortcutPath (Join-Path $startMenuPrograms 'CA Invoice Utility.lnk') -TargetPath $invoiceExe -WorkingDirectory $invoiceDir -Description 'CA Invoice Utility'
New-Shortcut -ShortcutPath (Join-Path $startMenuPrograms 'WhatsApp Automation Pro.lnk') -TargetPath $waExe -WorkingDirectory (Join-Path $invoiceDir 'WA Automation') -Description 'WhatsApp Automation Pro'

[System.Windows.Forms.MessageBox]::Show(
    "Installation completed.`n`nInstalled to:`n$invoiceDir`n`nDesktop shortcuts created:`n- CA Invoice Utility`n- WhatsApp Automation Pro",
    'CA SaaS Suite Installed',
    'OK',
    'Information'
) | Out-Null
