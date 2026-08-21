#!/usr/bin/env bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "=== 1. 构建项目与打包 tarball ==="
pnpm run build
pnpm pack

VERSION=$(node -p "require('./package.json').version")
DMG_NAME="TakeFive-${VERSION}-macOS.dmg"
BUILD_DIR="$(mktemp -d -t takefive_dmg_XXXXXX)"

echo "=== 2. 准备 DMG 结构目录: $BUILD_DIR ==="

# 复制核心包到目标安装源
BUNDLE_DIR="$BUILD_DIR/.takefive_bundle"
mkdir -p "$BUNDLE_DIR"
cp -R dist package.json "$BUNDLE_DIR/"
[ -d "assets" ] && cp -R assets "$BUNDLE_DIR/"
[ -d "skills" ] && cp -R skills "$BUNDLE_DIR/"
[ -d "icon" ] && cp -R icon "$BUNDLE_DIR/"

# 在 bundle 目录安装生产依赖
cd "$BUNDLE_DIR"
npm install --omit=dev --ignore-scripts --no-package-lock
cd "$PROJECT_ROOT"

# 创建 1. 一键安装与配置 Take Five.command
cat << 'APP_EOF' > "$BUILD_DIR/一键安装 Take Five.command"
#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SOURCE_BUNDLE="$DIR/.takefive_bundle"
TARGET_DIR="$HOME/.takefive/app"
BIN_DIR="$HOME/.local/bin"

clear
echo "=================================================="
echo "    Take Five (片刻) - macOS 智能推送助手安装"
echo "=================================================="
echo ""

# 1. 检查 Node.js 环境
if ! command -v node >/dev/null 2>&1; then
  echo "❌ 错误: 未检测到 Node.js 环境。"
  echo "请先前往 https://nodejs.org 安装 Node.js (推荐 v18 及以上版本)。"
  echo ""
  read -p "按回车键退出..." _
  exit 1
fi

NODE_VER=$(node -v)
echo "✔ 检测到 Node.js 运行环境: $NODE_VER"

# 2. 安装应用程序到 ~/.takefive/app
echo "📦 正在复制 Take Five 运行时到 $TARGET_DIR ..."
mkdir -p "$TARGET_DIR" "$BIN_DIR"
rm -rf "$TARGET_DIR"/*
cp -R "$SOURCE_BUNDLE"/* "$TARGET_DIR/"
chmod +x "$TARGET_DIR/dist/cli.js"

# 同步本地图标到 ~/.takefive/icons
if [ -d "$TARGET_DIR/assets/icons" ]; then
  mkdir -p "$HOME/.takefive/icons"
  cp -R "$TARGET_DIR/assets/icons"/* "$HOME/.takefive/icons/" 2>/dev/null || true
fi

# 自动同步 takefive skill 到智能体技能目录
if [ -d "$TARGET_DIR/skills/takefive" ]; then
  if [ -d "$HOME/.cc-switch/skills" ]; then
    ln -sf "$TARGET_DIR/skills/takefive" "$HOME/.cc-switch/skills/takefive" 2>/dev/null || true
  fi
  mkdir -p "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.gemini/skills"
  ln -sf "$TARGET_DIR/skills/takefive" "$HOME/.claude/skills/takefive" 2>/dev/null || true
  ln -sf "$TARGET_DIR/skills/takefive" "$HOME/.codex/skills/takefive" 2>/dev/null || true
  ln -sf "$TARGET_DIR/skills/takefive" "$HOME/.gemini/skills/takefive" 2>/dev/null || true
fi

# 3. 创建可执行启动包装器 ~/.local/bin/takefive
WRAPPER="$BIN_DIR/takefive"
cat << 'WRAP_EOF' > "$WRAPPER"
#!/usr/bin/env bash
exec node "$HOME/.takefive/app/dist/cli.js" "$@"
WRAP_EOF
chmod +x "$WRAPPER"

# 4. 尝试软链接到 /usr/local/bin (如果可写)
if [ -d "/usr/local/bin" ] && [ -w "/usr/local/bin" ]; then
  ln -sf "$WRAPPER" "/usr/local/bin/takefive" 2>/dev/null || true
fi

# 5. 确保 ~/.local/bin 在 PATH 中
add_to_path() {
  local rc_file="$1"
  if [ -f "$rc_file" ]; then
    if ! grep -q '.local/bin' "$rc_file"; then
      echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$rc_file"
      echo "✔ 已添加 ~/.local/bin 到 $rc_file"
    fi
  else
    echo 'export PATH="$HOME/.local/bin:$PATH"' > "$rc_file"
  fi
}

add_to_path "$HOME/.zshrc"
add_to_path "$HOME/.bash_profile"

export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"

echo ""
echo "✔ Take Five CLI 已成功安装到系统！"
echo "  可执行文件: $WRAPPER"
echo ""
echo "=================================================="
echo "    正在启动交互式配置向导..."
echo "=================================================="
echo ""

# 启动配置向导
"$WRAPPER" install

echo ""
echo "=================================================="
echo "    ✨ 安装配置完成！"
echo "    日常可以在任意终端直接输入: takefive status"
echo "=================================================="
echo ""
read -p "按回车键关闭此窗口..." _
APP_EOF

chmod +x "$BUILD_DIR/一键安装 Take Five.command"

# 创建 2. 交互配置菜单.command
cat << 'CFG_EOF' > "$BUILD_DIR/配置与管理.command"
#!/usr/bin/env bash
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"
if command -v takefive >/dev/null 2>&1; then
  takefive config
elif [ -f "$HOME/.takefive/app/dist/cli.js" ]; then
  node "$HOME/.takefive/app/dist/cli.js" config
else
  echo "请先运行【一键安装 Take Five.command】"
  read -p "按回车键退出..." _
fi
CFG_EOF
chmod +x "$BUILD_DIR/配置与管理.command"

# 创建 3. 发送测试推送.command
cat << 'TEST_EOF' > "$BUILD_DIR/发送测试推送.command"
#!/usr/bin/env bash
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"
if command -v takefive >/dev/null 2>&1; then
  takefive test
elif [ -f "$HOME/.takefive/app/dist/cli.js" ]; then
  node "$HOME/.takefive/app/dist/cli.js" test
else
  echo "请先运行【一键安装 Take Five.command】"
  read -p "按回车键退出..." _
fi
echo ""
read -p "按回车键退出..." _
TEST_EOF
chmod +x "$BUILD_DIR/发送测试推送.command"

# 创建 4. 完全卸载.command
cat << 'UNINST_EOF' > "$BUILD_DIR/完全卸载.command"
#!/usr/bin/env bash
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"
if command -v takefive >/dev/null 2>&1; then
  takefive uninstall
elif [ -f "$HOME/.takefive/app/dist/cli.js" ]; then
  node "$HOME/.takefive/app/dist/cli.js" uninstall
else
  echo "Take Five 未安装。"
fi
echo ""
read -p "按回车键退出..." _
UNINST_EOF
chmod +x "$BUILD_DIR/完全卸载.command"

# 创建 5. 使用说明.txt
cat << 'README_EOF' > "$BUILD_DIR/使用说明.txt"
=====================================================
    Take Five (片刻) - Coding Agent 智能推送通知工具
=====================================================

【快速开始】
1. 双击运行【一键安装 Take Five.command】。
2. 按照终端屏幕提示输入你的 Bark 服务器地址或设备 Key（例如 https://api.day.app/YOUR_KEY/）。
3. 手机收到测试推送后即配置成功！

【日常使用】
在 macOS 任何终端中随时可以使用以下命令：
  takefive status        查看 Bark 推送状态与各 Agent Hook 状态
  takefive config        打开交互式配置菜单（修改规则/语言/去重等）
  takefive test          向手机发送测试推送
  takefive repair        自动扫描并修复失效的 Agent 钩子
  takefive uninstall     完全卸载并清除所有配置和钩子

【支持的 Coding Agents】
- Anthropic Claude Code (~/.claude/config.json)
- OpenAI Codex (~/.codex/config.json)
- OpenCode (~/.opencode/config.json)
- Google Antigravity (~/.gemini/config/hooks.json)

更多文档与支持请访问 GitHub 仓库。
README_EOF

# 复制 tarball
cp "takefive-${VERSION}.tgz" "$BUILD_DIR/"

echo "=== 3. 制作 macOS DMG 镜像: $DMG_NAME ==="
rm -f "$PROJECT_ROOT/$DMG_NAME"
hdiutil create -volname "Take Five" -srcfolder "$BUILD_DIR" -ov -format UDZO "$PROJECT_ROOT/$DMG_NAME"

rm -rf "$BUILD_DIR"

echo "=== 4. 打包完成 ==="
ls -lh "$PROJECT_ROOT/$DMG_NAME"
