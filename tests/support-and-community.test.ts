import { describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { zhCN } from '../src/i18n/locales/zh-CN.js';
import { en } from '../src/i18n/locales/en.js';

describe('Support & Community Module with Alipay/WeChat Donation Modal (Ticket 06)', () => {
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

  describe('Payment QR Assets Specification', () => {
    const jpegMagic = Buffer.from([0xff, 0xd8, 0xff]);

    it('contains valid high-resolution JPEG QR codes for Alipay and WeChat in assets/', () => {
      const qrFiles = ['alipay_qr.jpg', 'wechat_qr.jpg'];

      for (const file of qrFiles) {
        const filePath = join(rootDir, 'assets', file);
        expect(existsSync(filePath), `assets/${file} should exist`).toBe(true);

        const buf = readFileSync(filePath);
        expect(buf.length).toBeGreaterThan(10000);
        expect(buf.subarray(0, 3).equals(jpegMagic), `${file} should be a valid JPEG`).toBe(true);
      }
    });
  });

  describe('i18n Support & Donation Dictionaries', () => {
    it('provides complete support and donation entries for zh-CN with pure Chinese branding', () => {
      expect(zhCN.support.title).toBe('❤️ 支持与赞赏');
      expect(zhCN.support.devTitle).toBe('打赏开发者');
      expect(zhCN.support.devDesc).toContain('喝杯咖啡');
      expect(zhCN.support.donateButton).toBe('赞赏支持');
      expect(zhCN.support.channelXiaohongshu).toBe('小红书');
      expect(zhCN.support.channelWeibo).toBe('微博');
      expect(zhCN.support.channelEmail).toBe('合作邮箱');

      expect(zhCN.donation.modalTitle).toBe('赞赏支持开发者');
      expect(zhCN.donation.modalSubtitle).toContain('片刻');
      expect(zhCN.donation.modalSubtitle).not.toContain('Take Five');
    });

    it('provides complete support and donation entries for en with pure English branding', () => {
      expect(en.support.title).toBe('❤️ Support & Sponsor');
      expect(en.support.devTitle).toBe('Support the Developer');
      expect(en.support.devDesc).toContain('coffee');
      expect(en.support.donateButton).toBe('Sponsor');
      expect(en.support.channelXiaohongshu).toBe('Xiaohongshu');
      expect(en.support.channelWeibo).toBe('Weibo');
      expect(en.support.channelEmail).toBe('Contact Email');

      expect(en.donation.modalTitle).toBe('Support the Developer');
      expect(en.donation.modalSubtitle).toContain('Take Five');
      expect(en.donation.modalSubtitle).not.toContain('片刻');
    });
  });

  describe('macOS Native Implementation', () => {
    it('verifies macOS desktop sources exist', () => {
      expect(existsSync(macosDir)).toBe(true);
      expect(getSwiftSources().length).toBeGreaterThan(0);
    });

    it('configures window default dimensions as 580x680 and smooth vertical ScrollView', () => {
      const content = readSwiftSource();

      // 580x680 window sizing
      expect(content).toContain('idealWidth: 580');
      expect(content).toContain('idealHeight: 680');
      expect(content).toContain('width: 580, height: 680');

      // Vertical ScrollView with indicators enabled for smooth scrolling
      expect(content).toContain('ScrollView(.vertical, showsIndicators: true)');
    });

    it('renders Card 5 SupportCommunityCard at the bottom of the Dashboard', () => {
      const content = readSwiftSource();

      expect(content).toContain('struct SupportCommunityCard: View');
      expect(content).toContain('// Card 5: Support & Community');
      expect(content).toContain('SupportCommunityCard(state: state');

      // Ensure Card 5 appears after Card 4 in the dashboard hierarchy
      const card4Index = content.indexOf('// Card 4: System Preferences & Controls');
      const card5Index = content.indexOf('// Card 5: Support & Community');
      expect(card4Index).toBeGreaterThan(-1);
      expect(card5Index).toBeGreaterThan(card4Index);

      // Support card elements
      expect(content).toContain('cup.and.saucer.fill');
      expect(content).toContain('heart.fill');
      expect(content).toContain('support.dev_title');
      expect(content).toContain('support.dev_desc');
      expect(content).toContain('support.donate_button');
    });

    it('renders social channels (Xiaohongshu, Weibo, Email) with browser open and clipboard copy', () => {
      const content = readSwiftSource();

      expect(content).toContain('support.channel_xiaohongshu');
      expect(content).toContain('support.channel_weibo');
      expect(content).toContain('support.channel_email');
      expect(content).toContain('https://www.xiaohongshu.com');
      expect(content).toContain('https://weibo.com');
      expect(content).toContain('xianshengxingge@163.com');

      // Clipboard copy & animation feedback
      expect(content).toContain('NSPasteboard.general');
      expect(content).toContain('state.copiedMessage =');
      expect(content).toContain('support.copied');
    });

    it('implements DonationModalView with Liquid Glass frosted backdrop and Alipay/WeChat switcher', () => {
      const content = readSwiftSource();

      expect(content).toContain('struct DonationModalView: View');
      expect(content).toContain('state.showDonationModal');
      expect(content).toContain('donation.modal_title');
      expect(content).toContain('donation.modal_subtitle');
      expect(content).toContain('xmark.circle.fill');

      // Liquid Glass frosted backdrop
      expect(content).toContain('LiquidGlassBackground');

      // Segmented Tabs for Alipay & WeChat
      expect(content).toContain('donation.alipay');
      expect(content).toContain('donation.wechat');
      expect(content).toContain('state.donationChannel = channel');

      // Dynamic QR code presentation (200x200)
      expect(content).toContain('loadAssetImage(named: "\\(state.donationChannel)_qr.jpg")');
      expect(content).toContain('.frame(width: 200, height: 200)');
      expect(content).toContain('donation.footer_note');
    });

    it('compiles modular macOS sources with swiftc with zero errors', () => {
      if (process.platform !== 'darwin' || !existsSync('/usr/bin/swiftc')) return;

      const outBin = join(tmpdir(), `takefive_support_test_${Date.now()}`);

      const envWithTools = {
        ...process.env,
        PATH: `/usr/bin:/bin:/usr/sbin:/sbin:/Library/Developer/CommandLineTools/usr/bin:${process.env.PATH || ''}`,
      };

      try {
        execFileSync('/usr/bin/swiftc', ['-O', ...getSwiftSources(), '-o', outBin], {
          env: envWithTools,
          stdio: 'pipe',
          timeout: 30000,
        });

        expect(existsSync(outBin)).toBe(true);
      } finally {
        try { unlinkSync(outBin); } catch {}
      }
    }, 30000);
  });

  describe('Windows Native Implementation', () => {
    it('verifies Windows desktop sources exist', () => {
      expect(existsSync(windowsDir)).toBe(true);
      expect(getCsSources().length).toBeGreaterThan(0);
    });

    it('configures window size as 580x680 and enables AutoScroll', () => {
      const content = readCsSource();

      expect(content).toContain('Size = new Size(580, 680);');
      expect(content).toContain('AutoScroll = true');
    });

    it('implements CreateSupportCard and positions it at the bottom of Dashboard', () => {
      const content = readCsSource();

      expect(content).toContain('CreateSupportCard()');
      expect(content).toContain('support.title');
      expect(content).toContain('support.dev_title');
      expect(content).toContain('support.dev_desc');
      expect(content).toContain('support.donate_button');
      expect(content).toContain('new DonationForm(appController)');
    });

    it('implements social channel links and email clipboard copy in CreateSupportCard', () => {
      const content = readCsSource();

      expect(content).toContain('support.channel_xiaohongshu');
      expect(content).toContain('support.channel_weibo');
      expect(content).toContain('support.channel_email');
      expect(content).toContain('https://www.xiaohongshu.com');
      expect(content).toContain('https://weibo.com');
      expect(content).toContain('Clipboard.SetText(email)');
      expect(content).toContain('support.copied');
    });

    it('implements DonationForm with channel switching and GetQrBitmap integration', () => {
      const content = readCsSource();

      expect(content).toContain('class DonationForm : Form');
      expect(content).toContain('donation.modal_title');
      expect(content).toContain('donation.modal_subtitle');
      expect(content).toContain('donation.alipay');
      expect(content).toContain('donation.wechat');
      expect(content).toContain('SwitchChannel("alipay")');
      expect(content).toContain('SwitchChannel("wechat")');
      expect(content).toContain('appController.GetQrBitmap(activeChannel)');
      expect(content).toContain('donation.footer_note');
      expect(content).toContain('donation.close');
    });

    it('implements GetQrBitmap with candidate paths for alipay_qr.jpg and wechat_qr.jpg', () => {
      const content = readCsSource();

      expect(content).toContain('public Bitmap GetQrBitmap(string channel)');
      expect(content).toContain('channel.ToLowerInvariant() + "_qr.jpg"');
      expect(content).toContain('Path.Combine(baseDir, "assets", fileName)');
      expect(content).toContain('Path.Combine(baseDir, "runtime", "assets", fileName)');
    });
  });
});
