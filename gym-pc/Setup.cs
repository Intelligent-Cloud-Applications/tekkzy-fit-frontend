using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Tekkzy Fit Setup")]
[assembly: AssemblyProduct("Tekkzy Fit")]
[assembly: AssemblyDescription("Installs Tekkzy Fit on the gym Windows PC")]
[assembly: AssemblyCompany("Tekkzy")]
[assembly: AssemblyVersion("1.1.0.0")]
[assembly: AssemblyFileVersion("1.1.0.0")]

internal static class Setup
{
    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new SetupForm());
    }
}

sealed class SetupForm : Form
{
    readonly Label _status;
    readonly ProgressBar _bar;

    public SetupForm()
    {
        Text = "Tekkzy Fit Setup";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(420, 150);
        Font = new Font("Segoe UI", 9.75f);

        _status = new Label
        {
            AutoSize = false,
            Location = new Point(20, 22),
            Size = new Size(380, 56),
            Text = "Installing Tekkzy Fit on this computer...",
        };
        _bar = new ProgressBar
        {
            Location = new Point(20, 90),
            Size = new Size(380, 22),
            Style = ProgressBarStyle.Marquee,
            MarqueeAnimationSpeed = 30,
        };
        Controls.Add(_status);
        Controls.Add(_bar);
        Shown += (s, e) => BeginInvoke(new Action(Install));
    }

    void SetStatus(string text)
    {
        _status.Text = text;
        _status.Refresh();
        Application.DoEvents();
    }

    void Install()
    {
        var dest = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TekkzyFit");
        var tmp = Path.Combine(Path.GetTempPath(), "TekkzyFit-setup-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(dest);
            Directory.CreateDirectory(tmp);
            SetStatus("Unpacking Tekkzy Fit...");
            var zipPath = Path.Combine(tmp, "payload.zip");
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("TekkzyFitPayload"))
            {
                if (stream == null) throw new InvalidOperationException("The installer is missing its program files. Download it again from Settings.");
                using (var file = File.Create(zipPath))
                {
                    stream.CopyTo(file);
                }
            }
            if (new FileInfo(zipPath).Length < 1000000)
            {
                throw new InvalidOperationException("The installer download is incomplete. Download Tekkzy Fit again from Settings.");
            }
            var extract = Path.Combine(tmp, "files");
            Directory.CreateDirectory(extract);
            ZipFile.ExtractToDirectory(zipPath, extract);
            foreach (var file in Directory.GetFiles(extract, "*", SearchOption.AllDirectories))
            {
                var rel = file.Substring(extract.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                var target = Path.Combine(dest, rel);
                Directory.CreateDirectory(Path.GetDirectoryName(target));
                File.Copy(file, target, true);
            }
            var exe = Path.Combine(dest, "TekkzyFit.exe");
            var node = Path.Combine(dest, "runtime", "node.exe");
            var server = Path.Combine(dest, "server.cjs");
            if (!File.Exists(exe) || !File.Exists(node) || !File.Exists(server))
            {
                throw new InvalidOperationException("The installer did not unpack completely. Download Tekkzy Fit again from Settings.");
            }
            SetStatus("Creating shortcuts...");
            CreateShortcut(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), exe, dest);
            CreateShortcut(Environment.GetFolderPath(Environment.SpecialFolder.Startup), exe, dest);
            try
            {
                using (var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))
                {
                    if (key != null) key.SetValue("TekkzyFit", "\"" + exe + "\" --silent");
                }
            }
            catch { }
            SetStatus("Starting Tekkzy Fit...");
            Process.Start(new ProcessStartInfo
            {
                FileName = exe,
                WorkingDirectory = dest,
                UseShellExecute = true,
            });
            MessageBox.Show(
                this,
                "Tekkzy Fit is installed." + Environment.NewLine + Environment.NewLine +
                "Leave the tray icon on (near the clock). This PC must stay on the same Wi-Fi as the face machine.",
                "Tekkzy Fit",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                this,
                "Could not install Tekkzy Fit." + Environment.NewLine + Environment.NewLine + ex.Message,
                "Tekkzy Fit Setup",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
        }
        finally
        {
            try { if (Directory.Exists(tmp)) Directory.Delete(tmp, true); } catch { }
        }
    }

    static void CreateShortcut(string folder, string exe, string workDir)
    {
        try
        {
            var lnk = Path.Combine(folder, "Tekkzy Fit.lnk");
            var wshType = Type.GetTypeFromProgID("WScript.Shell");
            if (wshType == null) return;
            dynamic wsh = Activator.CreateInstance(wshType);
            dynamic shortcut = wsh.CreateShortcut(lnk);
            shortcut.TargetPath = exe;
            shortcut.WorkingDirectory = workDir;
            shortcut.WindowStyle = 7;
            shortcut.Description = "Tekkzy Fit gym connection";
            var ico = Path.Combine(workDir, "logo.ico");
            if (File.Exists(ico)) shortcut.IconLocation = ico + ",0";
            shortcut.Save();
        }
        catch { }
    }
}
