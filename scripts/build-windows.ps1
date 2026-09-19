param()

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$PkgMgr = if (Get-Command pnpm -ErrorAction SilentlyContinue) { 'pnpm' } else { 'npm' }
& $PkgMgr run build

# Compile Windows System Tray native app using .NET SDK (win-x64 & win-arm64)
$Architectures = @('win-x64', 'win-arm64')
$DotnetCmd = Get-Command dotnet -ErrorAction SilentlyContinue

if ($DotnetCmd) {
  foreach ($Arch in $Architectures) {
    Write-Host "Compiling Windows native TakeFive app for $Arch using .NET SDK..." -ForegroundColor Green
    $OutDir = Join-Path $ProjectRoot "dist\$Arch"
    & dotnet publish (Join-Path $ProjectRoot 'src\desktop\windows\TakeFive.csproj') `
      -r $Arch `
      -c Release `
      --self-contained true `
      -p:PublishSingleFile=true `
      -p:EnableCompressionInSingleFile=true `
      -p:IncludeNativeLibrariesForSelfExtract=true `
      -p:DebugType=none `
      -p:DebugSymbols=false `
      -o $OutDir
  }
  if (Test-Path (Join-Path $ProjectRoot 'dist\win-x64\TakeFive.exe')) {
    Copy-Item -Force (Join-Path $ProjectRoot 'dist\win-x64\TakeFive.exe') (Join-Path $ProjectRoot 'dist\TakeFive.exe')
    Copy-Item -Force (Join-Path $ProjectRoot 'dist\win-x64\TakeFive.exe') (Join-Path $ProjectRoot 'TakeFive.exe')
  }
} else {
  Write-Warning 'dotnet CLI not found. Skipping native Windows executable compilation.'
}

$Version = node -p "require('./package.json').version"
$NodeCacheDir = Join-Path ([System.IO.Path]::GetTempPath()) 'takefive-node-cache'
New-Item -ItemType Directory -Force -Path $NodeCacheDir | Out-Null

foreach ($Arch in $Architectures) {
  Write-Host "--- Packaging architecture: $Arch ---" -ForegroundColor Cyan
  $Stage = Join-Path ([System.IO.Path]::GetTempPath()) ("takefive-windows-" + $Arch + "-" + [guid]::NewGuid().ToString('N'))
  $AppFolder = Join-Path $Stage 'TakeFive'
  $RuntimeDir = Join-Path $AppFolder 'runtime'

  New-Item -ItemType Directory -Force -Path $AppFolder, $RuntimeDir, (Join-Path $RuntimeDir 'dist') | Out-Null

  # 1. Copy single TakeFive.exe to application root (no duplicate TakeFiveTray.exe)
  $ExeSource = Join-Path $ProjectRoot "dist\$Arch\TakeFive.exe"
  if (-not (Test-Path $ExeSource)) {
    $ExeSource = Join-Path $ProjectRoot "dist\TakeFive.exe"
  }
  if (-not (Test-Path $ExeSource)) {
    $ExeSource = Join-Path $ProjectRoot "TakeFive.exe"
  }
  if (Test-Path $ExeSource) {
    Copy-Item -Force $ExeSource (Join-Path $AppFolder 'TakeFive.exe')
  }

  # 2. Package embedded runtime cleanly without redundancy
  Copy-Item -Recurse -Force (Join-Path $ProjectRoot 'dist\*') (Join-Path $RuntimeDir 'dist')
  Get-ChildItem (Join-Path $RuntimeDir 'dist') -Include '*.exe','*.pdb','*.map','TakeFive','TakeFiveMenuBar' -Recurse | Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem (Join-Path $RuntimeDir 'dist') -Directory | Where-Object { $_.Name -in @('win-x64', 'win-arm64', 'TakeFive', '片刻.app') } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item -Force (Join-Path $ProjectRoot 'package.json') $RuntimeDir
  if (Test-Path (Join-Path $ProjectRoot 'assets')) {
    Copy-Item -Recurse -Force (Join-Path $ProjectRoot 'assets') $RuntimeDir
    Copy-Item -Recurse -Force (Join-Path $ProjectRoot 'assets') $AppFolder
  }
  if (Test-Path (Join-Path $ProjectRoot 'skills')) {
    Copy-Item -Recurse -Force (Join-Path $ProjectRoot 'skills') $RuntimeDir
  }

  # Pull and embed matching architecture node.exe
  $CachedNode = Join-Path $NodeCacheDir "node-$Arch.exe"
  if (-not (Test-Path $CachedNode) -or (Get-Item $CachedNode).Length -lt 10000000) {
    $NodeUrl = "https://nodejs.org/dist/v20.18.0/$Arch/node.exe"
    Write-Host "Downloading $Arch node.exe from $NodeUrl..." -ForegroundColor Green
    try {
      Invoke-WebRequest -Uri $NodeUrl -OutFile $CachedNode -UseBasicParsing
    } catch {
      Write-Warning "Failed to download $Arch node.exe: $_"
    }
  }

  if (Test-Path $CachedNode) {
    Copy-Item -Force $CachedNode (Join-Path $RuntimeDir 'node.exe')
  } elseif ($Arch -eq 'win-x64' -and (Get-Command node -ErrorAction SilentlyContinue)) {
    Copy-Item -Force (Get-Command node).Source (Join-Path $RuntimeDir 'node.exe')
  }

  # Create runtime takefive.cmd wrapper
  $RuntimeCmd = "@echo off`r`n`"%~dp0node.exe`" `"%~dp0dist\cli.js`" %*`r`n"
  [System.IO.File]::WriteAllText((Join-Path $RuntimeDir 'takefive.cmd'), $RuntimeCmd, [System.Text.UTF8Encoding]::new($false))

  # 3. Setup installer scripts
  $Installer = @'
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

# Setup Windows System Tray executable & startup shortcut
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
'@
  Set-Content -Path (Join-Path $Stage 'Install Take Five.ps1') -Value $Installer -Encoding UTF8

  $InstallCmd = @'
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install Take Five.ps1"
'@
  Set-Content -Path (Join-Path $Stage 'Install Take Five.cmd') -Value $InstallCmd -Encoding ASCII

  $ManageCmd = @'
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
'@
  Set-Content -Path (Join-Path $Stage 'Manage Take Five.cmd') -Value $ManageCmd -Encoding ASCII

  $Readme = @"
Take Five (片刻) for Windows 10/11 ($Arch)

【即开即用（零环境依赖）】
直接双击 TakeFive\TakeFive.exe 即可直接打开桌面控制面板与右下角系统托盘！
无需预装 Node.js，内置原生独立 $Arch 运行环境。

【命令行安装（可选）】
双击 "Install Take Five.cmd" 可将 takefive 命令自动添加至系统环境变量。
"@
  Set-Content -Path (Join-Path $Stage 'README.txt') -Value $Readme -Encoding UTF8

  $ArchiveName = "TakeFive-v$Version-$Arch.zip"
  $ArchivePath = Join-Path $ProjectRoot $ArchiveName
  if (Test-Path $ArchivePath) { Remove-Item -Force $ArchivePath }
  Compress-Archive -Path (Join-Path $Stage '*') -DestinationPath $ArchivePath -CompressionLevel Optimal

  Remove-Item -Recurse -Force $Stage
  Write-Host "Created $ArchivePath" -ForegroundColor Green
}
