Dim http, shell, running, i
Dim url, porta, pasta

porta = "5178"
url = "http://localhost:" & porta
pasta = "D:\OneDrive\Claude Code\bess-dimensionador"

' Verifica se o servidor já está rodando
Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
On Error Resume Next
http.Open "GET", url, False
http.SetTimeouts 500, 500, 500, 500
http.Send
running = (Err.Number = 0)
On Error GoTo 0

' Se não estiver, inicia o servidor (Vite dev) sem janela visível
If Not running Then
    Set shell = CreateObject("WScript.Shell")
    shell.Run "cmd /c cd /d """ & pasta & """ && npm run dev -- --port " & porta, 0, False
    ' Aguarda o servidor subir (até 30 segundos)
    For i = 1 To 60
        WScript.Sleep 500
        On Error Resume Next
        http.Open "GET", url, False
        http.SetTimeouts 300, 300, 300, 300
        http.Send
        If Err.Number = 0 Then
            running = True
            Exit For
        End If
        On Error GoTo 0
    Next
End If

' Abre o navegador
Set shell = CreateObject("WScript.Shell")
shell.Run url
