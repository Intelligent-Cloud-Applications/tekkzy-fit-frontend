using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Tekkzy Fit")]
[assembly: AssemblyProduct("Tekkzy Fit")]
[assembly: AssemblyDescription("Connects the gym face terminal to Tekkzy Fit")]
[assembly: AssemblyCompany("Tekkzy")]
[assembly: AssemblyVersion("1.1.0.0")]
[assembly: AssemblyFileVersion("1.1.0.0")]

internal static class TekkzyFit
{
    const string Site = "https://fitnessworld2.0.tekkzy.com";
    const string RunName = "TekkzyFit";
    static readonly string ExeDir = AppDomain.CurrentDomain.BaseDirectory;
    static readonly string Root = ResolveRoot();
    static readonly string LogFile = Path.Combine(Root, "data", "gym-pc.log");
    static Process _server;
    static Mutex _mutex;
    static Icon _appIcon;

    static string ResolveRoot()
    {
        if (File.Exists(Path.Combine(ExeDir, "server.cjs"))) return ExeDir.TrimEnd(Path.DirectorySeparatorChar);
        return Path.GetFullPath(Path.Combine(ExeDir, ".."));
    }

    [STAThread]
    static void Main(string[] args)
    {
        bool created;
        _mutex = new Mutex(true, @"Local\TekkzyFitGymPc", out created);
        if (!created)
        {
            if (Array.IndexOf(args, "--silent") < 0) OpenSite();
            return;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Directory.CreateDirectory(Path.Combine(Root, "data"));
        RegisterAutoStart();
        var silent = Array.IndexOf(args, "--silent") >= 0;
        EnsureServer(silent);
        if (!silent) OpenSite();
        Application.Run(new Tray());
    }

    static void Log(string message)
    {
        try { File.AppendAllText(LogFile, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + message + Environment.NewLine); }
        catch { }
    }

    static bool Healthy()
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:8787/api/health");
            req.Timeout = 2000;
            using (var res = req.GetResponse()) return true;
        }
        catch { return false; }
    }

    static string NodePath()
    {
        var portable = Path.Combine(Root, "runtime", "node.exe");
        if (File.Exists(portable)) return portable;
        var local = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
        if (File.Exists(local)) return local;
        return "node";
    }

    static bool Packaged()
    {
        return File.Exists(Path.Combine(Root, "server.cjs"));
    }

    internal static void EnsureServer()
    {
        EnsureServer(true);
    }

    internal static void EnsureServer(bool silent)
    {
        if (Healthy()) return;
        Log("starting connection service from " + Root);
        var node = NodePath();
        var bundled = Path.Combine(Root, "server.cjs");
        var tsx = Path.Combine(Root, "node_modules", "tsx", "dist", "cli.mjs");
        var server = Path.Combine(Root, "server", "index.ts");
        string arguments;
        if (File.Exists(bundled))
        {
            arguments = "\"" + bundled + "\"";
        }
        else if (File.Exists(tsx) && File.Exists(server))
        {
            arguments = "\"" + tsx + "\" --tsconfig \"" + Path.Combine(Root, "tsconfig.server.json") + "\" \"" + server + "\"";
        }
        else
        {
            Log("app files missing under " + Root);
            if (!silent)
            {
                MessageBox.Show(
                    "Tekkzy Fit could not find its connection files on this PC." + Environment.NewLine +
                    "Download Tekkzy Fit again from Settings on the website, then double-click the installer.",
                    "Tekkzy Fit",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
            return;
        }
        try
        {
            var info = new ProcessStartInfo
            {
                FileName = node,
                Arguments = arguments,
                WorkingDirectory = Root,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            try
            {
                info.EnvironmentVariables["TEKKZY_HOME"] = Root;
                info.EnvironmentVariables["PORT"] = "8787";
            }
            catch { }
            _server = Process.Start(info);
            if (_server != null)
            {
                _server.OutputDataReceived += (s, e) => { if (!string.IsNullOrEmpty(e.Data)) Log(e.Data); };
                _server.ErrorDataReceived += (s, e) => { if (!string.IsNullOrEmpty(e.Data)) Log(e.Data); };
                _server.BeginOutputReadLine();
                _server.BeginErrorReadLine();
            }
            for (var i = 0; i < 30 && !Healthy(); i++) Thread.Sleep(500);
            if (!Healthy())
            {
                Log("health check failed after start");
                if (!silent)
                {
                    MessageBox.Show(
                        "Tekkzy Fit is installed, but the face-terminal connection did not start." + Environment.NewLine +
                        "Keep this PC on the gym Wi-Fi and try Open Tekkzy Fit from the tray icon.",
                        "Tekkzy Fit",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning);
                }
            }
        }
        catch (Exception ex)
        {
            Log("start failed: " + ex.Message);
            if (!silent)
            {
                MessageBox.Show(
                    "Could not start Tekkzy Fit: " + ex.Message,
                    "Tekkzy Fit",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }
    }

    static string AppBrowser()
    {
        var paths = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe"),
        };
        foreach (var path in paths)
        {
            if (File.Exists(path)) return path;
        }
        return null;
    }

    internal static void OpenSite()
    {
        try
        {
            var browser = AppBrowser();
            if (browser != null)
            {
                var profile = Path.Combine(Root, "data", "app-profile");
                Directory.CreateDirectory(profile);
                Process.Start(new ProcessStartInfo
                {
                    FileName = browser,
                    Arguments = "--app=" + Site + " --user-data-dir=\"" + profile + "\" --start-maximized",
                    UseShellExecute = false,
                });
                return;
            }
            Process.Start(new ProcessStartInfo { FileName = Site, UseShellExecute = true });
        }
        catch (Exception ex)
        {
            Log("open site: " + ex.Message);
        }
    }

    static Icon LoadAppIcon()
    {
        if (_appIcon != null) return _appIcon;
        try
        {
            var ico = Path.Combine(ExeDir, "logo.ico");
            if (File.Exists(ico))
            {
                _appIcon = new Icon(ico, 32, 32);
                return _appIcon;
            }
        }
        catch { }
        _appIcon = SystemIcons.Application;
        return _appIcon;
    }

    static void RegisterAutoStart()
    {
        try
        {
            var exe = Path.Combine(ExeDir, "TekkzyFit.exe");
            using (var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))
            {
                if (key != null) key.SetValue(RunName, "\"" + exe + "\" --silent");
            }
        }
        catch (Exception ex)
        {
            Log("autostart: " + ex.Message);
        }
    }

    sealed class Tray : ApplicationContext
    {
        readonly NotifyIcon _icon;

        public Tray()
        {
            var menu = new ContextMenuStrip();
            menu.Items.Add("Open Tekkzy Fit", null, (s, e) => { EnsureServer(true); OpenSite(); });
            menu.Items.Add("Connect terminal", null, (s, e) =>
            {
                EnsureServer(true);
                _icon.ShowBalloonTip(2500, "Tekkzy Fit", Healthy() ? "Connected. Opening Tekkzy Fit." : "Still starting. Keep this PC on the gym Wi-Fi.", ToolTipIcon.Info);
                OpenSite();
            });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Exit", null, (s, e) => Exit());

            _icon = new NotifyIcon
            {
                Icon = LoadAppIcon(),
                Visible = true,
                Text = "Tekkzy Fit",
                ContextMenuStrip = menu,
            };
            _icon.DoubleClick += (s, e) => { EnsureServer(true); OpenSite(); };
            _icon.ShowBalloonTip(3000, "Tekkzy Fit", Healthy() ? "Face terminal connection is on." : "Starting the face terminal connection.", ToolTipIcon.Info);
        }

        void Exit()
        {
            _icon.Visible = false;
            try { if (_server != null && !_server.HasExited) _server.Kill(); } catch { }
            Application.Exit();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) _icon.Dispose();
            base.Dispose(disposing);
        }
    }
}
