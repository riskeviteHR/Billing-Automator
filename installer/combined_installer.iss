#define MyAppName      "CA Invoice Utility"
#define MyAppVersion   "1.0.0"
#define MyAppPublisher "CA Utility"
#define MyAppExe       "CA Invoice Utility.exe"
#define BundleDir      "..\dist\CA Invoice Utility-win32-x64"

[Setup]
AppId={{6A05F112-0E52-4A9D-955B-6C1A97D1CC8F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppVerName={#MyAppName} {#MyAppVersion}

; Install to Program Files — looks professional, standard for desktop tools
DefaultDirName={autopf}\CA Invoice Utility
DefaultGroupName=CA Invoice Utility
DisableProgramGroupPage=yes

; Require admin so it can write to Program Files
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible

; Compression
Compression=lzma2/max
SolidCompression=yes

; UI
WizardStyle=modern
WizardSizePercent=120

; Output
OutputDir=..\dist
OutputBaseFilename=CA Invoice Utility Setup
UninstallDisplayIcon={app}\{#MyAppExe}
UninstallDisplayName={#MyAppName}

; Show licence info during install (optional — comment out if not needed)
; LicenseFile=..\LICENSE.txt

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Copy the entire Electron build folder into the install directory
Source: "{#BundleDir}\*"; DestDir: "{app}"; \
    Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
; Desktop shortcut
Name: "{autodesktop}\CA Invoice Utility"; \
    Filename: "{app}\{#MyAppExe}"; \
    WorkingDir: "{app}"; \
    Comment: "Open CA Invoice Utility"

; Start Menu shortcuts
Name: "{group}\CA Invoice Utility"; \
    Filename: "{app}\{#MyAppExe}"; \
    WorkingDir: "{app}"
Name: "{group}\Uninstall CA Invoice Utility"; \
    Filename: "{uninstallexe}"

[Run]
; Offer to launch immediately after install
Filename: "{app}\{#MyAppExe}"; \
    Description: "Launch CA Invoice Utility now"; \
    Flags: nowait postinstall skipifsilent
