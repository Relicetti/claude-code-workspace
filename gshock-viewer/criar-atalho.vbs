' Cria um atalho "G-Shock Viewer" na Area de Trabalho, com o icone,
' apontando pro rodar-no-windows.bat. Clique duas vezes neste arquivo UMA vez.
Dim shell, fso, pasta, desktop, lnk
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

pasta = fso.GetParentFolderName(WScript.ScriptFullName)
desktop = shell.SpecialFolders("Desktop")

Set lnk = shell.CreateShortcut(desktop & "\G-Shock Viewer.lnk")
lnk.TargetPath = pasta & "\rodar-no-windows.bat"
lnk.WorkingDirectory = pasta
lnk.IconLocation = pasta & "\icon.ico"
lnk.Description = "Le os dados do Casio GBD-H2000"
lnk.Save

MsgBox "Pronto! Criei o atalho 'G-Shock Viewer' na sua Area de Trabalho." & vbCrLf & _
       "Clique nele pra achar o relogio e mapear os dados.", 64, "G-Shock Viewer"
