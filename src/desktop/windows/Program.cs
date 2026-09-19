using System;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace TakeFive
{
    static class Program
    {
        private const string AppMutexName = "TakeFive_SingleInstance_Mutex";

        [STAThread]
        public static void Main()
        {
            Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);

            Application.ThreadException += (s, e) => LogAndReportFatal(e.Exception);
            AppDomain.CurrentDomain.UnhandledException += (s, e) => LogAndReportFatal(e.ExceptionObject as Exception);

            bool createdNew;
            using (var mutex = new Mutex(true, AppMutexName, out createdNew))
            {
                if (!createdNew)
                {
                    try
                    {
                        uint msg = NativeMethods.RegisterWindowMessage("TAKEFIVE_ACTIVATE_WINDOW");
                        NativeMethods.PostMessage(NativeMethods.HWND_BROADCAST, msg, IntPtr.Zero, IntPtr.Zero);
                    }
                    catch { }
                    return;
                }

                try
                {
                    Application.Run(new TakeFiveTrayApp());
                }
                catch (Exception ex)
                {
                    LogAndReportFatal(ex);
                }
            }
        }

        private static void LogAndReportFatal(Exception ex)
        {
            if (ex == null) return;
            try
            {
                var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                var dir = Path.Combine(home, ".takefive");
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

                var logPath = Path.Combine(dir, "crash.log");
                var entry = string.Format("[{0:yyyy-MM-dd HH:mm:ss}] Unhandled Exception: {1}\r\nStack Trace:\r\n{2}\r\n\r\n",
                    DateTime.Now, ex.Message, ex.StackTrace);
                File.AppendAllText(logPath, entry);
            }
            catch { }

            try
            {
                MessageBox.Show(
                    string.Format("片刻 (Take Five) 发生未捕获的错误并已记录：\r\n\r\n{0}\r\n\r\n日志已保存至 ~/.takefive/crash.log", ex.Message),
                    "片刻 (Take Five) 运行异常",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
            catch { }
        }
    }
}
