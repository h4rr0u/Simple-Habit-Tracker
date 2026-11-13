' Habit Tracker - hidden launcher for autostart.
' Runs start.bat without opening a console window.
' Used by the "Launch at computer startup" option in Settings (see /api/autostart).

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Resolve the folder of this VBS file, so the launcher works no matter
' where the project lives.
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' 0 = hidden window, do not wait for the process to finish.
WshShell.Run Chr(34) & scriptDir & "\start.bat" & Chr(34), 0

Set WshShell = Nothing
Set fso = Nothing
