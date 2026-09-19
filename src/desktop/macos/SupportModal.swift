import Cocoa
import SwiftUI

// MARK: - Support & Community Card (Aligned with 简贴)
struct SupportCommunityCard: View {
    @ObservedObject var state: AppState
    var onOpenDonate: () -> Void

    private var lang: String { state.activeLanguage }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(L10n.tr("support.title", lang: lang), systemImage: "heart.circle")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.primary.opacity(0.9))
                .padding(.leading, 2)

            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Image(systemName: "cup.and.saucer.fill")
                                .foregroundColor(.orange)
                                .font(.system(size: 13))
                            Text(L10n.tr("support.dev_title", lang: lang))
                                .font(.body.weight(.medium))
                        }
                        Text(L10n.tr("support.dev_desc", lang: lang))
                            .font(.footnote)
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    Button(action: {
                        withAnimation(.spring(response: 0.28, dampingFraction: 0.8)) {
                            onOpenDonate()
                        }
                    }) {
                        HStack(spacing: 5) {
                            Image(systemName: "heart.fill")
                                .foregroundColor(.pink)
                                .font(.system(size: 11))
                            Text(L10n.tr("support.donate_button", lang: lang))
                                .font(.subheadline.weight(.semibold))
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .liquidGlassBadge(isCapsule: true, tintColor: .pink)
                    }
                    .buttonStyle(.plain)
                    .help(L10n.isZh(lang) ? "打开打赏支持二维码弹窗" : "Open donation QR code popup")
                }

                Divider().opacity(0.25)

                VStack(spacing: 6) {
                    ForEach(SocialLinkItem.standardItems) { item in
                        SocialLinkRow(item: item, lang: lang, state: state)
                    }
                }
            }
        }
        .padding(14)
        .liquidGlassCard()
    }
}

// MARK: - Donation Modal View (Alipay & WeChat Switcher, Aligned with 简贴)
struct DonationModalView: View {
    @ObservedObject var state: AppState

    private var lang: String { state.activeLanguage }

    var body: some View {
        ZStack {
            LiquidGlassBackground(material: .fullScreenUI, blendingMode: .withinWindow)
                .ignoresSafeArea()
            Color.black.opacity(0.45)
                .ignoresSafeArea()
                .onTapGesture {
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.8)) {
                        state.showDonationModal = false
                    }
                }

            VStack(spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            Image(systemName: "cup.and.saucer.fill")
                                .foregroundColor(.orange)
                                .font(.system(size: 16, weight: .bold))

                            Text(L10n.tr("donation.modal_title", lang: lang))
                                .font(.headline.weight(.bold))
                        }

                        Text(L10n.tr("donation.modal_subtitle", lang: lang))
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Spacer()

                    Button(action: {
                        withAnimation(.spring(response: 0.28, dampingFraction: 0.8)) {
                            state.showDonationModal = false
                        }
                    }) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 20))
                            .foregroundColor(.secondary.opacity(0.8))
                    }
                    .buttonStyle(.plain)
                    .help(L10n.isZh(lang) ? "关闭 (ESC)" : "Close (ESC)")
                }

                HStack(spacing: 8) {
                    channelTab(
                        title: L10n.tr("donation.alipay", lang: lang),
                        channel: "alipay",
                        icon: "creditcard.fill",
                        brandColor: Color(red: 0.09, green: 0.48, blue: 0.98)
                    )
                    channelTab(
                        title: L10n.tr("donation.wechat", lang: lang),
                        channel: "wechat",
                        icon: "qrcode",
                        brandColor: Color(red: 0.04, green: 0.74, blue: 0.36)
                    )
                }

                VStack(spacing: 10) {
                    if let img = loadAssetImage(named: "\(state.donationChannel)_qr.jpg") {
                        Image(nsImage: img)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 200, height: 200)
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .stroke(Color.primary.opacity(0.12), lineWidth: 1)
                            )
                            .shadow(color: Color.black.opacity(0.15), radius: 8, x: 0, y: 3)
                    } else {
                        VStack(spacing: 8) {
                            Image(systemName: "qrcode")
                                .font(.system(size: 40))
                                .foregroundColor(.secondary.opacity(0.6))
                            Text(L10n.isZh(lang) ? "\(state.donationChannel == "wechat" ? "微信" : "支付宝")收款码筹备中" : "QR code preparing...")
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)
                        }
                        .frame(width: 200, height: 200)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Color.secondary.opacity(0.08)))
                    }

                    Text(state.donationChannel == "wechat"
                        ? (L10n.isZh(lang) ? "使用微信扫一扫打赏" : "Scan with WeChat to tip")
                        : (L10n.isZh(lang) ? "使用支付宝扫一扫打赏" : "Scan with Alipay to tip"))
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }

                HStack(spacing: 4) {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 11))
                        .foregroundColor(.pink)

                    Text(L10n.tr("donation.footer_note", lang: lang))
                        .font(.system(size: 11, weight: .regular))
                        .foregroundColor(.secondary)
                }
                .padding(.top, 2)
            }
            .padding(20)
            .frame(width: 360)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(NSColor.windowBackgroundColor))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color(NSColor.separatorColor), lineWidth: 0.5)
            )
            .shadow(color: Color.black.opacity(0.35), radius: 24, x: 0, y: 12)
        }
    }

    private func channelTab(title: String, channel: String, icon: String = "qrcode", brandColor: Color) -> some View {
        let isSelected = state.donationChannel == channel
        return Button(action: {
            withAnimation(.easeInOut(duration: 0.18)) {
                state.donationChannel = channel
            }
        }) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold))
                Text(title)
                    .font(.subheadline.weight(isSelected ? .bold : .medium))
            }
            .foregroundColor(isSelected ? brandColor : .secondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isSelected ? brandColor.opacity(0.14) : Color.secondary.opacity(0.08))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(isSelected ? brandColor.opacity(0.6) : Color.clear, lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }
}
