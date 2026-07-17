# Registers a Windows Scheduled Task that runs the Auto Reminders sweep even when the
# CA Invoice Utility app is fully closed. It re-uses the app's own bundled Electron
# executable as a plain Node runtime (ELECTRON_RUN_AS_NODE=1) to run reminder-scheduler.js,
# so no separate Node.js installation is required on the user's machine.
#
# NOTE: WhatsApp sending relies on visible desktop automation, so this task is registered
# to run only while the user is logged on (an interactive session must be active for
# messages to actually send — it cannot run fully headless/locked).
#
# Usage: powershell -ExecutionPolicy Bypass -File register-reminder-task.ps1 [-InstallPath "C:\Program Files\CA Invoice Utility"] [-IntervalHours 3]

param(
  [string]$InstallPath = "C:\Program Files\CA Invoice Utility",
  [int]$IntervalHours = 3
)

$ErrorActionPreference = 'Stop'
$TaskName = "CA Invoice Utility - Auto Reminders"
$exePath = Join-Path $InstallPath "CA Invoice Utility.exe"
$scriptPath = Join-Path $InstallPath "resources\app\reminder-scheduler.js"

if (-not (Test-Path -LiteralPath $exePath)) {
  throw "Could not find the installed app at `"$exePath`". Pass -InstallPath if it's installed somewhere else."
}
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Could not find reminder-scheduler.js at `"$scriptPath`". Rebuild/reinstall the app first — this script requires a build that includes it."
}

$psCommand = "`$env:ELECTRON_RUN_AS_NODE=1; & '$exePath' '$scriptPath'"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command `"$psCommand`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours $IntervalHours) -RepetitionDuration ([TimeSpan]::MaxValue)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

Write-Output "Registered scheduled task '$TaskName' — runs every $IntervalHours hour(s) while you're logged in, even if the app is closed."
Write-Output "Exe: $exePath"
Write-Output "Script: $scriptPath"
Write-Output ""
Write-Output "To remove it later: Unregister-ScheduledTask -TaskName `"$TaskName`" -Confirm:`$false"
Write-Output "To run it once immediately for testing: Start-ScheduledTask -TaskName `"$TaskName`""
