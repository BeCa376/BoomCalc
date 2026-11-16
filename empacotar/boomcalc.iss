; Instalador e desinstalador do BoomCalc para Windows (Inno Setup 6, gratuito: jrsoftware.org/isinfo.php).
; Compile com:  ISCC.exe empacotar\boomcalc.iss   (depois de gerar a pasta dist\BoomCalc com o PyInstaller).
; O desinstalador é criado automaticamente e aparece em "Configurações > Aplicativos".

#define AppNome "BoomCalc"
#define AppVersao "1.0"

[Setup]
AppId={{6211CD15-9CE9-4AEA-AF3C-88BDA0110A3A}
AppName={#AppNome}
AppVersion={#AppVersao}
AppPublisher=BoomCalc
; instala só para o usuário atual: NÃO pede senha de administrador
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\{#AppNome}
DefaultGroupName={#AppNome}
DisableProgramGroupPage=yes
OutputDir=saida
OutputBaseFilename=BoomCalc-Setup
SetupIconFile=boomcalc.ico
UninstallDisplayIcon={app}\BoomCalc.exe
UninstallDisplayName={#AppNome} - simulador de içamento
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar um atalho na área de trabalho"; Flags: unchecked

[Files]
Source: "..\dist\BoomCalc\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion createallsubdirs
Source: "LEIA-ME-professor.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppNome}"; Filename: "{app}\BoomCalc.exe"; Comment: "Abrir o simulador"
Name: "{group}\Como usar o {#AppNome}"; Filename: "{app}\LEIA-ME-professor.txt"
Name: "{group}\Desinstalar o {#AppNome}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppNome}"; Filename: "{app}\BoomCalc.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\BoomCalc.exe"; Description: "Abrir o BoomCalc agora"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; se o programa estiver aberto, fecha antes de apagar os arquivos
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM BoomCalc.exe"; Flags: runhidden; RunOnceId: "EncerrarBoomCalc"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
// Ao desinstalar, pergunta se também apaga as simulações e relatórios guardados neste computador.
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Dados: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    Dados := ExpandConstant('{localappdata}\BoomCalc');
    if DirExists(Dados) then
    begin
      if MsgBox('Deseja também apagar as simulações e os relatórios salvos neste computador?' + #13#10#13#10 +
                Dados + #13#10#13#10 + 'Escolha "Não" se pretende instalar o BoomCalc de novo e continuar de onde parou.',
                mbConfirmation, MB_YESNO or MB_DEFBUTTON1) = IDYES then
        DelTree(Dados, True, True, True);
    end;
  end;
end;
