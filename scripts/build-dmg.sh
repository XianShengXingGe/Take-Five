#!/usr/bin/env bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "=== 1. 构建项目与原生应用 ==="
PKG_MGR="npm"
if command -v pnpm >/dev/null 2>&1; then
  PKG_MGR="pnpm"
fi

$PKG_MGR run build

mkdir -p dist
if command -v swiftc >/dev/null 2>&1; then
  echo "编译 macOS 原生 Take Five 桌面应用 (Apple Silicon arm64)..."
  swiftc -O -target arm64-apple-macos12.0 src/desktop/macos/*.swift -o dist/TakeFive
  cp -f dist/TakeFive dist/TakeFiveMenuBar
fi

rm -rf dist/*.app dist/win-x64 dist/win-arm64 dist/*.exe dist/*.pdb dist/*.map
$PKG_MGR pack
rm -f "$PROJECT_ROOT"/takefive-*.tgz

VERSION=$(node -p "require('./package.json').version")
DMG_NAME="${DMG_NAME:-TakeFive-v${VERSION}-macOS.dmg}"
BUILD_DIR="$(mktemp -d -t takefive_dmg_XXXXXX)"

echo "=== 2. 组装标准 macOS 片刻.app (Take Five.app) Bundle ==="

APP_NAME="片刻"
APP_DIR="$BUILD_DIR/${APP_NAME}.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$APP_DIR/Contents/MacOS"
RESOURCES_DIR="$APP_DIR/Contents/Resources"
RUNTIME_DIR="$APP_DIR/Contents/Resources/runtime"

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR" "$RUNTIME_DIR/bin" "$RUNTIME_DIR/dist"

# 1. 复制可执行文件
if [ -f "dist/TakeFive" ]; then
  cp "dist/TakeFive" "$MACOS_DIR/TakeFive"
  chmod +x "$MACOS_DIR/TakeFive"
fi

# 2. 生成 Info.plist
cat << PLIST_EOF > "$APP_DIR/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>zh-Hans</string>
    <key>CFBundleDisplayName</key>
    <string>片刻</string>
    <key>CFBundleExecutable</key>
    <string>TakeFive</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>com.takefive.desktop</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>片刻</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>CFBundleLocalizations</key>
    <array>
        <string>zh-Hans</string>
        <string>zh_CN</string>
        <string>zh</string>
        <string>en</string>
    </array>
    <key>CFBundleAllowMixedLocalizations</key>
    <true/>
    <key>LSHasLocalizedDisplayName</key>
    <true/>
    <key>LSMinimumSystemVersion</key>
    <string>12.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSUIElement</key>
    <true/>
</dict>
</plist>
PLIST_EOF

# 2.1 本地化 App 名称 (中文: 片刻 / 英文: Take Five)
mkdir -p "$RESOURCES_DIR/zh-Hans.lproj" "$RESOURCES_DIR/zh_CN.lproj" "$RESOURCES_DIR/en.lproj"
cat << 'STRINGS_ZH' > "$RESOURCES_DIR/zh-Hans.lproj/InfoPlist.strings"
CFBundleDisplayName = "片刻";
CFBundleName = "片刻";
STRINGS_ZH
cat << 'STRINGS_ZH_CN' > "$RESOURCES_DIR/zh_CN.lproj/InfoPlist.strings"
CFBundleDisplayName = "片刻";
CFBundleName = "片刻";
STRINGS_ZH_CN
cat << 'STRINGS_EN' > "$RESOURCES_DIR/en.lproj/InfoPlist.strings"
CFBundleDisplayName = "Take Five";
CFBundleName = "Take Five";
STRINGS_EN

# 3. 自动生成 AppIcon.icns
if [ -f "assets/icon.png" ] && command -v sips >/dev/null 2>&1 && command -v iconutil >/dev/null 2>&1; then
  echo "生成 AppIcon.icns 图标集..."
  ICONSET_DIR="$(mktemp -d -t takefive_iconset_XXXXXX)"
  mkdir -p "$ICONSET_DIR/AppIcon.iconset"
  sips -z 16 16     assets/icon.png --out "$ICONSET_DIR/AppIcon.iconset/icon_16x16.png" >/dev/null 2>&1 || true
  sips -z 32 32     assets/icon.png --out "$ICONSET_DIR/AppIcon.iconset/icon_16x16@2x.png" >/dev/null 2>&1 || true
  sips -z 32 32     assets/icon.png --out "$ICONSET_DIR/AppIcon.iconset/icon_32x32.png" >/dev/null 2>&1 || true
  sips -z 64 64     assets/icon.png --out "$ICONSET_DIR/AppIcon.iconset/icon_32x32@2x.png" >/dev/null 2>&1 || true
  sips -z 128 128   assets/icon.png --out "$ICONSET_DIR/AppIcon.iconset/icon_128x128.png" >/dev/null 2>&1 || true
  sips -z 256 256   assets/icon.png --out "$ICONSET_DIR/AppIcon.iconset/icon_128x128@2x.png" >/dev/null 2>&1 || true
  sips -z 256 256   assets/icon.png --out "$ICONSET_DIR/AppIcon.iconset/icon_256x256.png" >/dev/null 2>&1 || true
  sips -z 512 512   assets/icon.png --out "$ICONSET_DIR/AppIcon.iconset/icon_256x256@2x.png" >/dev/null 2>&1 || true
  sips -z 512 512   assets/icon.png --out "$ICONSET_DIR/AppIcon.iconset/icon_512x512.png" >/dev/null 2>&1 || true
  sips -z 1024 1024 assets/icon.png --out "$ICONSET_DIR/AppIcon.iconset/icon_512x512@2x.png" >/dev/null 2>&1 || true
  iconutil -c icns "$ICONSET_DIR/AppIcon.iconset" -o "$RESOURCES_DIR/AppIcon.icns" >/dev/null 2>&1 || true
  rm -rf "$ICONSET_DIR"
fi

# 4. 内嵌独立 Node.js 运行时与核心代码
echo "内嵌独立运行时至 Take Five.app/Contents/Resources/runtime/ ..."
NODE_BIN=$(command -v node || which node || true)
if [ -n "$NODE_BIN" ] && [ -f "$NODE_BIN" ]; then
  cp "$NODE_BIN" "$RUNTIME_DIR/bin/node"
  ln -sf bin/node "$RUNTIME_DIR/node"
  chmod +x "$RUNTIME_DIR/bin/node"

  echo "对内嵌 Node.js 运行时执行符号表裁剪 (strip -u -r)..."
  strip -u -r "$RUNTIME_DIR/bin/node" || true
  if command -v codesign >/dev/null 2>&1; then
    codesign -s - --force "$RUNTIME_DIR/bin/node" 2>/dev/null || true
  fi
fi

cp -R dist/* "$RUNTIME_DIR/dist/"
rm -rf "$RUNTIME_DIR/dist/win-x64" "$RUNTIME_DIR/dist/win-arm64" "$RUNTIME_DIR/dist/"*.app
rm -f "$RUNTIME_DIR/dist/"*.exe "$RUNTIME_DIR/dist/"*.pdb "$RUNTIME_DIR/dist/"*.map "$RUNTIME_DIR/dist/TakeFive" "$RUNTIME_DIR/dist/TakeFiveMenuBar"
cp package.json "$RUNTIME_DIR/"
[ -d "assets" ] && cp -R assets "$RUNTIME_DIR/"
[ -d "assets" ] && cp -R assets "$RESOURCES_DIR/"
[ -d "assets" ] && cp -R assets/* "$RESOURCES_DIR/"
[ -d "skills" ] && cp -R skills "$RUNTIME_DIR/"

# 5. 生成内嵌的 takefive CLI 包装器
cat << 'WRAP_EOF' > "$RUNTIME_DIR/bin/takefive"
#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$(cd "$DIR/.." && pwd)"
if [ -x "$RUNTIME_DIR/bin/node" ]; then
  NODE_EXEC="$RUNTIME_DIR/bin/node"
elif [ -x "$RUNTIME_DIR/node" ]; then
  NODE_EXEC="$RUNTIME_DIR/node"
else
  NODE_EXEC="node"
fi
exec "$NODE_EXEC" "$RUNTIME_DIR/dist/cli.js" "$@"
WRAP_EOF
chmod +x "$RUNTIME_DIR/bin/takefive"

# 对应用 Bundle 执行深层签名 (ad-hoc)
if command -v codesign >/dev/null 2>&1; then
  echo "为片刻.app 应用程序包执行深层签名 (ad-hoc)..."
  codesign --force --deep --sign - "$APP_DIR" 2>/dev/null || true
fi

echo "=== 3. 准备 DMG 拖拽安装布局 ==="

# 保存生成的 .app 至 dist/ 目录，便于本地免挂载调试与自动化检验
rm -rf "$PROJECT_ROOT/dist/${APP_NAME}.app"
cp -R "$APP_DIR" "$PROJECT_ROOT/dist/${APP_NAME}.app"

# 创建 /Applications 软链接，纯净单 App 拖拽安装
ln -s /Applications "$BUILD_DIR/Applications"

echo "=== 4. 制作 macOS DMG 镜像: $DMG_NAME ==="
rm -f "$PROJECT_ROOT/$DMG_NAME"
hdiutil create -volname "片刻" -srcfolder "$BUILD_DIR" -ov -format UDZO "$PROJECT_ROOT/$DMG_NAME"

rm -rf "$BUILD_DIR"

echo "=== 5. 打包完成 ==="
ls -lh "$PROJECT_ROOT/$DMG_NAME"
