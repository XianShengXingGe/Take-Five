import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

describe('Top Bar Mathematical Centering & GitHub Version Link (Ticket 02)', () => {
  const rootDir = process.cwd();
  const macosDir = join(rootDir, 'src', 'desktop', 'macos');
  const getSwiftSources = () =>
    readdirSync(macosDir)
      .filter((f) => f.endsWith('.swift'))
      .sort()
      .map((f) => join(macosDir, f));
  const readSwiftSource = () =>
    getSwiftSources()
      .map((p) => readFileSync(p, 'utf-8'))
      .join('\n');

  const windowsDir = join(rootDir, 'src', 'desktop', 'windows');
  const getCsSources = () =>
    readdirSync(windowsDir)
      .filter((f) => f.endsWith('.cs'))
      .sort()
      .map((f) => join(windowsDir, f));
  const readCsSource = () =>
    getCsSources()
      .map((p) => readFileSync(p, 'utf-8'))
      .join('\n');

  describe('macOS Native Implementation', () => {
    it('verifies macOS desktop sources exist', () => {
      expect(existsSync(macosDir)).toBe(true);
      expect(getSwiftSources().length).toBeGreaterThan(0);
    });

    it('implements ZStack with mathematical absolute centering (HStack { Spacer(); TitleAndVersion(); Spacer(); })', () => {
      const content = readSwiftSource();

      // Top bar ZStack container
      expect(content).toContain('ZStack {');
      expect(content).toContain('Spacer()');
      expect(content).toContain('Image(systemName: "bell.badge.fill")');
      expect(content).toContain('L10n.tr("app.name", lang: lang)');

      // Left traffic light clearance of 68pt and empty right
      expect(content).toContain('Spacer().frame(width: 68)');
    });

    it('ensures top bar is clean with no refresh or configuration wizard buttons', () => {
      const content = readSwiftSource();

      // Extract the header bar ZStack section before ScrollView
      const headerStartIndex = content.indexOf('// Header Bar with Window Dragging Space & Traffic Light Clearance');
      expect(headerStartIndex).toBeGreaterThan(-1);

      const scrollViewIndex = content.indexOf('ScrollView(.vertical', headerStartIndex);
      expect(scrollViewIndex).toBeGreaterThan(-1);

      const headerSlice = content.slice(headerStartIndex, scrollViewIndex);

      // Verify no refresh or wizard buttons inside the top bar
      expect(headerSlice).not.toContain('onRefresh');
      expect(headerSlice).not.toContain('arrow.clockwise');
      expect(headerSlice).not.toContain('onOpenOnboarding');
      expect(headerSlice).not.toContain('向导');
    });

    it('renders high-contrast capsule version badge with pointingHand cursor and visit_github tooltip', () => {
      const content = readSwiftSource();

      // Capsule shape with background and border stroke overlay
      expect(content).toContain('Capsule().fill(');
      expect(content).toContain('Capsule().stroke(');

      // Pointing hand cursor on hover
      expect(content).toContain('NSCursor.pointingHand.push()');
      expect(content).toContain('NSCursor.pop()');

      // Tooltip localization key
      expect(content).toContain('L10n.tr("header.visit_github", lang: lang)');
    });

    it('opens official GitHub repository via safe Cocoa NSWorkspace API on click', () => {
      const content = readSwiftSource();

      expect(content).toContain('https://github.com/XianShengXingGe/Take-Five');
      expect(content).toContain('NSWorkspace.shared.open(url)');
    });

    it('strictly isolates app title to "片刻" in zh and "Take Five" in en', () => {
      const content = readSwiftSource();

      expect(content).toContain('case "app.name": return zh ? "片刻" : "Take Five"');
    });

    it('compiles modular macOS sources with swiftc without any syntax or type errors', () => {
      if (process.platform !== 'darwin' || !existsSync('/usr/bin/swiftc')) return;

      const outBin = join(tmpdir(), `takefive_topbar_test_${Date.now()}`);
      const envWithTools = {
        ...process.env,
        PATH: `/usr/bin:/bin:/usr/sbin:/sbin:/Library/Developer/CommandLineTools/usr/bin:${process.env.PATH || ''}`,
      };

      execFileSync('/usr/bin/swiftc', ['-O', ...getSwiftSources(), '-o', outBin], {
        env: envWithTools,
        stdio: 'pipe',
        timeout: 30000,
      });

      expect(existsSync(outBin)).toBe(true);
      try {
        require('node:fs').unlinkSync(outBin);
      } catch {}
    }, 30000);
  });

  describe('Windows Native Implementation', () => {
    it('verifies Windows desktop sources exist', () => {
      expect(existsSync(windowsDir)).toBe(true);
      expect(getCsSources().length).toBeGreaterThan(0);
    });

    it('implements FluentVersionBadge capsule control with rounded rectangle path and hand cursor', () => {
      const content = readCsSource();

      expect(content).toContain('class FluentVersionBadge : Control');
      expect(content).toContain('Cursors.Hand');
      expect(content).toContain('FluentTheme.CreateRoundedRectangle');
      expect(content).toContain('Color.FromArgb');
    });

    it('calculates mathematical horizontal absolute centering across headerPanel width', () => {
      const content = readCsSource();

      expect(content).toContain('void CenterHeaderTitle()');
      expect(content).toContain('(headerPanel.Width - totalW) / 2');
      expect(content).toContain('headerPanel.Resize += (s, e) => CenterHeaderTitle()');
    });

    it('opens official GitHub repository via safe ProcessStartInfo on click', () => {
      const content = readCsSource();

      expect(content).toContain('https://github.com/XianShengXingGe/Take-Five');
      expect(content).toContain('UseShellExecute = true');
    });

    it('wires visit_github tooltip and strictly isolates app title', () => {
      const content = readCsSource();

      expect(content).toContain('case "app.name": return zh ? "片刻" : "Take Five";');
      expect(content).toContain('case "header.visit_github": return zh ? "访问 GitHub 开源项目" : "Visit GitHub Repository";');
      expect(content).toContain('headerToolTip.SetToolTip(versionBadge, L10n.Tr("header.visit_github", lang));');
    });

    it('keeps top bar clean without refresh or configuration wizard buttons', () => {
      const content = readCsSource();

      const buildChromeIndex = content.indexOf('void BuildWindowChrome()');
      expect(buildChromeIndex).toBeGreaterThan(-1);

      const centerTitleIndex = content.indexOf('void CenterHeaderTitle()', buildChromeIndex);
      expect(centerTitleIndex).toBeGreaterThan(-1);

      const chromeSlice = content.slice(buildChromeIndex, centerTitleIndex);

      expect(chromeSlice).not.toContain('Refresh');
      expect(chromeSlice).not.toContain('Onboarding');
      expect(chromeSlice).not.toContain('Wizard');
      expect(chromeSlice).not.toContain('向导');
    });
  });
});
