Set sh = CreateObject("Wscript.Shell")
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(root)
sh.CurrentDirectory = root
sh.Run """" & root & "\scripts\gym-pc-run.cmd""", 0, False
