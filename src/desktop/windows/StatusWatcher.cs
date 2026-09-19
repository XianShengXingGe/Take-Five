using System;
using System.Collections.Generic;
using System.IO;
using System.Windows.Forms;

namespace TakeFive
{
    public partial class TakeFiveTrayApp
    {
        #region Status Refresh, Fallback Config, and File Watcher
        public void RefreshStatus()
        {
            try
            {
                var json = RunCli("status --json", true);
                if (string.IsNullOrEmpty(json))
                {
                    FallbackConfigRead();
                    return;
                }

                var root = JsonParser.Parse(json) as Dictionary<string, object>;
                if (root == null)
                {
                    FallbackConfigRead();
                    return;
                }

                // 1. Parse Bark
                if (root.TryGetValue("bark", out object barkObj) && barkObj is Dictionary<string, object> barkDict)
                {
                    if (barkDict.TryGetValue("configured", out object confVal) && confVal is bool bConf)
                    {
                        isBarkConfigured = bConf;
                    }
                    if (barkDict.TryGetValue("endpoint", out object epVal) && epVal is string sEp)
                    {
                        barkEndpoint = sEp;
                    }
                }

                // 2. Parse config (language, enabledAgents, events)
                var enabledMap = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
                if (root.TryGetValue("config", out object cfgObj) && cfgObj is Dictionary<string, object> cfgDict)
                {
                    if (cfgDict.TryGetValue("language", out object langVal) && langVal is string sLang && !string.IsNullOrEmpty(sLang))
                    {
                        language = sLang;
                    }

                    if (cfgDict.TryGetValue("enabledAgents", out object eaObj) && eaObj is Dictionary<string, object> eaDict)
                    {
                        foreach (var kvp in eaDict)
                        {
                            if (kvp.Value is bool bVal)
                            {
                                enabledMap[kvp.Key] = bVal;
                            }
                        }
                    }

                    if (cfgDict.TryGetValue("events", out object evtsObj) && evtsObj is Dictionary<string, object> evtsDict)
                    {
                        foreach (var kvp in evtsDict)
                        {
                            if (kvp.Value is Dictionary<string, object> evDetail)
                            {
                                if (evDetail.TryGetValue("level", out object lvlVal) && lvlVal is string sLvl)
                                {
                                    eventRules[kvp.Key] = sLvl;
                                }
                            }
                        }
                    }
                }

                // 3. Parse detected agents
                var detectedMap = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
                if (root.TryGetValue("agents", out object agsObj) && agsObj is Dictionary<string, object> agsDict)
                {
                    foreach (var kvp in agsDict)
                    {
                        if (kvp.Value is Dictionary<string, object> agDetail)
                        {
                            bool det = false;
                            bool inst = false;
                            if (agDetail.TryGetValue("detected", out object dVal) && dVal is bool bDet) det = bDet;
                            if (agDetail.TryGetValue("installed", out object iVal) && iVal is bool bInst) inst = bInst;
                            detectedMap[kvp.Key] = det || inst;
                        }
                    }
                }

                var agentsList = new List<DynamicAgent>();
                var knownAgents = new[]
                {
                    new DynamicAgent { Id = "codex", DisplayName = "OpenAI Codex" },
                    new DynamicAgent { Id = "antigravity", DisplayName = "Antigravity" },
                    new DynamicAgent { Id = "claude", DisplayName = "Claude Code / 桌面端" },
                    new DynamicAgent { Id = "opencode", DisplayName = "OpenCode" }
                };

                foreach (var item in knownAgents)
                {
                    item.Enabled = !enabledMap.ContainsKey(item.Id) || enabledMap[item.Id];
                    item.Detected = detectedMap.ContainsKey(item.Id) && detectedMap[item.Id];
                    item.Installed = item.Detected;
                    agentsList.Add(item);
                }

                dynamicAgents = agentsList;
            }
            catch
            {
                FallbackConfigRead();
            }
        }

        private void FallbackConfigRead()
        {
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            var credPath = Path.Combine(home, ".takefive", ".credential");
            if (File.Exists(credPath))
            {
                try
                {
                    var text = File.ReadAllText(credPath);
                    var credRoot = JsonParser.Parse(text) as Dictionary<string, object>;
                    if (credRoot != null && credRoot.TryGetValue("barkUrl", out object bUrl) && bUrl is string sUrl && !string.IsNullOrEmpty(sUrl))
                    {
                        barkEndpoint = sUrl;
                        isBarkConfigured = true;
                    }
                }
                catch { }
            }

            if (File.Exists(configPath))
            {
                try
                {
                    var text = File.ReadAllText(configPath);
                    var cfgRoot = JsonParser.Parse(text) as Dictionary<string, object>;
                    if (cfgRoot != null)
                    {
                        if (cfgRoot.TryGetValue("language", out object lVal) && lVal is string sL && !string.IsNullOrEmpty(sL))
                        {
                            language = sL;
                        }
                        if (!isBarkConfigured)
                        {
                            if (cfgRoot.TryGetValue("barkUrl", out object bUrl) && bUrl is string sBark && !string.IsNullOrEmpty(sBark))
                            {
                                barkEndpoint = sBark;
                                isBarkConfigured = true;
                            }
                            else if (cfgRoot.TryGetValue("endpoint", out object epUrl) && epUrl is string sEp && !string.IsNullOrEmpty(sEp))
                            {
                                barkEndpoint = sEp;
                                isBarkConfigured = true;
                            }
                        }
                        if (cfgRoot.TryGetValue("events", out object evObj) && evObj is Dictionary<string, object> evDict)
                        {
                            foreach (var kvp in evDict)
                            {
                                if (kvp.Value is Dictionary<string, object> d && d.TryGetValue("level", out object lv) && lv is string slv)
                                {
                                    eventRules[kvp.Key] = slv;
                                }
                            }
                        }
                    }
                }
                catch { }
            }

            if (dynamicAgents.Count == 0)
            {
                dynamicAgents = new List<DynamicAgent>
                {
                    new DynamicAgent { Id = "codex", DisplayName = "OpenAI Codex", Enabled = true, Detected = true },
                    new DynamicAgent { Id = "antigravity", DisplayName = "Antigravity", Enabled = true, Detected = true },
                    new DynamicAgent { Id = "claude", DisplayName = "Claude Code / 桌面端", Enabled = true, Detected = true },
                    new DynamicAgent { Id = "opencode", DisplayName = "OpenCode", Enabled = true, Detected = false }
                };
            }
        }

        #region Startup Shortcut Management
        public bool IsAutoStartEnabled()
        {
            try
            {
                var startupFolder = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
                var lnkPath = Path.Combine(startupFolder, "TakeFiveTray.lnk");
                return File.Exists(lnkPath);
            }
            catch
            {
                return false;
            }
        }

        public void SetAutoStart(bool enable)
        {
            try
            {
                var startupFolder = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
                var lnkPath = Path.Combine(startupFolder, "TakeFiveTray.lnk");

                if (enable)
                {
                    var exePath = Application.ExecutablePath;
                    var wshType = Type.GetTypeFromProgID("WScript.Shell");
                    if (wshType != null)
                    {
                        dynamic wsh = Activator.CreateInstance(wshType);
                        var shortcut = wsh.CreateShortcut(lnkPath);
                        shortcut.TargetPath = exePath;
                        shortcut.WorkingDirectory = Path.GetDirectoryName(exePath);
                        shortcut.Description = "Take Five System Tray";
                        shortcut.Save();
                    }
                }
                else
                {
                    if (File.Exists(lnkPath))
                    {
                        File.Delete(lnkPath);
                    }
                }
            }
            catch { }
        }
        #endregion

        private void StartWatcher()
        {
            try
            {
                var dir = Path.GetDirectoryName(configPath);
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

                watcher = new FileSystemWatcher(dir, Path.GetFileName(configPath))
                {
                    NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.Size,
                    EnableRaisingEvents = true
                };

                Action handleConfigChange = () =>
                {
                    RefreshStatus();
                    BuildMenu();
                    UpdateIcon();
                    if (mainWindow != null && !mainWindow.IsDisposed && mainWindow.Visible)
                    {
                        try
                        {
                            mainWindow.BeginInvoke((MethodInvoker)delegate
                            {
                                mainWindow.UpdateEventRulesFromController();
                            });
                        }
                        catch { }
                    }
                };

                watcher.Changed += (s, e) =>
                {
                    try { trayIcon.ContextMenuStrip?.BeginInvoke((MethodInvoker)delegate { handleConfigChange(); }); }
                    catch { handleConfigChange(); }
                };
                watcher.Created += (s, e) =>
                {
                    try { trayIcon.ContextMenuStrip?.BeginInvoke((MethodInvoker)delegate { handleConfigChange(); }); }
                    catch { handleConfigChange(); }
                };
                watcher.Renamed += (s, e) =>
                {
                    try { trayIcon.ContextMenuStrip?.BeginInvoke((MethodInvoker)delegate { handleConfigChange(); }); }
                    catch { handleConfigChange(); }
                };
            }
            catch { }
        }
        #endregion
    }
}
