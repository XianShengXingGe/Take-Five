import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

function readDirConcatenated(dir: string, ext: string): string {
  if (!existsSync(dir)) return '';
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => readFileSync(join(dir, f), 'utf-8'))
    .join('\n');
}

describe('Official Brand Icons for Coding Agents (Ticket 03)', () => {
  const rootDir = process.cwd();
  const agents = ['codex', 'antigravity', 'claude', 'opencode'];

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

  const readCsSource = () => readDirConcatenated(join(rootDir, 'src', 'desktop', 'windows'), '.cs');

  describe('Asset Directory Specification', () => {
    it('contains valid high-definition PNG icons in assets/ for all 4 agents', () => {
      const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      for (const agent of agents) {
        const filePath = join(rootDir, 'assets', `${agent}.png`);
        expect(existsSync(filePath), `assets/${agent}.png should exist`).toBe(true);

        const buf = readFileSync(filePath);
        expect(buf.length).toBeGreaterThan(10000);
        expect(buf.subarray(0, 8).equals(pngMagic), `${agent}.png should be a valid PNG`).toBe(true);
      }
    });

    it('maintains compatibility with assets/icons/ directory', () => {
      for (const agent of agents) {
        const filePath = join(rootDir, 'assets', 'icons', `${agent}.png`);
        expect(existsSync(filePath), `assets/icons/${agent}.png should exist`).toBe(true);
      }
    });
  });

  describe('macOS Native Implementation', () => {
    it('renders official brand icons with 24x24pt, 6pt corner radius, and 1px stroke in AgentIconView', () => {
      const content = readSwiftSource();

      expect(content).toContain('struct AgentIconView: View');
      expect(content).toContain('var isDetected: Bool = true');
      expect(content).toContain('.frame(width: 24, height: 24)');
      expect(content).toContain('RoundedRectangle(cornerRadius: 6, style: .continuous)');
      expect(content).toContain('lineWidth: 1.0');
    });

    it('applies smooth grayscale and adjusted opacity for undetected/uninstalled agents', () => {
      const content = readSwiftSource();

      expect(content).toContain('.grayscale(isDetected ? 0.0 : 1.0)');
      expect(content).toContain('.opacity(isDetected ? 1.0 : 0.55)');
      expect(content).toContain('AgentIconView(id: agent.id, isDetected: agent.detected || agent.installed)');
    });

    it('compiles modular macOS sources with swiftc without errors', () => {
      if (process.platform !== 'darwin' || !existsSync('/usr/bin/swiftc')) return;

      const outBin = join(tmpdir(), `takefive_brand_icons_test_${Date.now()}`);
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
    it('implements GetAgentBitmap with candidate resolution for assets and assets/icons', () => {
      const content = readCsSource();

      expect(content).toContain('public Bitmap GetAgentBitmap(string agentId, bool detected = true)');
      expect(content).toContain('public Bitmap GetAgentBitmap(string agentId)');
      expect(content).toContain('Path.Combine(baseDir, "assets", fileName)');
      expect(content).toContain('Path.Combine(baseDir, "assets", "icons", fileName)');
    });

    it('applies GDI+ ColorMatrix grayscale transformation when agent is not detected', () => {
      const content = readCsSource();

      expect(content).toContain('using System.Drawing.Imaging;');
      expect(content).toContain('ColorMatrix');
      expect(content).toContain('0.299f');
      expect(content).toContain('0.587f');
      expect(content).toContain('0.114f');
      expect(content).toContain('ImageAttributes');
      expect(content).toContain('ia.SetColorMatrix(matrix)');
      expect(content).toContain('appController.GetAgentBitmap(agent.Id, detected)');
    });
  });

  describe('Packaging Pipelines Asset Bundling', () => {
    it('bundles assets directory in scripts/build-dmg.sh', () => {
      const content = readFileSync(join(rootDir, 'scripts', 'build-dmg.sh'), 'utf-8');
      expect(content).toContain('[ -d "assets" ] && cp -R assets "$RUNTIME_DIR/"');
      expect(content).toContain('[ -d "assets" ] && cp -R assets "$RESOURCES_DIR/"');
    });

    it('bundles assets directory in scripts/build-windows.ps1', () => {
      const content = readFileSync(join(rootDir, 'scripts', 'build-windows.ps1'), 'utf-8');
      expect(content).toContain("Copy-Item -Recurse -Force (Join-Path $ProjectRoot 'assets') $RuntimeDir");
      expect(content).toContain("Copy-Item -Recurse -Force (Join-Path $ProjectRoot 'assets') $AppFolder");
    });
  });
});
