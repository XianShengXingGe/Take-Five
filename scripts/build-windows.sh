#!/usr/bin/env bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "=== 1. 构建 TypeScript 产物 ==="
PKG_MGR="npm"
if command -v pnpm >/dev/null 2>&1; then
  PKG_MGR="pnpm"
fi
$PKG_MGR run build

mkdir -p dist

echo "=== 2. 编译 Windows 原生 TakeFive.exe 桌面应用 (win-x64 & win-arm64) ==="
DOTNET_BIN=""
if command -v dotnet >/dev/null 2>&1; then
  DOTNET_BIN="dotnet"
elif [ -x "/tmp/dotnet/dotnet" ]; then
  DOTNET_BIN="/tmp/dotnet/dotnet"
  export PATH="/tmp/dotnet:$PATH"
fi

ARCHITECTURES=("win-x64" "win-arm64")

if [ -n "$DOTNET_BIN" ]; then
  for ARCH in "${ARCHITECTURES[@]}"; do
    echo "使用 .NET SDK ($DOTNET_BIN) 跨平台编译 Windows 原生应用 ($ARCH)..."
    "$DOTNET_BIN" publish src/desktop/windows/TakeFive.csproj \
      -r "$ARCH" \
      -c Release \
      --self-contained true \
      -p:PublishSingleFile=true \
      -p:EnableCompressionInSingleFile=true \
      -p:IncludeNativeLibrariesForSelfExtract=true \
      -p:DebugType=none \
      -p:DebugSymbols=false \
      -o "dist/$ARCH"
  done
  rm -rf src/desktop/windows/bin src/desktop/windows/obj

  if [ -f "dist/win-x64/TakeFive.exe" ]; then
    cp -f "dist/win-x64/TakeFive.exe" "dist/TakeFive.exe"
    cp -f "dist/win-x64/TakeFive.exe" "$PROJECT_ROOT/TakeFive.exe"
  fi
fi

VERSION=$(node -p "require('./package.json').version")
NODE_CACHE_DIR="/tmp/takefive-cache"
mkdir -p "$NODE_CACHE_DIR"

echo "=== 3. 组装 Windows 双架构绿色便携包与安装向导 ==="
for ARCH in "${ARCHITECTURES[@]}"; do
  echo "--- 打包架构: $ARCH ---"
  STAGE="$(mktemp -d -t "takefive_win_${ARCH}_XXXXXX")"
  APP_FOLDER="$STAGE/TakeFive"
  RUNTIME_DIR="$APP_FOLDER/runtime"

  mkdir -p "$APP_FOLDER" "$RUNTIME_DIR/dist"

  # 1. 复制单个原生 TakeFive.exe，消除冗余复制
  EXE_SOURCE="dist/$ARCH/TakeFive.exe"
  if [ ! -f "$EXE_SOURCE" ] && [ -f "dist/TakeFive.exe" ]; then
    EXE_SOURCE="dist/TakeFive.exe"
  elif [ ! -f "$EXE_SOURCE" ] && [ -f "$PROJECT_ROOT/TakeFive.exe" ]; then
    EXE_SOURCE="$PROJECT_ROOT/TakeFive.exe"
  fi

  if [ -f "$EXE_SOURCE" ]; then
    cp -f "$EXE_SOURCE" "$APP_FOLDER/TakeFive.exe"
  else
    echo "警告: 未找到 $ARCH 对应的 TakeFive.exe"
  fi

  # 2. 内嵌独立运行时并清理冗余
  cp -R dist/* "$RUNTIME_DIR/dist/"
  rm -rf "$RUNTIME_DIR/dist/win-x64" "$RUNTIME_DIR/dist/win-arm64" "$RUNTIME_DIR/dist/"*.app
  rm -f "$RUNTIME_DIR/dist/"*.exe "$RUNTIME_DIR/dist/"*.pdb "$RUNTIME_DIR/dist/"*.map "$RUNTIME_DIR/dist/TakeFive" "$RUNTIME_DIR/dist/TakeFiveMenuBar"
  cp package.json "$RUNTIME_DIR/"
  [ -d "assets" ] && cp -R assets "$RUNTIME_DIR/"
  [ -d "assets" ] && cp -R assets "$APP_FOLDER/"
  [ -d "skills" ] && cp -R skills "$RUNTIME_DIR/"

  # 嵌入对应架构的官方独立 node.exe
  CACHED_NODE="$NODE_CACHE_DIR/node-${ARCH}.exe"
  if [ ! -f "$CACHED_NODE" ] || [ ! -s "$CACHED_NODE" ]; then
    if command -v curl >/dev/null 2>&1; then
      echo "下载 Windows ($ARCH) 官方独立 node.exe 嵌入运行时..."
      curl -sSL -f "https://nodejs.org/dist/v20.18.0/${ARCH}/node.exe" -o "$CACHED_NODE" || true
    fi
  fi

  if [ -f "$CACHED_NODE" ] && [ -s "$CACHED_NODE" ]; then
    cp -f "$CACHED_NODE" "$RUNTIME_DIR/node.exe"
  elif [ -f "/tmp/node.exe" ] && [ "$ARCH" = "win-x64" ]; then
    cp -f "/tmp/node.exe" "$RUNTIME_DIR/node.exe"
  fi

  # 创建 takefive.cmd
  printf "@echo off\r\n\"%%~dp0node.exe\" \"%%~dp0dist\\cli.js\" %%*\r\n" > "$RUNTIME_DIR/takefive.cmd"

  # 3. 安装脚本与管理说明
  cat << 'INSTALLER_EOF' > "$STAGE/Install Take Five.ps1"
$ErrorActionPreference = 'Stop'
$SourceBundle = Join-Path $PSScriptRoot 'TakeFive'
$TargetDir = Join-Path $env:USERPROFILE '.takefive\app'
$BinDir = Join-Path $env:LOCALAPPDATA 'TakeFive\bin'
$Launcher = Join-Path $BinDir 'takefive.cmd'

New-Item -ItemType Directory -Force -Path $TargetDir, $BinDir | Out-Null
Get-ChildItem -Force $TargetDir -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force

if (Test-Path $SourceBundle) {
  Copy-Item -Recurse -Force (Join-Path $SourceBundle '*') $TargetDir
}

$RuntimeNode = Join-Path $TargetDir 'runtime\node.exe'
if (-not (Test-Path $RuntimeNode)) {
  $NodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($NodeCommand) { $RuntimeNode = $NodeCommand.Source }
}

$CliPath = Join-Path $TargetDir 'runtime\dist\cli.js'
if (-not (Test-Path $CliPath)) {
  $CliPath = Join-Path $TargetDir 'dist\cli.js'
}

$LauncherBody = "@echo off`r`n`"$RuntimeNode`" `"$CliPath`" %*`r`n"
[System.IO.File]::WriteAllText($Launcher, $LauncherBody, [System.Text.UTF8Encoding]::new($false))

$TraySource = Join-Path $TargetDir 'TakeFive.exe'
if (-not (Test-Path $TraySource)) {
  $TraySource = Join-Path $TargetDir 'dist\TakeFiveTray.exe'
}
if (Test-Path $TraySource) {
  $TrayDest = Join-Path $BinDir 'TakeFive.exe'
  Copy-Item -Force $TraySource $TrayDest
  $StartupFolder = [System.Environment]::GetFolderPath('Startup')
  $ShortcutPath = Join-Path $StartupFolder 'TakeFiveTray.lnk'
  $WshShell = New-Object -ComObject WScript.Shell
  $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
  $Shortcut.TargetPath = $TrayDest
  $Shortcut.WorkingDirectory = $BinDir
  $Shortcut.Description = 'Take Five (片刻) Desktop Assistant'
  $Shortcut.Save()

  Stop-Process -Name 'TakeFive' -Force -ErrorAction SilentlyContinue
  Stop-Process -Name 'TakeFiveTray' -Force -ErrorAction SilentlyContinue
  Start-Process -FilePath $TrayDest
  Write-Host 'Take Five Desktop Assistant started.' -ForegroundColor Green
}

$UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$PathParts = @($UserPath -split ';' | Where-Object { $_ })
if ($PathParts -notcontains $BinDir) {
  $NewPath = (($PathParts + $BinDir) -join ';')
  [Environment]::SetEnvironmentVariable('Path', $NewPath, 'User')
}
$env:Path = "$BinDir;$env:Path"

Write-Host 'Take Five installed. Starting setup wizard...' -ForegroundColor Green
& $Launcher install
Read-Host 'Setup finished. Press Enter to close'
INSTALLER_EOF

  printf "@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File \"%%~dp0Install Take Five.ps1\"\r\n" > "$STAGE/Install Take Five.cmd"

  cat << 'MANAGE_EOF' > "$STAGE/Manage Take Five.cmd"
@echo off
set "TF=%LOCALAPPDATA%\TakeFive\bin\takefive.cmd"
if not exist "%TF%" (
  if exist "%~dp0TakeFive\runtime\takefive.cmd" (
    call "%~dp0TakeFive\runtime\takefive.cmd" config
    pause
    exit /b 0
  )
  echo Take Five is not installed. Run Install Take Five.cmd first or run TakeFive\TakeFive.exe.
  pause
  exit /b 1
)
call "%TF%" config
pause
MANAGE_EOF

  cat << README_EOF > "$STAGE/README.txt"
Take Five (片刻) for Windows 10/11 ($ARCH)

【即开即用（零环境依赖）】
直接双击 TakeFive\TakeFive.exe 即可直接打开桌面控制面板与右下角系统托盘！
无需预装 Node.js，内置原生独立 $ARCH 运行环境。

【命令行安装（可选）】
双击 "Install Take Five.cmd" 可将 takefive 命令自动添加至系统环境变量。
README_EOF

  echo "=== 4. 压缩 Windows 分发包 ($ARCH) ==="
  ARCHIVE_NAME="TakeFive-v${VERSION}-${ARCH}.zip"

  (cd "$STAGE" && zip -qr9 "$PROJECT_ROOT/$ARCHIVE_NAME" .)

  rm -rf "$STAGE"
  echo "成功生成: $ARCHIVE_NAME"
done

echo "=== 5. Windows 双架构打包完成 ==="
ls -lh "$PROJECT_ROOT"/TakeFive-v${VERSION}-win-*.zip "$PROJECT_ROOT/TakeFive.exe"
