#define MyAppName "WhatsApp Automation Pro"
#define MyAppVersion "1.0.0"
#define BundleDir "..\\dist\\WhatsApp Automation SaaS"
#define WaExe "WhatsAppAutomationPro Patched.exe"

[Setup]
AppId={{05F6AF8C-84BE-4EAE-9D15-5884C3E20A4F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={autopf}\\WhatsApp Automation Pro
DefaultGroupName=CA SaaS Suite
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
OutputDir=..\\dist
OutputBaseFilename=WhatsApp Automation Pro Installer
UninstallDisplayIcon={app}\\{#WaExe}

[Files]
Source: "{#BundleDir}\\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autodesktop}\\WhatsApp Automation Pro"; Filename: "{app}\\{#WaExe}"; WorkingDir: "{app}"
Name: "{group}\\WhatsApp Automation Pro"; Filename: "{app}\\{#WaExe}"; WorkingDir: "{app}"

[Run]
Filename: "{app}\\{#WaExe}"; Description: "Launch WhatsApp Automation Pro"; Flags: nowait postinstall skipifsilent
