using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text;

namespace TakeFive
{
    #region Application Version Single Source of Truth
    public static class AppVersion
    {
        public const string DefaultVersion = "0.6.0";

        public static string Version
        {
            get
            {
                try
                {
                    string dir = AppDomain.CurrentDomain.BaseDirectory;
                    if (!string.IsNullOrEmpty(dir))
                    {
                        string[] candidates = new string[]
                        {
                            Path.Combine(dir, "package.json"),
                            Path.Combine(dir, "runtime", "package.json"),
                            Path.Combine(dir, "..", "package.json"),
                            Path.Combine(dir, "..", "..", "package.json")
                        };
                        foreach (var p in candidates)
                        {
                            if (File.Exists(p))
                            {
                                string text = File.ReadAllText(p);
                                var parsed = JsonParser.Parse(text) as Dictionary<string, object>;
                                if (parsed != null && parsed.ContainsKey("version") && parsed["version"] is string verStr && !string.IsNullOrEmpty(verStr))
                                {
                                    return verStr.Trim();
                                }
                            }
                        }
                    }
                }
                catch { }

                return DefaultVersion;
            }
        }

        public static string DisplayVersion
        {
            get
            {
                string v = Version;
                string[] parts = v.Split('.');
                string baseVer = (parts.Length >= 2) ? parts[0] + "." + parts[1] : v;
                return baseVer.StartsWith("v", StringComparison.OrdinalIgnoreCase) ? baseVer : "v" + baseVer;
            }
        }
    }
    #endregion

    #region Robust Minimal JSON Parser
    public static class JsonParser
    {
        public static object Parse(string json)
        {
            if (string.IsNullOrEmpty(json)) return null;
            int index = 0;
            return ParseValue(json, ref index);
        }

        private static void SkipWhitespace(string s, ref int index)
        {
            while (index < s.Length && char.IsWhiteSpace(s[index])) index++;
        }

        private static object ParseValue(string s, ref int index)
        {
            SkipWhitespace(s, ref index);
            if (index >= s.Length) return null;

            char c = s[index];
            if (c == '{') return ParseObject(s, ref index);
            if (c == '[') return ParseArray(s, ref index);
            if (c == '"') return ParseString(s, ref index);
            if (c == 't' || c == 'f') return ParseBool(s, ref index);
            if (c == 'n') return ParseNull(s, ref index);
            if (char.IsDigit(c) || c == '-') return ParseNumber(s, ref index);

            index++;
            return null;
        }

        private static Dictionary<string, object> ParseObject(string s, ref int index)
        {
            var dict = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            index++; // skip '{'

            while (index < s.Length)
            {
                SkipWhitespace(s, ref index);
                if (index >= s.Length) break;
                if (s[index] == '}') { index++; break; }

                string key = ParseString(s, ref index);
                SkipWhitespace(s, ref index);
                if (index < s.Length && s[index] == ':') index++; // skip ':'

                object val = ParseValue(s, ref index);
                if (key != null) dict[key] = val;

                SkipWhitespace(s, ref index);
                if (index < s.Length && s[index] == ',') index++;
                else if (index < s.Length && s[index] == '}') { index++; break; }
            }
            return dict;
        }

        private static List<object> ParseArray(string s, ref int index)
        {
            var list = new List<object>();
            index++; // skip '['

            while (index < s.Length)
            {
                SkipWhitespace(s, ref index);
                if (index >= s.Length) break;
                if (s[index] == ']') { index++; break; }

                object val = ParseValue(s, ref index);
                list.Add(val);

                SkipWhitespace(s, ref index);
                if (index < s.Length && s[index] == ',') index++;
                else if (index < s.Length && s[index] == ']') { index++; break; }
            }
            return list;
        }

        private static string ParseString(string s, ref int index)
        {
            SkipWhitespace(s, ref index);
            if (index >= s.Length || s[index] != '"') return null;
            index++; // skip opening quote

            var sb = new StringBuilder();
            while (index < s.Length)
            {
                char c = s[index++];
                if (c == '"') return sb.ToString();
                if (c == '\\' && index < s.Length)
                {
                    char esc = s[index++];
                    switch (esc)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u':
                            if (index + 4 <= s.Length)
                            {
                                string hex = s.Substring(index, 4);
                                index += 4;
                                if (int.TryParse(hex, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out int codePoint))
                                {
                                    sb.Append((char)codePoint);
                                }
                            }
                            break;
                        default: sb.Append(esc); break;
                    }
                }
                else
                {
                    sb.Append(c);
                }
            }
            return sb.ToString();
        }

        private static bool ParseBool(string s, ref int index)
        {
            if (s.Substring(index).StartsWith("true", StringComparison.OrdinalIgnoreCase))
            {
                index += 4;
                return true;
            }
            if (s.Substring(index).StartsWith("false", StringComparison.OrdinalIgnoreCase))
            {
                index += 5;
                return false;
            }
            index++;
            return false;
        }

        private static object ParseNull(string s, ref int index)
        {
            if (s.Substring(index).StartsWith("null", StringComparison.OrdinalIgnoreCase))
            {
                index += 4;
            }
            else
            {
                index++;
            }
            return null;
        }

        private static object ParseNumber(string s, ref int index)
        {
            int start = index;
            if (s[index] == '-') index++;
            while (index < s.Length && (char.IsDigit(s[index]) || s[index] == '.' || s[index] == 'e' || s[index] == 'E' || s[index] == '+' || s[index] == '-'))
            {
                index++;
            }
            string numStr = s.Substring(start, index - start);
            if (long.TryParse(numStr, NumberStyles.Integer, CultureInfo.InvariantCulture, out long lVal))
                return lVal;
            if (double.TryParse(numStr, NumberStyles.Float, CultureInfo.InvariantCulture, out double dVal))
                return dVal;
            return 0;
        }
    }
    #endregion

    #region Dual-language Localization Dictionary (I18n)
    public static class L10n
    {
        public static bool IsZh(string lang)
        {
            if (string.Equals(lang, "zh-CN", StringComparison.OrdinalIgnoreCase)) return true;
            if (string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase)) return false;
            return CultureInfo.CurrentUICulture.TwoLetterISOLanguageName.Equals("zh", StringComparison.OrdinalIgnoreCase);
        }

        public static string Tr(string key, string lang)
        {
            bool zh = IsZh(lang);
            switch (key)
            {
                case "app.name": return zh ? "片刻" : "Take Five";
                case "app.tagline": return zh ? "让 AI 持续工作，为你赢得片刻从容" : "Let AI do the work, reclaim your focus";
                case "header.visit_github": return zh ? "访问 GitHub 开源项目" : "Visit GitHub Repository";
                case "bark.title": return zh ? "📱 Bark 推送服务" : "📱 Bark Push Service";
                case "bark.status_connected": return zh ? "状态: 已连接 (就绪)" : "Status: Connected (Ready)";
                case "bark.status_unconfigured": return zh ? "状态: 未配置" : "Status: Not Configured";
                case "bark.target_empty": return zh ? "尚未填入 Bark 地址" : "Bark address not configured";
                case "bark.edit_placeholder": return zh ? "在此填入 Bark 推送地址 (如 https://api.day.app/xxx) 或设备 Key" : "Enter Bark URL (e.g. https://api.day.app/xxx) or Key";
                case "bark.paste": return zh ? "粘贴" : "Paste";
                case "bark.clear": return zh ? "清空" : "Clear";
                case "bark.copy": return zh ? "复制" : "Copy";
                case "bark.cut": return zh ? "剪切" : "Cut";
                case "bark.select_all": return zh ? "全选" : "Select All";
                case "bark.paste_tooltip": return zh ? "从剪贴板一键粘贴并保存" : "Paste from clipboard and save";
                case "bark.unconfigured_hint": return zh ? "尚未配置 Bark 推送服务。在下方填入您的 Bark 地址或设备 Key 以开启推送。" : "Bark push service is not configured. Enter your Bark URL or Key below to enable notifications.";
                case "bark.updating": return zh ? "正在更新配置并测试推送..." : "Updating & verifying push...";
                case "bark.updated": return zh ? "配置已保存，已发送测试推送" : "Config saved, test push sent";
                case "bark.update_failed": return zh ? "保存失败，请检查网络或配置" : "Failed to save configuration";
                case "bark.send_test": return zh ? "🧪 测试推送" : "🧪 Test Push";
                case "bark.sending": return zh ? "发送中..." : "Sending...";
                case "bark.edit": return zh ? "修改" : "Edit";
                case "agents.title": return zh ? "🤖 Agent 平台" : "🤖 Agent Platform";
                case "agents.detected": return zh ? "已检测" : "Detected";
                case "agents.undetected": return zh ? "未检测" : "Undetected";
                case "agents.mute_all": return zh ? "全部静音" : "Mute All";
                case "agents.enable_all": return zh ? "全部开启" : "Enable All";
                case "agents.desc.codex": return zh ? "CLI 与桌面端联动通知" : "CLI & Desktop coordinated notification";
                case "agents.desc.antigravity": return zh ? "Google Antigravity 任务与询问捕获" : "Google Antigravity task & prompt capture";
                case "agents.desc.claude": return zh ? "Claude Code 终端与桌面 MCP" : "Claude Code terminal & desktop MCP";
                case "agents.desc.opencode": return zh ? "OpenCode 插件与会话空闲捕获" : "OpenCode plugin & session idle capture";
                case "rules.title": return zh ? "🔔 通知规则" : "🔔 Notification Rules";
                case "rules.description": return zh ? "按需设置事件提醒级别，兼顾及时响应与沉浸专注" : "Customize alert priority for each event to balance focus and responsiveness";
                case "rules.task_completed": return zh ? "任务完成" : "Task Completed";
                case "rules.waiting_permission": return zh ? "等待授权" : "Waiting Permission";
                case "rules.waiting_input": return zh ? "等待输入" : "Waiting Input";
                case "rules.task_failed": return zh ? "任务失败" : "Task Failed";
                case "rules.level_active": return zh ? "普通" : "Active";
                case "rules.level_timeSensitive": return zh ? "重要" : "Time-Sensitive";
                case "preferences.title": return zh ? "⚙️ 通用设置" : "⚙️ General Settings";
                case "preferences.autostart": return zh ? "开机自动启动" : "Launch at Windows startup";
                case "preferences.autostart_desc": return zh ? "随系统启动并在托盘常驻，保障后台无缝监听" : "Launch at Windows startup and run in tray";
                case "preferences.language": return zh ? "界面语言" : "App Language";
                case "preferences.lang_system": return zh ? "跟随系统" : "System";
                case "preferences.lang_zh": return zh ? "简体中文" : "简体中文";
                case "preferences.lang_en": return zh ? "English" : "English";
                case "preferences.re_onboard": return zh ? "配置向导" : "Setup Wizard";
                case "preferences.open_terminal": return zh ? "终端配置" : "Terminal Config";
                case "preferences.quit": return zh ? "退出" : "Quit";
                case "support.title": return zh ? "❤️ 支持与赞赏" : "❤️ Support & Sponsor";
                case "support.dev_title": return zh ? "打赏开发者" : "Support the Developer";
                case "support.dev_desc": return zh ? "所有功能完全免费，您的认可将激励片刻持续进化" : "Take Five is 100% free and open-source. Your support keeps it evolving";
                case "support.donate_button": return zh ? "赞赏支持" : "Sponsor";
                case "support.channel_xiaohongshu": return zh ? "小红书" : "Xiaohongshu";
                case "support.channel_weibo": return zh ? "微博" : "Weibo";
                case "support.channel_email": return zh ? "合作邮箱" : "Contact Email";
                case "support.open_link": return zh ? "直达" : "Open";
                case "support.copy_link": return zh ? "复制" : "Copy";
                case "support.copied": return zh ? "已复制" : "Copied";
                case "donation.modal_title": return zh ? "赞赏支持开发者" : "Support the Developer";
                case "donation.modal_subtitle": return zh ? "每一份支持都将用于片刻的多 Agent 适配与功能迭代" : "Every contribution fuels Take Five development and multi-agent integrations";
                case "donation.alipay": return zh ? "支付宝" : "Alipay";
                case "donation.wechat": return zh ? "微信支付" : "WeChat Pay";
                case "donation.footer_note": return zh ? "扫码即刻赞赏，感谢每一份温暖与信任" : "Scan to donate. Thank you for your support!";
                case "donation.close": return zh ? "关闭" : "Close";
                case "menu.open_dash": return zh ? "🖥 打开片刻控制面板" : "🖥 Open Take Five Dashboard";
                case "menu.notifications_active": return zh ? "● 全局通知：已开启 (点击静音)" : "● Notifications: Active (Click to Mute)";
                case "menu.notifications_muted": return zh ? "○ 全局通知：已静音 (点击开启)" : "○ Notifications: Muted (Click to Enable)";
                case "menu.notifications_partial": return zh ? "◐ 全局通知：部分开启 (点击静音)" : "◐ Notifications: Partial (Click to Mute)";
                case "menu.send_test": return zh ? "🧪 发送测试通知" : "🧪 Send Test Push";
                case "menu.quit": return zh ? "✕ 退出片刻" : "✕ Quit Take Five";
                case "tip.monitoring": return zh ? "片刻 · 监控中" : "Take Five · Monitoring";
                case "tip.muted": return zh ? "片刻 · 已静音" : "Take Five · Muted";
                case "tip.unconfigured": return zh ? "片刻 · 未配置" : "Take Five · Not Configured";
                case "wizard.title": return zh ? "片刻 · 新手配置向导" : "Take Five · Setup Wizard";
                case "wizard.hero": return zh ? "让 AI 持续工作，为你赢得片刻从容" : "Let AI focus, reclaim your focus";
                case "wizard.hero_sub": return zh ? "片刻 专为 Coding Agent 用户打造，秒级推送到你的手机。" : "Take Five delivers low-noise, high-precision push notifications to Bark.";
                case "wizard.start": return zh ? "开始配置 (1 分钟) ➜" : "Get Started (1 min) ➜";
                case "wizard.prev": return zh ? "◀ 上一步" : "◀ Previous";
                case "wizard.next": return zh ? "下一步 ➜" : "Next ➜";
                case "wizard.finish": return zh ? "✔ 完成配置并进入后台常驻" : "✔ Finish & Enter Tray";
                default: return key;
            }
        }
    }
    #endregion

    #region Models
    public class DynamicAgent
    {
        public string Id { get; set; }
        public string DisplayName { get; set; }
        public bool Enabled { get; set; }
        public bool Detected { get; set; }
        public bool Installed { get; set; }
        public string ConfigPath { get; set; }
    }
    #endregion
}
