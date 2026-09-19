using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

namespace TakeFive
{
    public partial class TakeFiveTrayApp
    {
        #region CLI Runner and Runtime Paths
        public string GetEmbeddedRuntimeDir()
        {
            var custom = Environment.GetEnvironmentVariable("TAKEFIVE_RUNTIME_DIR");
            if (!string.IsNullOrEmpty(custom) && Directory.Exists(custom)) return custom;

            var baseDir = AppDomain.CurrentDomain.BaseDirectory;
            var runtimeDir = Path.Combine(baseDir, "runtime");
            if (Directory.Exists(runtimeDir)) return runtimeDir;

            var localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var appRuntime = Path.Combine(localApp, "TakeFive", "app");
            if (Directory.Exists(appRuntime)) return appRuntime;

            return null;
        }

        public string GetEmbeddedNodePath()
        {
            var custom = Environment.GetEnvironmentVariable("TAKEFIVE_NODE_PATH");
            if (!string.IsNullOrEmpty(custom) && File.Exists(custom)) return custom;

            var r = GetEmbeddedRuntimeDir();
            if (r != null)
            {
                var candidates = new[]
                {
                    Path.Combine(r, "node.exe"),
                    Path.Combine(r, "bin", "node.exe")
                };
                foreach (var c in candidates)
                {
                    if (File.Exists(c)) return c;
                }
            }
            return null;
        }

        private void ResolvePaths()
        {
            var customConfig = Environment.GetEnvironmentVariable("TAKEFIVE_CONFIG_PATH");
            if (!string.IsNullOrEmpty(customConfig))
            {
                configPath = customConfig;
            }
            else
            {
                var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                configPath = Path.Combine(userProfile, ".takefive", "config.json");
            }

            var customCli = Environment.GetEnvironmentVariable("TAKEFIVE_CLI_PATH");
            if (!string.IsNullOrEmpty(customCli) && File.Exists(customCli))
            {
                cliPath = customCli;
                return;
            }

            var r = GetEmbeddedRuntimeDir();
            if (r != null)
            {
                var embeddedCandidates = new[]
                {
                    Path.Combine(r, "takefive.cmd"),
                    Path.Combine(r, "bin", "takefive.cmd"),
                    Path.Combine(r, "dist", "cli.js")
                };
                foreach (var c in embeddedCandidates)
                {
                    if (File.Exists(c))
                    {
                        cliPath = c;
                        return;
                    }
                }
            }

            var localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var sysCandidates = new[]
            {
                Path.Combine(localApp, "TakeFive", "bin", "takefive.cmd"),
                Path.Combine(localApp, "TakeFive", "app", "dist", "cli.js")
            };
            foreach (var p in sysCandidates)
            {
                if (File.Exists(p))
                {
                    cliPath = p;
                    return;
                }
            }
        }

        public void InvokeOnUI(Action action)
        {
            if (action == null) return;
            try
            {
                if (mainWindow != null && !mainWindow.IsDisposed && mainWindow.InvokeRequired)
                {
                    mainWindow.BeginInvoke(action);
                    return;
                }
                if (trayIcon?.ContextMenuStrip != null && !trayIcon.ContextMenuStrip.IsDisposed && trayIcon.ContextMenuStrip.InvokeRequired)
                {
                    trayIcon.ContextMenuStrip.BeginInvoke(action);
                    return;
                }
                action();
            }
            catch
            {
                try { action(); } catch { }
            }
        }

        private string ExecuteCliInternal(string args, bool captureOutput)
        {
            if (string.IsNullOrEmpty(cliPath)) return null;

            try
            {
                var psi = new ProcessStartInfo();
                var node = GetEmbeddedNodePath();

                if (cliPath.EndsWith(".js", StringComparison.OrdinalIgnoreCase))
                {
                    psi.FileName = !string.IsNullOrEmpty(node) ? node : "node";
                    psi.Arguments = string.Format("\"{0}\" {1}", cliPath, args);
                }
                else
                {
                    psi.FileName = cliPath;
                    psi.Arguments = args;
                }

                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.RedirectStandardOutput = captureOutput;
                psi.RedirectStandardError = captureOutput;

                using (var proc = Process.Start(psi))
                {
                    if (captureOutput)
                    {
                        string outStr = proc.StandardOutput.ReadToEnd();
                        proc.WaitForExit(5000);
                        return outStr;
                    }
                    proc.WaitForExit(5000);
                }
            }
            catch { }
            return null;
        }

        public string RunCli(string args, bool captureOutput)
        {
            return RunCli(args, captureOutput, null);
        }

        public string RunCli(string args, bool captureOutput, Action<string> onCompleted)
        {
            if (string.IsNullOrEmpty(cliPath))
            {
                onCompleted?.Invoke(null);
                return null;
            }

            if (!captureOutput || onCompleted != null)
            {
                ThreadPool.QueueUserWorkItem(_ =>
                {
                    string outStr = ExecuteCliInternal(args, captureOutput);
                    InvokeOnUI(() =>
                    {
                        if (onCompleted != null)
                        {
                            onCompleted(outStr);
                        }
                        else
                        {
                            RefreshStatus();
                            BuildMenu();
                            UpdateIcon();
                        }
                    });
                });
                return null;
            }

            return ExecuteCliInternal(args, true);
        }

        public void SaveBarkCredential(string endpoint)
        {
            SaveBarkCredential(endpoint, null);
        }

        public void SaveBarkCredential(string endpoint, Action<string> onCompleted)
        {
            barkEndpoint = endpoint;
            isBarkConfigured = !string.IsNullOrEmpty(endpoint);
            RunCli(string.Format("config --bark-url \"{0}\" --quiet", endpoint), false, res =>
            {
                RefreshStatus();
                BuildMenu();
                UpdateIcon();
                onCompleted?.Invoke(res);
            });
        }

        public void RunCliInteractive(string command)
        {
            try
            {
                var nodeExe = GetEmbeddedNodePath();
                string targetCmd;
                if (!string.IsNullOrEmpty(cliPath) && cliPath.EndsWith(".js", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(nodeExe))
                {
                    targetCmd = string.Format("\"{0}\" \"{1}\" {2}", nodeExe, cliPath, command);
                }
                else if (!string.IsNullOrEmpty(cliPath) && (cliPath.EndsWith(".cmd", StringComparison.OrdinalIgnoreCase) || cliPath.EndsWith(".bat", StringComparison.OrdinalIgnoreCase)))
                {
                    targetCmd = string.Format("\"{0}\" {1}", cliPath, command);
                }
                else
                {
                    targetCmd = string.Format("takefive {0}", command);
                }

                Process.Start(new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = string.Format("/c {0}", targetCmd),
                    CreateNoWindow = false,
                    UseShellExecute = true
                });
            }
            catch { }
        }
        #endregion
    }
}
