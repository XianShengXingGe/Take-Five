import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function readDirConcatenated(dir: string, ext: string): string {
  if (!existsSync(dir)) return '';
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => readFileSync(join(dir, f), 'utf-8'))
    .join('\n');
}

describe('Bug Repro: Bark Status Unconfigured & False Success on Test Push', () => {
  const swiftContent = readDirConcatenated(join(process.cwd(), 'src', 'desktop', 'macos'), '.swift');
  const winContent = readDirConcatenated(join(process.cwd(), 'src', 'desktop', 'windows'), '.cs');
  const trayCmdTestPath = join(process.cwd(), 'tests', 'tray-command.test.ts');

  it('macOS fallbackLocalConfigRead must read .credential when status --json is unavailable', () => {
    const content = swiftContent;
    // Currently fallbackLocalConfigRead ONLY reads configPath (config.json)
    // and never sets isBarkConfigured or barkEndpoint from .credential or Keychain!
    expect(content).toMatch(/fallbackLocalConfigRead[\s\S]*?\.credential/);
    expect(content).toMatch(/fallbackLocalConfigRead[\s\S]*?isBarkConfigured\s*=\s*true/);
  });

  it('macOS embeddedNodePath must support common macOS paths including ~/.local/node/bin and shell fallback', () => {
    const content = swiftContent;
    expect(content).toContain('.local/node/bin/node');
    expect(content).toContain('.local/bin/node');
  });

  it('macOS cliPath must include ~/.local/bin/takefive', () => {
    const content = swiftContent;
    expect(content).toContain('.local/bin/takefive');
  });

  it('macOS sendTestPush must verify runCli success and not blindly show success on failure', () => {
    const content = swiftContent;
    // Currently: _ = self?.runCli(args: ["test", "--quiet"]) followed unconditionally by "✅ 测试推送已成功发送！"
    // It must check whether runCli succeeded and show failure if failed!
    const sendTestSection = content.substring(content.indexOf('func sendTestPush()'), content.indexOf('func sendTestPush()') + 1200);
    expect(sendTestSection).not.toMatch(/_\s*=\s*self\?\.runCli/);
    expect(sendTestSection).toMatch(/失败|Failed|error/i);
  });

  it('Windows FallbackConfigRead must read .credential instead of only config.json', () => {
    const content = winContent;
    const fallbackSection = content.substring(content.indexOf('void FallbackConfigRead()'), content.indexOf('void FallbackConfigRead()') + 600);
    expect(fallbackSection).toContain('.credential');
  });

  it('tests/tray-command.test.ts must clean up any spawned tray process to avoid leaking detached daemons', () => {
    const content = readFileSync(trayCmdTestPath, 'utf-8');
    expect(content).toContain('stopTrayProcess');
  });
});
