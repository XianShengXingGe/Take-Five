import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function readDirConcatenated(dir: string, ext: string): string {
  if (!existsSync(dir)) return '';
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => readFileSync(join(dir, f), 'utf-8'))
    .join('\n');
}

describe('Packaging Pipelines & Dual-Platform Verification (Ticket 08 / v0.6.0)', () => {
  const rootDir = process.cwd();

  describe('macOS Packaging Pipeline (scripts/build-dmg.sh)', () => {
    const buildDmgPath = join(rootDir, 'scripts', 'build-dmg.sh');

    it('verifies scripts/build-dmg.sh exists and is executable', () => {
      expect(existsSync(buildDmgPath)).toBe(true);
      const stat = statSync(buildDmgPath);
      expect((stat.mode & 0o111) !== 0).toBe(true);
    });

    it('ensures build-dmg.sh copies assets to root Resources, nested assets/, and runtime/assets/', () => {
      const content = readFileSync(buildDmgPath, 'utf-8');

      // Verifies copying into RUNTIME_DIR, RESOURCES_DIR, and flattening into RESOURCES_DIR root
      expect(content).toContain('cp -R assets "$RUNTIME_DIR/"');
      expect(content).toContain('cp -R assets "$RESOURCES_DIR/"');
      expect(content).toContain('cp -R assets/* "$RESOURCES_DIR/"');
    });

    it('ensures Info.plist and AppIcon.icns generation contracts in build-dmg.sh', () => {
      const content = readFileSync(buildDmgPath, 'utf-8');

      // Standard bundle identifier and names
      expect(content).toContain('com.takefive.desktop');
      expect(content).toContain('CFBundleDisplayName');
      expect(content).toContain('片刻');
      expect(content).toContain('AppIcon');

      // High-resolution icon generation
      expect(content).toContain('iconutil -c icns');
      expect(content).toContain('sips -z 1024 1024');

      // Embedded runtime structure
      expect(content).toContain('Contents/Resources/runtime');
      expect(content).toContain('bin/takefive');
      expect(content).toContain('dist/*');

      // DMG drag and drop
      expect(content).toContain('ln -s /Applications');
      expect(content).toContain('hdiutil create');
      expect(content).toContain('TakeFive-v${VERSION}-macOS.dmg');
      expect(content).not.toMatch(/cp\s+-f\s+["']\$PROJECT_ROOT\/\$DMG_NAME["']/);

      // LSUIElement for pure menu bar accessory
      expect(content).toContain('<key>LSUIElement</key>');
      expect(content).toContain('<true/>');
    });

    it('specifies pure arm64 architecture for Swift compilation in build-dmg.sh', () => {
      const content = readFileSync(buildDmgPath, 'utf-8');
      expect(content).toContain('-target arm64-apple-macos12.0');
    });

    it('strips debugging symbols from embedded Node.js binary and applies ad-hoc codesign in build-dmg.sh', () => {
      const content = readFileSync(buildDmgPath, 'utf-8');
      expect(content).toContain('strip -u -r "$RUNTIME_DIR/bin/node"');
      expect(content).toContain('codesign -s - --force "$RUNTIME_DIR/bin/node"');
    });

    it('cleans redundant executables, windows binaries, and duplicate bundles in build-dmg.sh', () => {
      const content = readFileSync(buildDmgPath, 'utf-8');
      expect(content).toContain('rm -rf "$RUNTIME_DIR/dist/win-x64" "$RUNTIME_DIR/dist/win-arm64" "$RUNTIME_DIR/dist/"*.app');
      expect(content).toContain('rm -f "$RUNTIME_DIR/dist/"*.exe "$RUNTIME_DIR/dist/"*.pdb "$RUNTIME_DIR/dist/"*.map "$RUNTIME_DIR/dist/TakeFive" "$RUNTIME_DIR/dist/TakeFiveMenuBar"');
    });

    it('performs ad-hoc deep code signing on the application bundle in build-dmg.sh', () => {
      const content = readFileSync(buildDmgPath, 'utf-8');
      expect(content).toContain('codesign --force --deep --sign - "$APP_DIR"');
    });

    it('uses UDZO format compression when generating DMG image in build-dmg.sh', () => {
      const content = readFileSync(buildDmgPath, 'utf-8');
      expect(content).toContain('-format UDZO');
    });
  });

  describe('Windows Packaging Pipeline (build-windows.ps1 & build-windows.sh)', () => {
    const buildWinPs1 = join(rootDir, 'scripts', 'build-windows.ps1');
    const buildWinSh = join(rootDir, 'scripts', 'build-windows.sh');

    it('verifies scripts/build-windows.ps1 and scripts/build-windows.sh exist and shell script is executable', () => {
      expect(existsSync(buildWinPs1)).toBe(true);
      expect(existsSync(buildWinSh)).toBe(true);
      const stat = statSync(buildWinSh);
      expect((stat.mode & 0o111) !== 0).toBe(true);
    });

    it('ensures Windows packaging scripts configure dual-architecture compilation (win-x64 & win-arm64)', () => {
      const psContent = readFileSync(buildWinPs1, 'utf-8');
      const shContent = readFileSync(buildWinSh, 'utf-8');

      expect(psContent).toContain("'win-x64'");
      expect(psContent).toContain("'win-arm64'");
      expect(shContent).toContain('"win-x64"');
      expect(shContent).toContain('"win-arm64"');
    });

    it('ensures single-file compilation, native library bundling, and debug symbol stripping in Windows build scripts', () => {
      const psContent = readFileSync(buildWinPs1, 'utf-8');
      const shContent = readFileSync(buildWinSh, 'utf-8');

      // PowerShell script compression flags
      expect(psContent).toContain('-p:PublishSingleFile=true');
      expect(psContent).toContain('-p:EnableCompressionInSingleFile=true');
      expect(psContent).toContain('-p:IncludeNativeLibrariesForSelfExtract=true');
      expect(psContent).toContain('-p:DebugType=none');
      expect(psContent).toContain('-p:DebugSymbols=false');

      // Bash script compression flags
      expect(shContent).toContain('-p:PublishSingleFile=true');
      expect(shContent).toContain('-p:EnableCompressionInSingleFile=true');
      expect(shContent).toContain('-p:IncludeNativeLibrariesForSelfExtract=true');
      expect(shContent).toContain('-p:DebugType=none');
      expect(shContent).toContain('-p:DebugSymbols=false');
    });

    it('ensures packages assets to AppFolder and RuntimeDir without redundant bundle', () => {
      const psContent = readFileSync(buildWinPs1, 'utf-8');
      const shContent = readFileSync(buildWinSh, 'utf-8');

      expect(psContent).toContain("Copy-Item -Recurse -Force (Join-Path $ProjectRoot 'assets') $RuntimeDir");
      expect(psContent).toContain("Copy-Item -Recurse -Force (Join-Path $ProjectRoot 'assets') $AppFolder");
      expect(psContent).not.toContain('.takefive_bundle');

      expect(shContent).toContain('cp -R assets "$RUNTIME_DIR/"');
      expect(shContent).toContain('cp -R assets "$APP_FOLDER/"');
      expect(shContent).not.toContain('.takefive_bundle');
    });

    it('ensures dual-architecture zip naming and node.exe embedding contracts', () => {
      const psContent = readFileSync(buildWinPs1, 'utf-8');
      const shContent = readFileSync(buildWinSh, 'utf-8');

      // PS1 dual arch naming & node embedding (Plan A: exactly 2 architecture packages, no redundant copies)
      expect(psContent).toContain('TakeFive-v$Version-$Arch.zip');
      expect(psContent).not.toContain('TakeFive-v$Version-Windows.zip');
      expect(psContent).toContain('https://nodejs.org/dist/v20.18.0/$Arch/node.exe');

      // Shell dual arch naming & node embedding (Plan A: exactly 2 architecture packages, no redundant copies)
      expect(shContent).toContain('TakeFive-v${VERSION}-${ARCH}.zip');
      expect(shContent).not.toContain('TakeFive-v${VERSION}-Windows.zip');
      expect(shContent).toContain('https://nodejs.org/dist/v20.18.0/${ARCH}/node.exe');

      // Launcher scripts in both
      expect(psContent).toContain('Install Take Five.cmd');
      expect(psContent).toContain('Manage Take Five.cmd');
      expect(shContent).toContain('Install Take Five.cmd');
      expect(shContent).toContain('Manage Take Five.cmd');
    });

    it('ensures embedded runtime cleans extraneous binaries and debugging symbols', () => {
      const psContent = readFileSync(buildWinPs1, 'utf-8');
      const shContent = readFileSync(buildWinSh, 'utf-8');

      expect(psContent).toContain("Remove-Item -Recurse -Force -ErrorAction SilentlyContinue");
      expect(shContent).toContain('rm -rf "$RUNTIME_DIR/dist/win-x64" "$RUNTIME_DIR/dist/win-arm64"');
      expect(shContent).toContain('rm -f "$RUNTIME_DIR/dist/"*.exe "$RUNTIME_DIR/dist/"*.pdb "$RUNTIME_DIR/dist/"*.map');
    });
  });

  describe('Asset Files Integrity & Completeness', () => {
    const jpegMagic = Buffer.from([0xff, 0xd8, 0xff]);
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    it('verifies all required branding and donation assets exist with valid format magic bytes', () => {
      const requiredAssets = [
        { file: 'alipay_qr.jpg', magic: jpegMagic, minSize: 10000 },
        { file: 'wechat_qr.jpg', magic: jpegMagic, minSize: 10000 },
        { file: 'antigravity.png', magic: pngMagic, minSize: 10000 },
        { file: 'claude.png', magic: pngMagic, minSize: 10000 },
        { file: 'codex.png', magic: pngMagic, minSize: 10000 },
        { file: 'opencode.png', magic: pngMagic, minSize: 10000 },
        { file: 'icon.png', magic: pngMagic, minSize: 500000 },
      ];

      for (const item of requiredAssets) {
        const filePath = join(rootDir, 'assets', item.file);
        expect(existsSync(filePath), `assets/${item.file} should exist`).toBe(true);
        const buf = readFileSync(filePath);
        expect(buf.length).toBeGreaterThan(item.minSize);
        expect(buf.subarray(0, item.magic.length).equals(item.magic), `${item.file} magic header mismatch`).toBe(true);
      }
    });

    it('verifies icons subfolder contains all 4 coding agent brand icons', () => {
      const iconsDir = join(rootDir, 'assets', 'icons');
      expect(existsSync(iconsDir)).toBe(true);

      const agentFiles = ['antigravity.png', 'claude.png', 'codex.png', 'opencode.png'];
      for (const name of agentFiles) {
        const p = join(iconsDir, name);
        expect(existsSync(p), `assets/icons/${name} should exist`).toBe(true);
      }
    });
  });

  describe('Dual-Platform Architectural Parity (macOS Swift vs Windows C#)', () => {
    const swiftContent = readDirConcatenated(join(rootDir, 'src', 'desktop', 'macos'), '.swift');
    const csContent = readDirConcatenated(join(rootDir, 'src', 'desktop', 'windows'), '.cs');

    it('implements mathematical absolute centering in top bar on both platforms', () => {
      // macOS: ZStack with mathematical centering and traffic light clearance
      expect(swiftContent).toContain('ZStack {');
      expect(swiftContent).toContain('Spacer()');
      expect(swiftContent).toContain('Spacer().frame(width: 68)');
      expect(swiftContent).toContain('L10n.tr("app.name", lang: lang)');

      // Windows: HeaderPanel mathematical centering calculation (headerPanel.Width - totalW) / 2
      expect(csContent).toContain('headerPanel');
      expect(csContent).toContain('titleLabel');
      expect(csContent).toContain('headerPanel.Width');
      expect(csContent).toContain('totalW');
    });

    it('implements interactive GitHub release link on version pill on both platforms', () => {
      // macOS
      expect(swiftContent).toContain('header.visit_github');
      expect(swiftContent).toContain('https://github.com/XianShengXingGe/Take-Five');
      expect(swiftContent).toContain('NSCursor.pointingHand');

      // Windows
      expect(csContent).toContain('header.visit_github');
      expect(csContent).toContain('https://github.com/XianShengXingGe/Take-Five');
      expect(csContent).toContain('Cursors.Hand');
    });

    it('implements official agent brand icons loading with fallback on both platforms', () => {
      // macOS
      expect(swiftContent).toContain('loadAssetImage');
      expect(swiftContent).toContain('antigravity');
      expect(swiftContent).toContain('claude');
      expect(swiftContent).toContain('codex');
      expect(swiftContent).toContain('opencode');

      // Windows
      expect(csContent).toContain('GetAgentBitmap');
      expect(csContent).toContain('ColorMatrix');
      expect(csContent).toContain('antigravity');
      expect(csContent).toContain('claude');
      expect(csContent).toContain('codex');
      expect(csContent).toContain('opencode');
    });

    it('implements segmented priority controls and clean rule descriptions on both platforms', () => {
      // macOS
      expect(swiftContent).toContain('rules.title');
      expect(swiftContent).toContain('rules.description');
      expect(swiftContent).toContain('rules.level_active');
      expect(swiftContent).toContain('rules.level_timeSensitive');
      expect(swiftContent).toContain('updateEventRule');

      // Windows
      expect(csContent).toContain('rules.title');
      expect(csContent).toContain('rules.description');
      expect(csContent).toContain('rules.level_active');
      expect(csContent).toContain('rules.level_timeSensitive');
      expect(csContent).toContain('UpdateEventRule');
    });

    it('implements in-card onboarding wizard and language switcher on both platforms', () => {
      // macOS
      expect(swiftContent).toContain('onboarding');
      expect(swiftContent).toContain('activeLanguage');
      expect(swiftContent).toContain('LanguageSegmentedControl');

      // Windows
      expect(csContent).toContain('onboardingView');
      expect(csContent).toContain('RenderOnboardingView');
      expect(csContent).toContain('langComboBox');
      expect(csContent).toContain('SetLanguage');
    });

    it('implements Alipay and WeChat donation modal with tab switching on both platforms', () => {
      // macOS
      expect(swiftContent).toContain('showDonationModal');
      expect(swiftContent).toContain('donationChannel');
      expect(swiftContent).toContain('channel: "alipay"');
      expect(swiftContent).toContain('channel: "wechat"');
      expect(swiftContent).toContain('"\\(state.donationChannel)_qr.jpg"');

      // Windows
      expect(csContent).toContain('GetQrBitmap');
      expect(csContent).toContain('activeChannel');
      expect(csContent).toContain('"alipay"');
      expect(csContent).toContain('"wechat"');
      expect(csContent).toContain('"_qr.jpg"');
    });

    it('implements embedded standalone runtime priority and async CLI execution on both platforms', () => {
      // macOS
      expect(swiftContent).toContain('embeddedRuntimeDir');
      expect(swiftContent).toContain('embeddedNodePath');
      expect(swiftContent).toContain('runCli');
      expect(swiftContent).toContain('DispatchQueue.global');

      // Windows
      expect(csContent).toContain('GetEmbeddedRuntimeDir');
      expect(csContent).toContain('GetEmbeddedNodePath');
      expect(csContent).toContain('RunCli');
    });
  });

  describe('Distribution Artifacts Verification', () => {
    it('verifies generated v0.6.0 DMG file exists in project root with valid size', () => {
      const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
      const dmgPath = join(rootDir, `TakeFive-v${pkg.version}-macOS.dmg`);
      expect(existsSync(dmgPath), `Release DMG file for v${pkg.version} should exist`).toBe(true);
      const stat = statSync(dmgPath);
      expect(stat.size).toBeGreaterThan(30 * 1024 * 1024); // Standalone DMG is ~45-95MB
      expect(stat.size).toBeLessThan(120 * 1024 * 1024);
    });

    it('verifies dist/TakeFive executable exists and was compiled for pure arm64', () => {
      const execPath = join(rootDir, 'dist', 'TakeFive');
      expect(existsSync(execPath), 'dist/TakeFive executable should exist').toBe(true);
      const stat = statSync(execPath);
      expect(stat.size).toBeGreaterThan(500 * 1024);
      expect((stat.mode & 0o111) !== 0).toBe(true);

      if (process.platform === 'darwin') {
        const { execSync } = require('node:child_process');
        const fileOut = execSync(`file "${execPath}"`, { encoding: 'utf-8' });
        expect(fileOut).toContain('arm64');
      }
    });

    it('verifies generated .app and Info.plist contains LSUIElement = true when built', () => {
      const plistPath = join(rootDir, 'dist', '片刻.app', 'Contents', 'Info.plist');
      if (existsSync(plistPath)) {
        const plistContent = readFileSync(plistPath, 'utf-8');
        expect(plistContent).toContain('<key>LSUIElement</key>');
        expect(plistContent).toMatch(/<key>LSUIElement<\/key>\s*<true\/>/);
      }
    });

    it('verifies generated Windows dual-architecture release zips exist and adhere to contract', () => {
      const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
      const requiredZips = [
        `TakeFive-v${pkg.version}-win-x64.zip`,
        `TakeFive-v${pkg.version}-win-arm64.zip`,
      ];

      const redundantZips = [
        `TakeFive-${pkg.version}-Windows.zip`,
        `TakeFive-v${pkg.version}-Windows.zip`,
        `TakeFive-${pkg.version}-win-x64.zip`,
        `TakeFive-${pkg.version}-win-arm64.zip`,
      ];

      for (const redundant of redundantZips) {
        expect(existsSync(join(rootDir, redundant)), `${redundant} should not exist under Plan A clean packaging`).toBe(false);
      }

      for (const zipName of requiredZips) {
        const zipPath = join(rootDir, zipName);
        expect(existsSync(zipPath), `${zipName} should exist in project root`).toBe(true);
        const stat = statSync(zipPath);
        expect(stat.size).toBeGreaterThan(50 * 1024 * 1024); // Each standalone zip is ~90MB-100MB

        if (process.platform === 'darwin' || process.platform === 'linux') {
          const { execSync } = require('node:child_process');
          const list = execSync(`unzip -l "${zipPath}"`, { encoding: 'utf-8' });
          expect(list).toContain('TakeFive/TakeFive.exe');
          expect(list).toContain('Install Take Five.cmd');
          expect(list).toContain('Manage Take Five.cmd');
          expect(list).toContain('TakeFive/runtime/dist/cli.js');
          expect(list).toContain('README.txt');
        }
      }

      // Exact binary architecture verification via file command
      if (process.platform === 'darwin' || process.platform === 'linux') {
        const { execSync } = require('node:child_process');
        const arm64Zip = join(rootDir, `TakeFive-v${pkg.version}-win-arm64.zip`);
        const x64Zip = join(rootDir, `TakeFive-v${pkg.version}-win-x64.zip`);

        const arm64Arch = execSync(`unzip -p "${arm64Zip}" "TakeFive/TakeFive.exe" | file -`, { encoding: 'utf-8' });
        expect(arm64Arch).toContain('Aarch64');

        const x64Arch = execSync(`unzip -p "${x64Zip}" "TakeFive/TakeFive.exe" | file -`, { encoding: 'utf-8' });
        expect(x64Arch).toContain('x86-64');
      }

      const exePath = join(rootDir, 'TakeFive.exe');
      if (existsSync(exePath)) {
        const exeStat = statSync(exePath);
        expect(exeStat.size).toBeGreaterThan(5 * 1024 * 1024);
      }
    });
  });
});
