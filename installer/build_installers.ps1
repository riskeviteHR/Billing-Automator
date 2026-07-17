$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$dist = Join-Path $root 'dist'
$installerRoot = Join-Path $root 'installer'
$combinedSource = Join-Path $dist 'Combined SaaS Bundle'
$waSource = Join-Path $dist 'WhatsApp Automation SaaS'
$combinedIss = Join-Path $installerRoot 'combined_installer.iss'
$waIss = Join-Path $installerRoot 'whatsapp_installer.iss'
$combinedInstaller = Join-Path $dist 'CA SaaS Suite Installer.exe'
$waInstaller = Join-Path $dist 'WhatsApp Automation Pro Installer.exe'

function Resolve-IsccPath {
    $candidates = @(
        (Get-Command ISCC.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
        'C:\Program Files\Inno Setup 6\ISCC.exe',
        'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
        (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
    ) | Where-Object { $_ } | Select-Object -Unique

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    throw 'Inno Setup compiler (ISCC.exe) was not found. Install Inno Setup 6 and retry.'
}

if (-not (Test-Path -LiteralPath $combinedSource)) { throw "Missing combined distribution folder: $combinedSource" }
if (-not (Test-Path -LiteralPath $waSource)) { throw "Missing WhatsApp distribution folder: $waSource" }
if (-not (Test-Path -LiteralPath $combinedIss)) { throw "Missing Inno script: $combinedIss" }
if (-not (Test-Path -LiteralPath $waIss)) { throw "Missing Inno script: $waIss" }

$iscc = Resolve-IsccPath

Write-Output "Using ISCC: $iscc"
Write-Output "Compiling: $combinedIss"
& $iscc '/Qp' $combinedIss
if ($LASTEXITCODE -ne 0) {
    throw "ISCC failed for $combinedIss (exit code: $LASTEXITCODE)"
}

Write-Output "Compiling: $waIss"
& $iscc '/Qp' $waIss
if ($LASTEXITCODE -ne 0) {
    throw "ISCC failed for $waIss (exit code: $LASTEXITCODE)"
}

if (-not (Test-Path -LiteralPath $combinedInstaller)) {
    throw "Expected installer not found: $combinedInstaller"
}
if (-not (Test-Path -LiteralPath $waInstaller)) {
    throw "Expected installer not found: $waInstaller"
}

Write-Output 'Built installers:'
Write-Output $combinedInstaller
Write-Output $waInstaller
